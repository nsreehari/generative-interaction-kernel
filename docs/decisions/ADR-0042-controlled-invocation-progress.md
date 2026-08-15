# ADR-0042: Controlled invocation progress with terminal settlement

**Status:** Proposed

**Adopted and generalized by:** [ADR-0049](ADR-0049-stable-event-contracts-and-effect-settlements.md) applies stable terminal settlements to `invoke`, `route`, and `request`.

## Context

An `invoke` currently has one observable output. The Orchestrator returns one
`OrchestratorResult`, and the kernel waits for it, applies its operations and follow-up events, then
returns one fully settled patch. This works for short tool calls but cannot represent useful
in-flight observations from agent runs, uploads, long jobs, SSE feeds, websockets, or watchers.

Adding a `subscribe` action or effect kind would misidentify the missing primitive. A finite agent
run and an indefinite feed need the same control semantics: one invocation can report progress while
active and settles exactly once. Whether its implementation uses a callback, queue, async iterator,
or subscription is not part of the document grammar.

There is also a cost boundary. AI text can arrive token by token, but sending every token through the
kernel would turn local rendering activity into global revisions, behavior work, replay volume, and
journal noise. Most partial text is owned only by the active chat widget. Other in-flight events,
such as a tool call beginning, approval being requested, or shared agent state changing, can be
significant to the wider runtime before the invocation finishes.

GIK already has a document action named `emit`. It synchronously emits a document event during pure
reduction. Invocation control must not change or overload that closed-grammar action.

## Decision

### One controlled invocation, one terminal settlement

An ordinary document `invoke` starts a controlled invocation. No `subscribe` action or effect kind
is added.

The Orchestrator receives an invocation control with two distinct operations:

```ts
interface InvocationControl {
  readonly id: InvocationId;
  readonly signal: AbortSignal;
  emitProgress(progress: OrchestratorProgress): Promise<void>;
  emit(result?: OrchestratorResult): Promise<void>;
}
```

- `control.emitProgress(...)` publishes an ordered, non-terminal observation. It leaves the
  invocation active.
- `control.emit(...)` is terminal. It settles the invocation exactly once, applies the terminal
  result through the kernel, and closes the invocation.
- Handler failure and cancellation also close the invocation through kernel-owned terminal paths.
- Progress or settlement after close is rejected deterministically and cannot regain mutation
  authority.
- Both operations are awaitable. The runtime can apply backpressure and guarantees that terminal
  settlement is ordered after all previously accepted progress.

The document action remains `{ "do": "emit" }`. Documentation and code refer to the new operations
as `control.emitProgress` and `control.emit` to keep the two surfaces unambiguous.

Legacy Orchestrators may continue returning `OrchestratorResult | void`. A non-void return adapts to
one terminal `control.emit(result)`. A void return implicitly settles with no result unless the
handler already settled explicitly. Explicit settlement followed by a non-void return is a
duplicate-settlement error.

Controlled progress applies to `invoke`. `confirm`, `route`, and `compensate` retain their current
one-shot contracts; broadening them requires a separate decision.

### Progress is observational, not mutation

`OrchestratorProgress` is JSON-only output with an application-facing name and optional detail. It
carries no `PatchOp` and no follow-up `GIKEvent`:

```ts
interface OrchestratorProgress {
  name: string;
  detail?: Record<string, Json>;
}
```

- it does not mutate the `StateModel`;
- it does not increment `rev`;
- it does not run document behavior;
- it does not enter `effectsSince`; and
- it is not replayed from checkpoints or the patch log.

The kernel publishes it with invocation identity and ordering metadata. Embedded consumers receive
the same progress envelope in process that remote consumers receive over the protocol. A bounded
diagnostic sink may retain it, but that trace is not authoritative state.

Progress event names are host/provider vocabulary rather than manifest action vocabulary. They do
not drive document reduction. A view or host may render or observe them; document behavior that must
react deterministically uses explicit durable state and ordinary patches instead.

An application that decides a particular progress value is important enough to retain promotes it
explicitly through an ordinary GIK event. The document handles that event with its existing actions
and produces a normal revisioned patch. For example, a download view may treat frequent percentages
as transient progress but emit `record-progress` at an application-chosen checkpoint. This keeps the
durability policy in the application, where the meaning and cost are known, rather than in the
generic progress transport.

`emitProgress` therefore has no `durable`, `replay`, `critical`, or `final` flag. A progress value is
always transient; an event is the explicit boundary into durable behavior; terminal `emit` is the
explicit boundary into settlement. These separate operations avoid a conditional result type whose
semantics change according to flags.

