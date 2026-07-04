# Discussion Log

A chronological record of the design conversation that produced this platform, including options
raised and the reasoning behind each turn. Decisions are formalized as ADRs under
[decisions/](decisions/README.md); this log is the narrative.

---

## 1. Starting point — "generalize the component registry"

The conversation began as a code-review question: an existing React system had a unified
`kind → component` registry and an interpreter that resolved a node's kind, variant, data,
validation, children, and framing. The initial idea was to generalize a single component into a
reusable "generative UI component."

**Considered:** treating the existing registry/interpreter as the thing to package.
**Why not pursued as the goal:** this would standardize *one* implementation rather than expose a
reusable contract. It was kept as evidence that the pattern works, not as the deliverable.

## 2. Platform-readiness assessment

The existing three-repo system was assessed as a candidate "GenUI platform."

**Confirmed already present (HAVES):** a registry/trust-catalog, a machine-readable per-kind
schema (a mature JSON Schema DSL), a server-side validation engine, a metadata-over-data model
(agents emit configuration/binding, not inline data), an MCP orchestration layer, an SSE
transport, governance/design-system scoping, and SDK packaging.

**Confirmed gaps (motivation):** progressive generative streaming, observability/tracing,
human-in-the-loop approval, render-boundary error isolation, and an open extension surface.

**Corrections made during assessment (recorded so they are not repeated):**
- Initially called "machine-readable prop schema" the biggest gap — **wrong**; a mature per-kind
  constrained schema already existed.
- Initially called "a validation engine" a gap — **wrong**; structural + semantic validation
  already ran at the authoring/server boundary.
- Initially claimed "three drifting schema copies" — **overstated**; the only real difference was
  one `minItems` constraint. A genuinely duplicated, unreferenced schema copy was removed.

**Lesson:** the inspiring system was more mature than first assessed; verify before asserting gaps.

## 3. Begin standardizing the DSL — then the decisive pivot

Work briefly moved to standardizing the existing DSL (single source of truth for the schema).
The user then reframed decisively:

> "The goal is not standardizing my current package or code. I want to evolve a **platform** where
> I specify 'this is my DSL, this is my registry, etc.', and *that platform* is what I'm looking
> for."

**Decision:** build a generic platform; the existing DSL/registry/app is **one profile (the first to
onboard)**,
not the target. → [ADR-0001](decisions/ADR-0001-closed-grammar-kernel.md).

## 4. Kernel boundary — closed grammar vs pluggable grammar

**Options:**
- (A) Kernel fixes the *universal node grammar* (`kind/id/bind/writeTo/children/visible`) and makes
  kinds/specs/data/components pluggable.
- (B) The grammar itself is consumer-defined (a parser-generator style).

**Chosen: (A).** The "closed grammar vs open spec" split is exactly the kernel/provider line.
**Why (B) was rejected:** if the grammar is pluggable there is nothing left to standardize — you
lose the interpreter, the validator, and the tool-catalog generator that make it a *platform*.
The value is in fixing the grammar and freeing the vocabulary. → [ADR-0001].

## 5. Interactions — a missing edge, not a second kernel

The user observed that neither intra-component nor inter-component *interactions* were covered,
and asked whether a "meta DSL / meta kernel" was needed.

**Options:**
- (A) Add a separate meta-kernel layer for interactions.
- (B) Promote interaction to a **first-class behavior edge** (`event → action → target`) inside the
  existing closed grammar, symmetric with `read`/`write`.

**Chosen: (B).** Behavior becomes the sixth edge; cross-component interaction falls out for free
because an action writes to a shared namespace that another node already reads (same graph). The
genuine "meta" level is the **Manifest** (capability/event/action vocabulary), not a second kernel.
**Why (A) was rejected:** a second kernel duplicates interpretation, validation, and tracing, and
splits the graph; the extra declarative level that interactions demand is the Manifest, which
already exists to declare kinds. → [ADR-0002](decisions/ADR-0002-interaction-as-edge.md).

## 6. State — stateless events vs stateful sequencing

The user preferred stateless events but noted stateful sequencing can't be ignored, and asked how
to achieve stateful mechanisms.

