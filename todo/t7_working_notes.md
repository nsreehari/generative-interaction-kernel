# T7 - Governed work beyond the interface - working notes

> Scope: Beat 4 medium transversality. Prove that a GIK interaction is authoritative work that
> humans, agents, devices, and background processes can leave and rejoin without losing state,
> causality, or authority.
>
> Status: **PHASE 1 PROTOCOL FIXTURE IMPLEMENTED (2026-07-15); PRODUCT PROOF REFRAMED
> (2026-07-16).** The control-host proves transport-isolated continuation and revision resume against
> one running in-memory authority. The next workstream is a real migration of Demo Boards to public
> GIK packages, reusing its hosted runtime, persistence, queue, MCP, and SSE infrastructure. Beat 4
> continuity becomes acceptance evidence from that migrated application, not a separate proof app.

## 1. Claim and audience

T7's claim is not merely that MCP and SSE work:

> The interface is a projection onto governed work, not the container that owns the work. A client
> may detach while safe work continues, then rejoin the same substrate with state, attribution,
> causal history, and authorization boundaries intact.

The primary audience is application architects and product stakeholders:

- architects need evidence that the UI is not a hidden application runtime or source of truth;
- product stakeholders need a visible journey that is meaningfully different from an AI feature
  embedded in one page;
- agent-platform engineers need a transport-neutral participation surface that does not require
  browser automation or bespoke UI APIs;
- security and operations stakeholders need proof that unattended work does not bypass policy,
  role, confirmation, or audit boundaries.

## 2. Existing systems and migration target

T7 should explicitly build on two existing integration proofs.

### `yaml-flow/examples/board/test/server-http-test.js`

This test already demonstrates:

- server-owned board state and computation;
- headless HTTP mutations without a connected UI;
- SSE as an optional observation channel;
- persisted cards, files, chat state, and computed values;
- disconnect/reconnect using `Last-Event-ID`;
- recovery through a complete authoritative snapshot with a continuing frame identity.

It proves the core transport and hydration mechanics and remains a useful behavioral reference. It
is not the primary migration target unless Demo Boards still consumes a specific `yaml-flow` module
that should remain as domain or storage infrastructure behind a GIK boundary.

### `demo-boards-ns-code/demo-board/test/my-http-test.js`

This is the stronger topology reference. It already demonstrates:

- a hosted runtime as the authority;
- HTTP/MCP command, query, action, and control-plane surfaces;
- a separate queue runner performing asynchronous work;
- SSE consumers applying the same state reduction used by the frontend;
- one-shot hydration of current authoritative state;
- persisted boards, cards, attachments, chat turns, and layout metadata;
- multiple concurrent operations sharing one runtime;
- a public-versus-control-plane visibility boundary.

This is the backend migration target, together with `demo-boards-frontend` as the active projection
client. Its hosted runtime, storage, queue runner, MCP surfaces, SSE lifecycle, and deployment shape
should be retained where they are mature. GIK should replace the bespoke interaction/runtime
contract rather than needlessly replacing application infrastructure or domain processing.

## 3. Migration decision

T7 is now an acceptance dimension of a real Demo Boards migration, not the reason for a purpose-built
sample. The target is:

```text
demo-boards-ns-code
  -> hosted GIK authority
  -> existing persistence and queue infrastructure behind GIK boundaries
  -> ControlFace / AgentFace
  -> MCP and SSE transports

demo-boards-frontend
  -> @gik/react projections
  -> GIK hydration and event dispatch
  -> one authoritative hosted substrate
```

The migration must consume published preview packages or `npm pack` artifacts. Demo Boards must not
reach into GIK source with relative imports or depend on private monorepo modules. Missing surfaces
are public-package gaps to resolve in GIK.

Migration should be incremental but directional. A bounded vertical slice is the first unit, not a
permanent side demo. For each slice, authority must be explicit:

- before cutover, the existing Demo Boards runtime owns the slice;
- after cutover, GIK owns interaction state, revisions, events/effects, attribution, and authority;
- compatibility adapters translate at the boundary;
- indefinite dual writes, shadow state, and parallel frontend truth are not acceptable.

The migration is complete when background work, browser and native projections, MCP clients, and
the hosted runtime operate on the same GIK substrate and the replaced bespoke interaction path can
be removed.

## 4. GIK-specific migration acceptance

The board tests establish hosted and headless mechanics. The migrated system must add evidence for
GIK's particular contract:

1. **One authoritative GIK substrate.** Server state and revision identity remain authoritative;
   browser, native, MCP, and worker clients do not maintain competing application truth.
2. **One event/effect contract.** Headless work enters through the same governed operation surface as
   interactive work rather than a privileged side channel.
3. **Durable attribution.** Initiator, contributor, operation, result, and affected state remain
   identifiable after disconnect and resume.
4. **Causal recovery.** A returning projection receives current state plus enough causal history to
   explain what changed during its absence.