Progress never contains durable intermediate operations. Such operations are not a mode of
`emitProgress`; they must use a separately defined kernel mutation/effect path and require a separate
decision. Providers must never mutate a `StateModel` directly from a progress callback.

### Invocation lifetime is detached from mutation serialization

The initiating event is reduced and committed before external invocation work runs. The initial
dispatch therefore returns its initiating patch without waiting for the invocation's lifetime.

Terminal `control.emit` re-enters the kernel's serialized mutation path. Its final operations and
follow-up events settle into a later patch with a later revision. Kernel patch subscribers let an
embedded controller and a transport host observe and broadcast that asynchronous patch. The effect
journal records the issued effect once with its invocation identity; it does not record progress as
new effects.

This supersedes the unrestricted rule from ADR-0009 and ADR-0025 that all Orchestrator settlement
always folds into the initiating dispatch and revision. That rule remains true for the unchanged
one-shot `confirm` and `route` paths. A controlled `invoke` instead has one initiating patch and at
most one later terminal settlement patch.

The active invocation registry is kernel-owned. Each invocation has a distinct id, including
concurrent calls from the same node to the same tool. Runtime disposal and explicit cancellation
abort its signal and close its authority. Supersession and node-owned cancellation are host policy,
not universal defaults; React component unmount alone does not prove that domain work should stop.

Checkpoints contain pure state only. Restoring a checkpoint does not resume an invocation.

### AI chat widgets keep token streaming local

An AI/AG-UI adapter uses three storage and delivery strengths:

```text
text/token delta ------------> widget-local streaming buffer
significant in-flight event -> control.emitProgress
durable shared state --------> explicit kernel operation
final result ----------------> control.emit
```

Text deltas used only to paint the active response stay in component or adapter-local state. They do
not call `emitProgress`, increment revisions, or enter the effect journal.

`emitProgress` is used when another runtime participant must observe an event before completion, for
example:

- run started or changed phase;
- tool call acquired a stable identity, started, completed, or failed;
- an approval phase started or other human input may soon be required;
- a recoverable error or retry milestone occurred;
- non-authoritative agent lifecycle information changed in a way another view or host consumes; or
- a usage or observability milestone matters while the run is active.

Partial tool arguments and private state deltas remain local when they are merely rendering data.
The classification is based on ownership: if losing the value when that widget disappears does not
affect shared behavior or the final result, it stays local. If another participant must react while
the invocation is active, it is progress. If it must survive restore or deterministically drive the
document, it is explicit kernel state.

A progress message may announce that an approval phase began, but the actionable approval request
itself must use durable state or the existing `confirm` contract. Likewise, behavior-driving shared
agent state cannot exist only in progress. Best-effort progress may be lost, so it must never be the
sole representation of an obligation, authorization decision, or shared truth.

### Progress is a GIK protocol message

Invocation progress is portable across kernel placement. GIK adds a sixth message type,
`progress`, from kernel host to renderer/client:

```json
{
  "gik": "0.1",
  "type": "progress",
  "payload": {
    "invocationId": "inv-42",
    "seq": 3,
    "node": "chat",
    "effect": "invoke",
    "tool": "ask",
    "name": "tool-started",
    "detail": { "tool": "search" }
  }
}
```

`invocationId`, `seq`, `node`, `effect`, and `name` are required. `tool`, `actorId`, and `detail` are
optional. The payload is JSON-only. The kernel assigns the invocation id and a zero-based,
monotonically increasing sequence number; the provider supplies only `name` and `detail`.

Progress delivery has deliberately weaker guarantees than patches:

- Messages are ordered by `seq` within one invocation. No total order is promised across
  invocations.
- Progress is best-effort and live-only. It is not revisioned, checkpointed, added to the patch log,
  or replayed after reconnect. A reconnecting or newly attached client starts with current durable
  state and sees only subsequent progress.
- Sequence gaps are legal and tell a consumer that live-only observations were missed. Consumers
  must not infer durable state from progress.
- The host rejects progress after terminal settlement or cancellation. Transport ordering on one
  connection preserves accepted progress before the terminal patch emitted by that invocation.
- `emitProgress` awaits admission into the kernel's ordered progress path, not acknowledgement from
  every remote client. Each connection uses a bounded delivery queue; a slow or disconnected client
  may lose progress but cannot block invocation execution or kernel mutation.