**Options:**
- (A) Stateless event → action map only.
- (B) Stateful sagas as a kernel primitive (awaits, retries, timers, durable execution).

**Chosen: (A) as the law, with sequencing expressed as data.** A state machine is **declarative
data + a stateless `reduce(state, event) → state`**; current state lives in a namespace value;
async is modeled as *states*, with real awaiting exiled to the Orchestrator provider.
**Why (B) was rejected as a kernel primitive:** durable execution semantics make validation and
agent-authoring materially harder and force the kernel to own time and memory, breaking the pure
reducer law. Durability belongs in a provider. → [ADR-0003](decisions/ADR-0003-stateless-events-with-reducer.md).

## 7. Zoom out — generic platform layer

The user directed: *"Ignore what I have; we want a generic platform layer."* The model was
re-expressed in fully domain- and framework-neutral terms: a generic object model
(Document/Node/Edge/Capability/Store/Action/Event/Machine), eight provider contracts, six kernel
invariants, and a generic runtime pipeline. → [docs/02-architecture.md](../docs/02-architecture.md).

## 8. Delivery — SDK vs protocol

**Options:**
- (A) In-process **SDK** (one language, providers as objects, documents as in-memory structures).
- (B) **Protocol + kernel** (Document and state-delta formats are a language-neutral wire contract;
  any conforming runtime can speak it).

**Chosen: (B).** This makes the Document a portable, storable, diffable, replayable artifact and
lets renderers in different frameworks and an out-of-process orchestrator all conform.
**Why (A) was rejected:** language-bound; a single document can't drive multiple frameworks; the
orchestrator can't live out-of-process. (A) is "a nice library," (B) is "a platform." →
[ADR-0004](decisions/ADR-0004-protocol-over-sdk.md).

## 9. The protocol — GUP

The GenUI Protocol was defined: one envelope, five messages (`manifest`, `document`, `patch`,
`event`, `trace`), and protocol invariants (renderers consume documents+patches and emit events
only; renderers never patch the store directly; the store is authoritative kernel-side; documents
are valid only against a declared manifest; transport- and placement-agnostic). →
[docs/03-protocol.md](../docs/03-protocol.md).

## 10. This repository

Created to capture the design and drive the first concrete artifact (normative GUP schemas + a
conformance fixture).

## 11. Kernel placement — resolved

**Options:** (A) server-side kernel with thin renderers; (B) embedded kernel per renderer runtime.

**Chosen: hybrid, primarily embedded.** Because the users are **both agents and humans** and agents
*generate* the UX by streaming documents, materialization and reduction must happen next to the
human for interaction to feel live; a server kernel is retained only as an optional authority /
reconciliation point for consequential actions and shared state. Accepted tradeoff: the (small,
pure) kernel core must run in each renderer runtime. Security note: embedded reduce is a latency
optimization, not a trust boundary. → [ADR-0005](decisions/ADR-0005-kernel-placement.md).

## 12. Render purity — storage/transport are not the renderer's concern

Raised: *why should rendering be concerned with storage/transport semantics?* **It should not.** The
`RenderAdapter` contract is strictly *resolved nodes + patches → events*; persistence, storage, and
transport live behind the kernel as providers. Embedded co-location is a deployment fact, not an API
coupling. → [ADR-0006](decisions/ADR-0006-render-adapter-infra-agnostic.md).

## 13. First onboarding profile selected + first build artifact

The **live-cards** profile (yaml-flow + demo-boards-ns-code + demo-boards-frontend) was selected as
the **first profile to onboard** — a pragmatic pilot adopter, not a canonical reference — and mapped
onto every provider seam ([04-first-onboarding-profile.md](04-first-onboarding-profile.md)), with a
fit assessment (maps cleanly / needs adapter / genuine gap or residue) and the rule that the kernel
is not bent to fit the profile. Remaining open decisions were parked in
[not-yet-decided.md](not-yet-decided.md). The **first build artifact** was produced: the five
normative GUP draft-07 schemas + envelope, and a golden conformance fixture drawn from live-cards,
verified by a runner (`schemas/validate.mjs`) — all checks pass.

## 14. Phase 1 — the reference kernel (executable protocol)