5. **Authority continuity.** Work allowed to proceed may continue unattended; consequential work
   remains blocked until the required human role authorizes or redirects it.
6. **Cross-projection continuity.** A different projection can join the same work and render the
   current substrate without reconstructing a separate session.

T7 does not require command replay or transport-frame replay as an end in itself. A valid resume
contract may be:

```text
authoritative snapshot
  + current revision
  + causal journal entries since the client's known revision
```

Delta replay is useful when available, but snapshot-plus-causal-history is sufficient if it restores
state and explanation deterministically.

## 5. Implemented Phase 1 fixture

The GIK `control-host` has a `continuity` demo mode over one `ControlFace`:

```text
SSE renderer attaches at rev 0
  -> renderer disconnects
MCP control queues work
  -> kernel commits rev 1, requestedBy=mcp-control
headless worker reads state through agent-safe MCP
  -> worker completes through control-plane MCP
  -> kernel commits rev 2, completedBy=background-worker
agent-safe MCP reads the completed shared state
SSE renderer resumes from rev 0
  -> receives patch rev 1 and patch rev 2
  -> receives no duplicate manifest or document onboarding
```

The worker in `samples/apps/controlface-host/continuity-worker.ts` has no kernel, store, or face reference. It
communicates only through HTTP MCP endpoints and can therefore run in another process or host.

`samples/apps/controlface-host/service.test.ts` proves:

- the SSE renderer can detach before work begins;
- MCP queues the job through an ordinary event;
- a transport-only worker observes and completes the job;
- shared state records requester, completer, status, and result;
- read-only MCP observes completion without drive privilege;
- SSE resume returns exactly the missed revisions without duplicate onboarding.

Focused validation:

```bash
npx vitest run --project samples samples/apps/controlface-host/service.test.ts
```

Manual two-process run:

```bash
GENUI_CONTROLFACE_DEMO=continuity npm run dev:controlface
npm run dev:continuity-worker
```

This fixture proves that GIK's current protocol surfaces can support detached participation. It is a
narrow conformance proof, not the target hosted product architecture.

## 6. Beat 4 evidence from the migrated application

Once the migrated vertical slice works normally, Beat 4 should select an ordinary journey from it
and make the continuity property visible without introducing a special execution path:

```text
Morgan starts governed work from an interactive projection
  -> the hosted GIK runtime persists the work and attribution
the projection disconnects
  -> a background agent continues the safe investigative portion
  -> a consequential operation remains blocked for Priya
Priya joins from another projection
  -> current state and missed causal entries hydrate
  -> Priya authorizes, rejects, or redirects the pending operation
the operation completes
  -> every projection observes one result and one causal record
```

MCP, SSE, queue processing, hydration, and revision identity are supporting evidence. The audience
should primarily see a complete application whose governed work naturally survives changes in
interface and participant, not a reconnect counter or a T7-only demo.

## 7. Explicit proof boundary

Phase 1 does **not** prove:

- state or causal-history survival after the authority process restarts;
- durable queue leasing, retry, deduplication, or poison-job handling;
- stable user identity and authorization across reconnect;
- multiple authority processes coordinating through shared storage;
- network-partition conflict resolution;
- exactly-once distributed execution;
- long-running work surviving termination of its worker process.

The board-runtime precedents prove several adjacent storage and queue mechanics, but they do not by
themselves prove migration to GIK or the GIK attribution, governance, and cross-projection chain.

## 8. Migration phases

1. Inventory current Demo Boards board, card, chat, attachment, queue, SSE, source-processing, and
  control-plane behavior as migration parity criteria.
2. Install public GIK packages in `demo-boards-ns-code` and host one GIK substrate per migrated board
  without using monorepo-relative source imports.
3. Adapt existing persistence behind GIK's state boundary and define snapshot, revision, and causal
  resume semantics without introducing a second persistent truth.
4. Move one vertical slice of card/chat mutations through GIK events and effects; existing HTTP
  endpoints may remain temporarily only as adapters into that authority.
5. Move the slice's background processing through the existing queue runner with GIK operation,
  actor, authorization, revision, and idempotency identity.
6. Migrate the corresponding `demo-boards-frontend` route to GIK hydration, projections, and event
  dispatch while reusing existing visual components as projection views where practical.
7. Cut over additional slices, remove replaced reducers and mutation paths, and prevent indefinite
  dual operation.
8. Use the functioning migrated journey to validate disconnect, background continuation, blocked
  consequential work, cross-projection hydration, human authorization, and causal explanation.
9. Represent the deployed topology and honest proof boundaries in the Deployment Atlas UI.

A new clean-room repo may later document the minimum public-package setup, but it is not the primary
migration or Beat 4 evidence. The immediate design question is which existing Demo Boards vertical
slice provides the smallest real authority cutover while exercising hosted state, queue work, and a
frontend projection end to end.