- Progress is broadcast through the same connection authorization boundary as the document and
  patches. Providers must treat `detail` as renderer-visible data and must not include secrets or
  unrestricted model/tool internals.

`GIKClient` exposes progress subscriptions. Render adapters route an envelope to the view instance
associated with its `node` and invocation; they do not apply it to the state replica or feed it into
the reducer. A widget may use progress to update local presentation state. Hosts may also subscribe
for observability or coordination that does not require replay.

Raw token streaming is not carried as GIK progress merely because it is remote. An AI protocol such
as AG-UI can carry text deltas directly to its adapter, which updates widget-local state. GIK
progress carries selected significant lifecycle observations across placements.

Existing `patch` messages continue to carry initiating, durable, and terminal state. Progress must
not be smuggled into a patch, and durable state must not rely on delivery of progress.

### Conformance

The language-neutral conformance format will script controlled invokes as ordered progress entries
followed by one terminal result. A canonical case must prove:

1. progress is delivered in order and does not settle or allocate revisions;
2. terminal emit occurs after accepted progress and creates the terminal patch;
3. stale progress and duplicate settlement are rejected without mutation;
4. two invocations of the same node/tool have distinct identities; and
5. cancellation aborts the signal and revokes later output;
6. embedded and transported consumers observe the same envelope and per-invocation sequence; and
7. reconnect replays patches but not progress.

The existing complete-document decision in ADR-0022 is unchanged. This ADR concerns output during
an effectful invocation after a complete document is running, not incremental document assembly. It
corrects ADR-0022's statement that Orchestrator follow-up patches already stream within a dispatch:
the current implementation waits for one result and has no in-flight progress channel.

## Alternatives considered

- **Add `subscribe` and `cancel` to the closed document grammar.** Rejected: duration does not define
  a distinct effect. It would duplicate `invoke` and expose an internal lifecycle mechanism as an
  authoring concept.
- **Add `final: false` to the terminal result.** Rejected: it weakens the meaning of settlement and
  makes every consumer branch on a flag. Separate control operations make illegal states harder to
  express: progress never settles and emit always settles.
- **Send every token as a kernel operation.** Rejected: local paint data would cause unnecessary
  global mutation, revision churn, behavior work, and replay growth.
- **Add durability or replay flags to progress.** Rejected: a flag would make one message sometimes
  transient and sometimes authoritative, forcing every kernel, transport, and consumer to branch on
  hidden persistence semantics. Applications already have the explicit event-to-patch path for
  retaining selected values.
- **Keep all progress local to the effect handler.** Rejected: tool lifecycle, approval, shared-state,
  and observability events can matter to other runtime participants before completion.
- **Keep the invocation inside the current dispatch promise.** Rejected: a long-running or indefinite
  invocation blocks the React controller and transport host queues, preventing unrelated events and
  making cancellation/disposal fragile.
- **Keep progress in-process and let each transport invent a side channel.** Rejected: it makes the
  capability placement-dependent and causes HTTP/SSE, WebSocket, and embedded hosts to expose
  different invocation semantics.
- **Use `trace` as the wire representation.** Rejected: traces are diagnostic and optional, while
  progress is application-facing input to transient presentation. Conflating them would expose
  diagnostic policy as UI behavior.
- **Replay progress after reconnect.** Rejected: progress is explicitly non-authoritative and may be
  high-volume. Reconnect reconstructs durable truth from patches; replaying stale in-flight
  observations could regress presentation after settlement.

## Consequences

- Documents retain the existing six action families and ordinary `invoke` authoring model.
- The reducer remains pure; invocation time, I/O, progress, and cancellation stay on the
  Orchestrator boundary.
- AI widgets can stream text smoothly in local state without making the kernel a token transport,
  while significant in-flight events remain observable.
- The GIK protocol has six message types. Clients and transports that do not recognize `progress`
  continue to operate on documents and patches but do not render in-flight observations.
- Progress is portable but intentionally lossy; applications cannot use it as hidden state.
- Invocation details become renderer-visible data and therefore share the document/patch connection's
  authorization and redaction requirements.
- A controlled invoke's final result lands in a later revision, so ADR-0009, ADR-0010, ADR-0023,
  ADR-0025, the conformance contract, and protocol documentation are superseded where they require
  one fully settled patch per event or describe exactly five messages.
- Existing one-shot provider source remains adaptable, but tests that assume invoke settlement is in
  the initiating patch must be updated.
- Durable progress mutation, supersession policy, node ownership, and compensation of intermediate
  durable effects are outside this decision.