The protocol was made **executable**: a small, pure TypeScript kernel (`kernel/`) that interprets a
`document` and reduces `event`s to `patch`es, verified by running the golden fixture (not just
validating it). Scope: interpreter (`gate → capability → props(read) → children`); pure reducer
(`assign`, `derive`, `emit`; declared machines via `reduce(state, event) → state`;
`invoke`/`navigate`/`confirm` traced and deferred to Phase 3); in-memory `StateModel`, a
`JsonataExpressionProvider`, and a manifest-derived `CapabilityRegistry`; validate-before-commit via
Ajv; an observability sink. Two decisions were recorded in
[ADR-0007](decisions/ADR-0007-reference-kernel-implementation.md): **TypeScript/JS first** (matches
the React renderer target and embedded placement) and **JSONata as the default `ExpressionProvider`**.
During implementation, a security review rejected reusing the live-cards profile's vendored
`jsonata-sync.cjs`: it is a profile-owned artifact (inverts the kernel→profile dependency), it is
JSONata v1.x inside a **critical** prototype-pollution advisory, and its only rationale (a sync UMD
build) is a profile deployment concern. The kernel instead depends on patched `jsonata@^2.2.1`
(0 vulnerabilities); its async `evaluate` makes the kernel eval path async, which aligns with the
async Orchestrator seam. The golden reduction contract and behavioral cases (gate visibility,
guard-skipped invoke, machine transition, rev sequencing, traces, malformed-document rejection) all
pass, alongside typecheck and schema conformance.
## 15. Phase 2 — first React render adapter (end-to-end loop)

The protocol was driven as a **live UI**: a first `RenderAdapter` in `adapters/react/`
([ADR-0008](decisions/ADR-0008-first-render-adapter-react.md)). A `ComponentRegistry` maps
capability → React component with a graceful fallback; a pure `renderNode` turns a `ResolvedNode`
tree into elements (invisible nodes render nothing, read-bound values arrive as props); a
framework-agnostic `GenUIController` runs the async `init → resolve → dispatch → re-resolve` loop; a
thin `useGenUI`/`GenUIRoot` binding wires it into React. Default live-cards components
(`board`/`metric`/`table`/`actions`) emit `rowSelect`/`tap`. Verified headlessly (no browser):
static-markup render of the seeded fixture, the gated `Approve` button appearing only after a row is
selected, component handlers calling `emit` with the right name/payload, and the fallback view for a
missing component — renderers never touch the store, only emit events. This resolved open item #3
(first renderer = React).

## 16. Phase 3 — Orchestrator seam (invoke/confirm/navigate + async data)

The three effectful actions were made real without breaking reducer purity
([ADR-0009](decisions/ADR-0009-orchestrator-effects.md)). The pure reducer now emits, alongside
`ops`/`traces`, a list of **`OrchestratorEffect`s** (it still performs nothing). After reduction the
kernel hands each effect to an **Orchestrator** provider (`invoke`/`confirm`/`navigate`), which owns
time and I/O and returns store `ops` and/or follow-up `event`s; the kernel applies them and
**recursively settles** follow-ups — **one dispatch = one rev**, a depth bound guarding runaway
chains. **Async data is modeled as machine states** (`idle → loading → ready`): the triggering event
moves the machine to `loading`, the Orchestrator's `resolved` event moves it to `ready`. `emit` stays
internal to the reducer queue; only these three cross the boundary. The default `NullOrchestrator`
traces unhandled effects and changes nothing. Verified by four new kernel tests: an async fetch
settling as a store delta + `idle→loading→ready` in one dispatch; a HITL `confirm` returning the
human's follow-up event that assigns status; a `navigate` reaching routing without touching the store;
and an unhandled invoke being safe. This resolved the "where does awaiting live" question and narrowed
open items #9 (confirm UX) and #10 (streaming).

## 17. Phase 4 — transport seam (GUP across a boundary)

The "protocol, not SDK" bet ([ADR-0004](decisions/ADR-0004-protocol-over-sdk.md)) was finally
exercised across a boundary ([ADR-0010](decisions/ADR-0010-transport-seam.md)). A minimal duplex
`TransportProvider` (`send`/`subscribe`) moves whole **GUP envelopes**; the five messages got concrete
types (`GupMessage`) and an `envelope(type, payload)` helper so both ends share one serialized shape.
A `KernelTransportHost` binds a kernel to a transport: on `start()` it publishes `manifest → document
→` init `patch`, then dispatches each inbound `event` and sends the resulting `patch` back — inbound
dispatch **serialized through a promise queue** for monotonic `rev`, non-`event` messages ignored (no
echo loop). A reference `createInMemoryTransportPair()` runs the full serialize→deliver→deserialize
loop headlessly. Two tests: a round-trip (`rowSelect` → `card_data.selected` patch at rev 1) and
post-`stop()` inertness. The renderer stays a pure event-emitter/patch-consumer — it never sees the
kernel, only the transport. This narrowed open item #7 (transport bindings: in-memory reference done;
SSE/WebSocket/stdio + reconnection/replay still open).

## 18. Phase 5 — client runtime (renders purely from the wire)

The transport only mattered if a renderer could run from it, so the client half landed
([ADR-0011](decisions/ADR-0011-client-runtime.md)). Two questions were forced: *who resolves?* and
*how does a fresh client get initial state?* Answer: the **authoritative reducer stays on the host;
interpretation moves to the client**. A `GenUIClient` consumes `manifest` (→ registry + empty
replica), `document` (→ tree), and each `patch` (→ applied to a **local state replica**), runs the
**pure interpreter** locally, and emits `event`s back — never touching the kernel. Reads are pure and
safe to duplicate; writes stay singular/authoritative on the host. Initial state is delivered by a new
`Kernel.baseline()`: a rev-0 patch carrying the *full* snapshot (every namespace, seeded data +
machine states), replacing the machine-only `init()` patch on the wire so a fresh client can
reconstruct a complete replica from one message. Verified headless: a client reconstructs full state
from the baseline (metric 150, two table rows, Approve hidden), then round-trips a `rowSelect` event
into a re-render with the gate opening — and stops after `stop()`. This is the read/write split made
physical: interpret + replica on the client, reducer + authority on the host. The React binding was
then generalized to a structural `GenUISource`, so the same `GenUIRoot`/`useGenUI` render whether
driven by the in-process controller or the transport-backed client — verified by a render-over-the-
wire test.
---

## 19. Phase 6 — reconnection (broker host, patch log, resume or full resync)

The transport assumed one stable link; real renderers drop and rejoin. `KernelTransportHost` became a
**broker** ([ADR-0012](decisions/ADR-0012-reconnection.md)): it attaches many connections, broadcasts
each dispatch patch to all, and keeps a bounded **patch log** (baseline + deltas). `attach(transport,
fromRev?)` is resume-aware — if `fromRev` is still in the log it replays *only* the missing deltas
(client keeps its replica), otherwise it full-resyncs (`manifest → document →` full snapshot at current
rev). A new `Kernel.snapshotPatch()` gives the current full state *without* re-seeding machine states
(so mid-session onboarding never clobbers live state, unlike `baseline()`/`init()`). `GenUIClient`
gained `rebind(transport)` (reconnect keeping the replica) and idempotent patch application (ignore
rev ≤ current; a `manifest` resets rev so full resync always applies). Reconnection added **no new GUP
message** — it is transport/host orchestration below the closed five. Verified headless: two clients
share a kernel; one drops, misses a rev, reconnects and catches up via a single replayed patch; a late
joiner full-syncs and sees the gate already open. Narrowed open item #7 (reconnection/replay done;
network bindings + `fromRev` transport + log persistence still open).
---

## 20. Phase 7 — agent-authoring path (typed builders, validate-before-commit, lint over throw)

A generic platform's producers are agents emitting GUP documents from manifest vocabulary, not people
hand-writing JSON. Added `kernel/src/authoring.ts` ([ADR-0013](decisions/ADR-0013-agent-authoring.md)):
typed constructors for the closed grammar (`node`, `document`, one per action family + `guarded`),
`authorDocument()` that envelopes + runs structural validate-before-commit (throws on malformed), and
`lintManifestReferences()` that returns **non-throwing** warnings (unknown capability, undeclared
event, undeclared namespace). The pivotal call: **structure throws, references lint.** Unknown
capabilities are safe at runtime via graceful fallback (`fallback = !registry.has(cap)`), so making
them fatal would break forward-compatibility — they are advisory. Verified headless: an authored
live-cards document validates, lints clean, and round-trips over the wire; an unknown capability
validates, is flagged, and renders as a fallback node without crashing; a malformed document throws;
undeclared events/namespaces surface as warnings.
---

## 21. Phase 8 — concrete HTTP/SSE transport binding

Open item #7 still had no *real network* transport. Added `transports/http-sse/`
([ADR-0014](decisions/ADR-0014-http-sse-transport.md)) as a separate package (not in the kernel core,
so `node:http` never leaks into a browser client). The direction split fits SSE: host → client streams
over `GET /gup/stream` (SSE), the single client → host message (`event`) is a `POST /gup/event`.
Sessions correlate via an `X-GUP-Session` response header the client echoes on POSTs — no new GUP
message. `fromRev` rides the query string (`?fromRev=N`), mapping straight onto the broker's resume
path. The SSE framing codec (`encodeSseFrame`/`SseFrameParser`) is socket-free and unit-tested
(byte-split frames, ignored heartbeat comments). Crucially `GenUIClient`/`KernelTransportHost` are used
**unchanged** — only new `TransportProvider`s — which is the payoff of the seam. Verified over a real
loopback socket: a client onboards + round-trips an event across HTTP/SSE, and a `?fromRev=1` stream
replays only the missing patch (no manifest/document re-onboard). Narrowed #7 (concrete SSE + `fromRev`
over the wire done; WebSocket/stdio, endpoint auth, and session/log persistence still open).
---

## Index of alternatives explicitly set aside

| Alternative | Set aside because |
|---|---|
| Standardize the existing DSL/app as the goal | Standardizes one instance; the value is a reusable contract. Kept as a profile (one instantiation, the first to onboard). |
| Pluggable/consumer-defined grammar | Nothing left to standardize; loses interpreter, validator, tool-generator. |
| Separate meta-kernel for interactions | Duplicates interpretation/validation/tracing and splits the graph; the real meta level is the Manifest. |
| Stateful sagas as a kernel primitive | Breaks the pure-reducer law; harder validation + agent-authoring; durability belongs in a provider. |
| Renderer patches the store directly | Breaks validate-before-commit and the pure-reducer law. |
| In-process SDK delivery | Language-bound; can't drive multiple frameworks or an out-of-process orchestrator. |
| Kernel-side `await` for async | Forces the kernel to own time; async is modeled as machine states instead. |
| Renderer reads/writes the store or owns transport | Bypasses the reducer, breaks validate-before-commit, and couples UI to infrastructure. |
| Vendoring the profile's sync JSONata build into the kernel | Inverts the kernel→profile dependency; ships a v1.x build inside a critical prototype-pollution advisory; sync was only a profile deployment concern. |
| Sending resolved trees over the wire (instead of document + patch) | Adds a message outside the five-message protocol and ships recomputed props on every change; the client resolves locally from document + patch instead. |
| Client running the reducer too (symmetric kernels) | Duplicating writes invites divergence and breaks single-authority/validate-before-commit; only reads (interpret) are duplicated. |
| A `hello`/`resume` GUP message for reconnection | Opens the closed five-message protocol for a connection-lifecycle concern; the client conveys its `rev` through the transport and the host onboards below GUP. |
| Always full-resync on reconnect (no patch log) | Correct but wasteful for large state / frequent reconnects; a bounded patch log makes incremental replay the common path and full resync the graceful fallback. |
| Rejecting unknown capabilities as hard errors at author time | They are safe at runtime via graceful fallback and support forward-compatibility (targeting a capability a renderer hasn't shipped); they are lint warnings, not errors. |
| Folding reference checks into schema validation | The schema is vocabulary-agnostic by design; reference correctness is manifest-relative and advisory, so it is a separate non-throwing lint. |
| Putting the HTTP/SSE binding in the kernel core | Would pull `node:http` into the portable core and break a browser bundle of the kernel index; infra lives in `transports/http-sse/` with its own tsconfig. |
| Bidirectional over the SSE stream | SSE is one-directional by design; a `POST` endpoint for the single client→host message (`event`) is simpler and idiomatic. |
