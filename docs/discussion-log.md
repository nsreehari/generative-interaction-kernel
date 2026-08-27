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

## 9. The protocol — GIK

The GIK Protocol was defined: one envelope, five messages (`manifest`, `document`, `patch`,
`event`, `trace`), and protocol invariants (renderers consume documents+patches and emit events
only; renderers never patch the store directly; the store is authoritative kernel-side; documents
are valid only against a declared manifest; transport- and placement-agnostic). →
[docs/03-protocol.md](../docs/03-protocol.md).

## 10. This repository

Created to capture the design and drive the first concrete artifact (normative GIK schemas + a
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

An existing application was selected as the **first profile to onboard** - a pragmatic pilot
adopter, not a canonical reference - and mapped
onto every provider seam ([04-first-onboarding-profile.md](04-first-onboarding-profile.md)), with a
fit assessment (maps cleanly / needs adapter / genuine gap or residue) and the rule that the kernel
is not bent to fit the profile. Remaining open decisions were parked in
[not-yet-decided.md](not-yet-decided.md). The **first build artifact** was produced: the five
normative GIK draft-07 schemas + envelope, and a repository-owned golden conformance fixture,
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
During implementation, a security review rejected reusing the pilot profile's vendored
`jsonata-sync.cjs`: it was a profile-owned artifact (inverting the kernel-to-profile dependency), it was
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
thin `useGenUI`/`GenUIRoot` binding wires it into React. Default fixture components
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

## 17. Phase 4 — transport seam (GIK across a boundary)

The "protocol, not SDK" bet ([ADR-0004](decisions/ADR-0004-protocol-over-sdk.md)) was finally
exercised across a boundary ([ADR-0010](decisions/ADR-0010-transport-seam.md)). A minimal duplex
`TransportProvider` (`send`/`subscribe`) moves whole **GIK envelopes**; the five messages got concrete
types (`GIKMessage`) and an `envelope(type, payload)` helper so both ends share one serialized shape.
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
interpretation moves to the client**. A `GIKClient` consumes `manifest` (→ registry + empty
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
(so mid-session onboarding never clobbers live state, unlike `baseline()`/`init()`). `GIKClient`
gained `rebind(transport)` (reconnect keeping the replica) and idempotent patch application (ignore
rev ≤ current; a `manifest` resets rev so full resync always applies). Reconnection added **no new GIK
message** — it is transport/host orchestration below the closed five. Verified headless: two clients
share a kernel; one drops, misses a rev, reconnects and catches up via a single replayed patch; a late
joiner full-syncs and sees the gate already open. Narrowed open item #7 (reconnection/replay done;
network bindings + `fromRev` transport + log persistence still open).
---

## 20. Phase 7 — agent-authoring path (typed builders, validate-before-commit, lint over throw)

A generic platform's producers are agents emitting GIK documents from manifest vocabulary, not people
hand-writing JSON. Added `kernel/src/authoring.ts` ([ADR-0013](decisions/ADR-0013-agent-authoring.md)):
typed constructors for the closed grammar (`node`, `document`, one per action family + `guarded`),
`authorDocument()` that envelopes + runs structural validate-before-commit (throws on malformed), and
`lintManifestReferences()` that returns **non-throwing** warnings (unknown capability, undeclared
event, undeclared namespace). The pivotal call: **structure throws, references lint.** Unknown
capabilities are safe at runtime via graceful fallback (`fallback = !registry.has(cap)`), so making
them fatal would break forward-compatibility — they are advisory. Verified headless: an authored
fixture document validates, lints clean, and round-trips over the wire; an unknown capability
validates, is flagged, and renders as a fallback node without crashing; a malformed document throws;
undeclared events/namespaces surface as warnings.
---

## 21. Phase 8 — concrete HTTP/SSE transport binding

Open item #7 still had no *real network* transport. Added `transports/http-sse/`
([ADR-0014](decisions/ADR-0014-http-sse-transport.md)) as a separate package (not in the kernel core,
so `node:http` never leaks into a browser client). The direction split fits SSE: host → client streams
over `GET /gik/stream` (SSE), the single client → host message (`event`) is a `POST /gik/event`.
Sessions correlate via an `X-GIK-Session` response header the client echoes on POSTs — no new GIK
message. `fromRev` rides the query string (`?fromRev=N`), mapping straight onto the broker's resume
path. The SSE framing codec (`encodeSseFrame`/`SseFrameParser`) is socket-free and unit-tested
(byte-split frames, ignored heartbeat comments). Crucially `GIKClient`/`KernelTransportHost` are used
**unchanged** — only new `TransportProvider`s — which is the payoff of the seam. Verified over a real
loopback socket: a client onboards + round-trips an event across HTTP/SSE, and a `?fromRev=1` stream
replays only the missing patch (no manifest/document re-onboard). Narrowed #7 (concrete SSE + `fromRev`
over the wire done; WebSocket/stdio, endpoint auth, and session/log persistence still open).
---

## 22. Phase 9 — behavioral conformance matrix (portable cases + per-kernel runner)

Behavior lived only as inline TS tests — language-bound, so a second kernel couldn't reuse them,
defeating the reducer-equivalence goal (#11). Made the contract **data**
([ADR-0015](decisions/ADR-0015-conformance-matrix.md)): `conformance/cases/*.case.json` describe a
document (inline or `*Ref`) + optional `seed` + optional `expectInitialResolve` + event `steps` with
the *exact* `expectPatch` and optional `expectResolve`; a draft-07 `conformance-case.schema.json` gates
their shape. A thin **per-kernel runner** executes them — the reference runner is
`kernel/test/conformance.test.ts`; a future C# core ships its own over the same files, and identical
patches = equivalence. The observable contract is deliberately **patches + resolved props**, not
traces/effects (those are impl detail that may differ between kernels). Two gates by cost: structural
validation in `npm run conformance` (no TS runtime), behavioral execution in the kernel suite. 8 cases
cover assign+gate, guarded-invoke-skip, machine transition, rev monotonicity, derive, emit→machine,
malformed rejection, graceful fallback — all green. Narrowed #11 (matrix + runner done; broader coverage
+ the actual second-kernel runner still open).
---

## 23. Layered DSL stack — one kernel, lowering compilers above it

The user widened the frame: a real platform serves many domains, and the tempting move is one UI
DSL per domain. That fragments (every domain team becomes a UI expert; you rebuild React/XAML with
extra steps). The cleaner shape is **layers of abstraction**, not many DSLs: `Task → Domain →
Interaction → UI (kernel doc) → Renderer`.

**Key questions raised, and the answers recorded:**
- *Does this change the platform we've built?* **No — it extends it upward.** The kernel's closed
  grammar was already the bottom **UI DSL**. The new layers sit *above* it.
- *Do higher layers need their own kernel/grammar?* **No.** Each layer is a **lowering stage** — a
  pure transform that compiles the layer above into the layer below, ending at one kernel document.
  This is ADR-0002's logic ("interaction is an edge, not a second kernel") applied to layers.
- *Can agents author at any layer?* **Yes, but they should emit at the highest layer they can.**
  A Task/Domain document keeps the LLM away from raw UI and lets the lowering enforce house style /
  accessibility / theming. Lower authoring stays safe — every layer ends at the same validated
  document.
- *Is the kernel composable for every layer?* **All layers terminate at the same kernel document;
  the kernel is not re-run per layer.** Lowering is compile-time (once, top-to-bottom); the kernel
  is run-time over the single document that comes out.

**Decision** ([ADR-0016](decisions/ADR-0016-layered-dsl-stack.md)): keep one kernel and one grammar;
every layer above is a pure `Stage<In, Out>` composing into a pipeline whose terminal output is a
kernel `DocumentPayload`. A **profile is redefined** as *a Domain DSL + its lowering to the kernel*
(the pilot profile becomes a Domain DSL + one lowering stage). Ownership rule: **domains own
semantics · the platform owns interaction patterns · renderers own visual implementation.** Layers
are optional (a profile may go straight `Domain → UI`).

Made real in code: `kernel/src/lower.ts` adds `Stage`, a type-aligned `pipeline(a).to(b)`, and
`lowerToDocument()` — which reuses the exact validate-before-commit gate from Phase 7, so a bug in a
higher-layer compiler is caught at the kernel boundary, not at render time. Verified headless
(`kernel/test/lower.test.ts`): the pilot fixture recast as a Domain DSL (no kernel capabilities,
no layout primitives) lowers to a valid, kernel-interpretable document (metric reads its declared
source; the Approve gate lowers from `enabledWhen` and opens on selection); a `Task → Domain → UI`
pipeline stays type-aligned; and a lowering that emits a malformed document is rejected at the
boundary. No new grammar, no new wire message — the stack is entirely compile-time above an
unchanged kernel and protocol. Opened items #13 (Interaction DSL pattern library) and #14 (mandatory
vs. optional layers).
---

## 24. Platform boundary — who owns which layer (the charter)

The user reframed the platform's role: in 2015 a UI platform owned rendering/layout/state/styling/
navigation/accessibility — the UI DSL and its runtime. For an AI-native platform that is only
~30–40% of the story, because agents and users no longer reason in components. A **five-layer
ownership charter** was fixed ([ADR-0017](decisions/ADR-0017-platform-boundary.md)): **Intent**
(agent platform/app — *not* UI), **Domain semantics** (business domains — *shared*: they own
meaning, the platform owns only how a domain DSL plugs in via a translation contract), and
**Interaction / Presentation / Runtime** (the **UI platform**). The consequence is that the
platform's public surface starts at the **Interaction Model, not the UI DSL** — components become an
implementation detail, "as invisible as assembly language." And the durable value — **the moat — is
the interaction taxonomy + the interaction/presentation compiler**, not the renderer.

## 25. Interaction Model / Presentation Model split + the presentation compiler

The user split what ADR-0016 had treated as one "Interaction → UI" step into **two layers with a
context-aware compiler between them** ([ADR-0018](decisions/ADR-0018-interaction-presentation-split.md)):
**Layer 3 — Interaction Model** (a domain-neutral *human goal pattern*: investigate/compare/review/
approve/…, each made of **facets** the platform already knows — investigate = context/evidence/
timeline/relationships/actions) and **Layer 4 — Presentation Model** (`{ layout, regions }` — how the
experience is materialized *right now*). The **Presentation Compiler** (`interaction + context →
presentation`) is the seam: *same interaction, different presentation by surface* — desktop→workspace,
mobile→stack, copilot→narrative. This matches how AI reasons: a user says "help me understand why this
alert fired," the AI emits `{ interaction: investigate, object: alert }` at Layer 3, and the platform
generates the rest.

Made real as a new package `interaction/` (owns L3–L4, sits above the kernel to keep the boundary
honest): `interaction.ts` (the taxonomy + default facets), `presentation.ts` (the presentation model +
`defaultPresentationCompiler`), `lowering.ts` (Presentation → kernel document via a profile-supplied
**region binding** — the translation contract; unbound facets fall back gracefully so a profile can
target facets it hasn't implemented yet), and `compileInteraction()` as the one-call upper pipeline.
Verified headless (5 tests): the same `investigate` interaction compiles to different presentations by
context; a `review` interaction lowers to a valid, kernel-interpretable document (the summary facet
reads its data via the fixture binding, the detail facet's select writes `card_data.selected`);
`investigate`'s unbound facets resolve as graceful fallbacks while its `actions` facet resolves
concretely; and a full `Domain → Interaction → Presentation → UI` pipe composes through the kernel's
`pipeline`/`lowerToDocument` seam. No new grammar, no new wire message — the whole upper half stays
compile-time above an unchanged kernel and protocol. Seeded open items #13 (interaction taxonomy),
#14 (presentation compiler + context taxonomy), #15 (mandatory vs. optional layers).
---

## 26. Fleshing out the taxonomy + presentation context + layout templates ("do both")

The user asked to nail down **both** halves the split had only sketched: the **interaction facets per
kind** (Layer 3) and the **presentation context taxonomy + a catalog of named layout templates**
(Layer 4).

Layer 3 — a facet is no longer a bare string. `Facet = { name, role, required }` where `role: FacetRole`
is a semantic display role (`summary | collection | detail | timeline | graph | narrative | metrics |
status | form | actions | comparison | recommendation`) — still not a component — and `required` marks
the facets an interaction cannot be itself without. All 12 kinds are now fully specified.
`resolveFacets` (explicit `capabilities` override, unknown names → required `detail`), `facetsOf`,
`requiredFacets`, and `facetsFor` (names) accompany the table.

Layer 4 — `PresentationContext` grows real axes: `surface` (desktop/web/mobile/copilot/teams), `device`
(pointer/touch/voice), `space` (compact/regular/expanded), `attention` (focused/glanceable), `expertise`
(novice/intermediate/expert). A `layoutTemplates` catalog holds `LayoutTemplate = { name, arrangement,
maxRegions? }` over arrangements `stack | narrative | split | grid | dashboard | wizard`. The compiler
now `selectTemplate`s from the interaction first (compare→comparison, monitor→dashboard,
create/configure→wizard) then the context (glanceable→narrative, compact→stack, else the generic
`workspace` grid, named `${interaction}_workspace`).

The two halves interlock: a capped template (e.g. `narrative`, cap 3) sheds only *optional* facets — the
region trim keeps every required facet even when they exceed the cap (investigate keeps its 4 required
facets under a cap of 3, dropping only the optional `relationships`). Facet roles also drive binding:
`PresentationBinding` gains `roleCapability` (bind once per role) with `regionCapability` as a
per-region override; resolution is `regionCapability[region] → roleCapability[role] → region name`
(fallback). The fixture binding switched to role-based and leaves `graph`/`form` unmapped on purpose,
so `investigate`'s `graph`-role facet renders as a graceful fallback while its `actions`-role facet
resolves. Verified headless — interaction tests grew from 5 → 7 (taxonomy roles/required + explicit
override; context-driven templates; a capped template never dropping a required facet; role binding with
fallback), full suite green (33 kernel + 5 react + 7 interaction + 3 sse, conformance + typecheck clean).
Kernel grammar and wire protocol untouched. Narrowed open items #13 and #14.
---

## 27. Deciding the "cheap cluster" — five parked items closed at once

With the layered stack committed (Phase 10), the user asked which parked items could simply be
*decided now*, then said "take the whole cheap cluster." Five self-contained, unblocked items were
resolved together — no second kernel, no taxonomy design, all additive and green.

- **Conformance coverage broadened** (executing ADR-0015, no new ADR): two language-neutral cases —
  `09` pins `merge` (shallow combine) + `remove` (leaf delete) semantics observably through a read
  edge, and `10` drives *two* machines through an emit **cascade** (press → `advance` → outer
  transition emits `inner` → nested transition) inside one dispatch, one rev carrying both state
  writes in order. HITL `confirm` follow-ups stay in the kernel's unit tests for now (they need a
  live Orchestrator); scripting canned orchestrator responses into JSON cases is the remaining #11
  work.
- **`confirm` contract** ([ADR-0019](decisions/ADR-0019-confirm-contract.md)): a standard prompt
  payload (`ConfirmPrompt`), an outcome vocabulary (`approved | denied | cancelled | timeout`), and
  standard follow-up event names (`confirmed` / `dismissed`) so approval and denial route by name.
  `kernel/src/confirm.ts` + a round-trip test (Orchestrator resolves → follow-up drives a store write
  in the same dispatch). No new action family, no new wire message.
- **ObservabilitySink** ([ADR-0020](decisions/ADR-0020-observability-sink.md)): the trace-point set is
  now a closed, documented contract (`TRACE_POINTS`), with reference `consoleSink` / `bufferSink` /
  `multiSink` over the existing `TraceSink` type; concrete exporters stay out-of-core. Traces remain
  *off* the behavioral conformance contract (ADR-0015) — a weaker, observability-only contract.
- **Optional layers** ([ADR-0021](decisions/ADR-0021-optional-layers.md)): no layer is mandatory; a
  partial pipeline (e.g. single-stage `Domain → UI`) is valid, and validation happens once at the
  UI-DSL boundary via `lowerToDocument`, so skipping layers costs no safety. Proven by a new
  single-stage lowering test.
- **Streaming deferred** ([ADR-0022](decisions/ADR-0022-defer-streaming.md)): v0.1 ships a *complete*
  document in one message; incremental agent-side streaming of the initial document is decided-to-
  defer (partial documents have no defined validity; post-render patches already cover dynamic
  content). Resolves #10 as *deferred*, not open.

Suite grew to 43 kernel + 5 react + 7 interaction + 3 sse; conformance (now 10 cases) + 4-config
typecheck clean. Kernel grammar and wire protocol untouched. Resolved not-yet-decided #8, #9, #10,
#15 (renumbered out); narrowed #11.
---

## 28. Conformance runner contract — de-risking the second kernel

Asked "what's next," the strongest move was the **second (C#) kernel** against the conformance matrix
(item 2 / item 8) — the first real test of "protocol over SDK" and cross-kernel reducer equivalence,
since today the matrix only checks the reference kernel against itself. The cheap, sequencing-correct
first sub-step: **pin the semantics a second runner must honor** before writing it.

An audit of `kernel/test/conformance.test.ts` + the case schema found several rules that are *implicit
in TypeScript* and would let two "conforming" kernels silently disagree: envelope-or-bare loading;
**rev increments even on an empty-ops dispatch**; **op emission order is contractual** (order-sensitive
array equality) yet undocumented; **JSON number equality** (`1` vs `1.0`, `long` vs `double`);
seed-before-init ordering; `props` partial-match; `fallback` = capability-absent. None are
JSON-Schema-expressible — they are behavioral — so the artifact is prose.

- **`conformance/README.md`** ([ADR-0023](decisions/ADR-0023-conformance-runner-portability.md)):
  a normative runner contract — case lifecycle, revision/patch rules (one dispatch = one patch = one
  rev, empty patches included), op-order, op semantics, value equality (numeric-value number
  comparison), determinism, and an explicit out-of-scope list (traces, Orchestrator effect scripting,
  streaming). Documents existing reference-kernel behavior; **no code or grammar change.**

This turns writing the C# runner into a checklist against one document rather than reverse-engineering
TypeScript, and closes the ambiguities (op order, empty-patch rev, number equality) where two kernels
would otherwise drift undetected. Still open under #8: the C# runner itself, and scripting an
Orchestrator's `confirm`/`invoke` response into JSON cases.
---

## 29. Enriching the Presentation DSL + naming the Planner / Compiler split

The user shared the platform thesis ("future UI platforms evolve from Component Platforms into
**Interaction Platforms**"). Mapping it onto the code, layers 3 and 4 already exist — but the vision's
"Role of AI" distinguishes two stages the first cut had fused: an **AI Presentation Planner**
(interaction → Presentation DSL) and a **Presentation Compiler** (Presentation DSL → UI DSL), and it
wants the Presentation DSL to be a *renderer-agnostic, validatable, explainable* artifact carrying
per-region hierarchy and progressive disclosure. We closed that gap.

- **Planner vs. Compiler named.** The `interaction + context → PresentationSpec` seam is now
  `PresentationPlanner` (`defaultPresentationPlanner` = the deterministic reference; an AI planner
  drops into this exact slot with no kernel change). `lowerPresentation` is the Presentation
  *Compiler*. `compileInteraction(spec, ctx, binding, planner?)` = planner then compiler.
- **Regions are enriched.** A region went from a bare name to
  `{ name, role, priority, disclosure, presentation? }`: `priority` (primary/secondary/tertiary) is
  information hierarchy, `disclosure` (always/collapsed/on-demand) is progressive disclosure, and
  `presentation?` is a concrete presentation-type hint (graph→`relationship_graph`, etc.). The lead
  region is primary; other required facets secondary; optional tertiary. Disclosure tightens one step
  on a constrained surface, so the *same* investigate interaction keeps identical facets on desktop
  and mobile but folds its secondary/tertiary regions on mobile — attention management and progressive
  disclosure, not just layout selection. These decisions ride into the UI DSL as node props, so a
  renderer can honor them.
- **The DSL is validatable.** `profile/profile-templates/genui/schemas/presentation.schema.json` (draft-07) +
  `validatePresentationSpec` / `isValidPresentationSpec` make a planner's output structurally
  checkable — a buggy planner is caught at this boundary, not at render time.

Verified headless: interaction tests 7 → 9 (a region carries priority/disclosure/presentation and
tightens on a glanceable surface; the Presentation DSL passes/fails its own schema). Full suite green
(43 kernel + 5 react + 9 interaction + 3 sse, conformance + typecheck clean). Kernel grammar and wire
protocol untouched; the AI planner itself remains the open item under #14.
---

## 30. Second kernel — proving protocol-over-SDK with an independent C# core

Following the runner contract (§28), the payoff step: **build the second kernel**. With the semantics
pinned, a C# reimplementation was a checklist, not archaeology. `kernel-dotnet/` holds `GenUI.Kernel`
(a dependency-free library — only `System.Text.Json` from the shared framework, so it builds offline)
and `GenUI.Conformance` (a console runner over the *same* `conformance/cases/*.json`).

- **Faithful to the reference**: namespaced store with `set`/`merge`/`remove` semantics, capability
  registry, interpreter (`gate → capability → props → children`), the pure reducer (six action
  families, machines, emit cascade via an in-dispatch queue), structural validate-before-commit, and
  one dispatch = one patch = one rev. A `MiniJsonataProvider` implements exactly the JSONata subset the
  matrix uses (path nav, `$event`, `*`, `=`, `!=`, literals), `truthy()`-wrapped, behind an
  `IExpressionProvider` seam so a full JSONata port can slot in later.
- **All ten cases pass on the C# kernel.** Identical expected patches across two independent runners
  *is* reducer equivalence — the first real evidence for "protocol over SDK"
  ([ADR-0024](decisions/ADR-0024-second-kernel-csharp.md)). Wired as `npm run test:dotnet` and into the
  aggregate `npm test`, so a divergence between kernels now fails CI.

This resolves item 2 (**independent reimplementation**, not a shared compiled core) and the runner half
of item 8; open items renumbered to a contiguous 1–10. The C# core is the foundation the WinUI/Reactor
adapter (item 2, render side) will sit on. Alternatives set aside: a shared core compiled to both
targets (would prove "same code twice," not independent implementability) and porting the TS unit tests
(language-bound; the JSON matrix is the shared contract).
---

## 31. Closing the last Presentation-DSL gaps — accessibility, explainability, explanations facet

A re-audit of the vision doc against the enriched DSL (§29) left four items open. All four are now
closed — a small increment, interaction-package + one kernel comment only, no grammar/protocol change.

- **Accessibility / density adaptation.** The planner's `PresentationContext` had `device` and
  `expertise` declared but unused. `disclosureOf` now computes a numeric density level: hierarchy
  sets the base, a constrained budget (now including `device: voice`) tightens it, an `expert`
  audience tightens further (denser, deferred), a `novice` audience loosens (guided — more up front).
  Primary regions stay always-on. So the *same* investigate interaction shows evidence up front for a
  novice but collapsed for an expert.
- **Explainability.** `PresentationRegion` gains an optional `rationale` (schema-optional string) the
  planner fills with a short, inspectable reason per placement. This is the explainable-output the
  vision asks for and the hook a model-backed planner fills — the reference one emits a *templated*
  rationale, not a reasoned one.
- **Explanations facet.** `investigate` gains a distinct required `explanation` facet (role
  `narrative`) instead of folding "why" into `context`, matching the vision's facet list.
- **Stale comment.** `kernel/src/reduce.ts` claimed invoke/navigate/confirm were "deferred to
  Phase 3"; corrected to the ADR-0009 Orchestrator-effect behavior they've had since Phase 3 shipped.

Verified: interaction tests 9 → 10 (a new test asserts device/expertise adapt disclosure and every
region carries a rationale). Full suite green — 43 kernel + 5 react + 10 interaction + 3 sse, plus the
C# conformance matrix (10 cases) unaffected. not-yet-decided #14 narrowed; what remains under it is the
*learned* planner itself.
---

## 32. Scripting the effect seam into the conformance matrix

Item 7's last thread: the matrix ran with **no Orchestrator**, so deferred effects
(`invoke`/`confirm`/`navigate`) — and the *settle* mechanics they drive — were asserted only by each
kernel's own unit tests. Two kernels could pass all cases yet route effects differently and nothing
would catch it. Worse, the second (C#) kernel *collected* effects but never routed them, because no
case demanded it.

The fix is data, not a live orchestrator. The case schema gains an optional `orchestrator` array of
`{ on, result }` entries: `on` matches an effect by `kind` (+ optional `node`/`tool`), `result` is
`{ ops?, events? }` — the same shape a real Orchestrator returns. Both runners build a
`ScriptedOrchestrator` from it (pure data — no clock, RNG, or IO) and construct the kernel with it.

- **The C# kernel gained the seam it lacked**: an `IOrchestrator`, an enriched `Effect` (carrying
  `tool`/`args`/`payload`), and a `Settle` recursion in `Dispatch` that applies an effect's `ops` and
  recursively settles its follow-up `events` — one dispatch = one rev regardless of fan-out, mirroring
  `kernel.ts` exactly.
- **Two new cases, green on both kernels**: `11-orchestrator-invoke-cascade` (press → `invoke`;
  scripted result returns fetched rows + a `resolved` event driving a machine idle→loading→ready —
  three ops at one rev, in the contractual order reducer-ops → effect-ops → follow-up-event-ops) and
  `12-orchestrator-confirm-approved` (a `confirm` whose scripted approval is the dispatch's only write).
- The runner contract (`conformance/README.md`) moves scripted effects from "out of scope" to a
  defined, optional facility, and the op-order rule is now demonstrated, not merely described.

This resolves the effect-seam half of item 7 ([ADR-0025](decisions/ADR-0025-orchestrator-scripting-conformance.md));
combined with the C# runner (item 8, now item's conformance thread), item 7 is fully retired and the
open list contracts to a contiguous 1–9. Live Orchestrator realism (real tools, timing, retries, HITL
UI) stays deliberately off the portable contract. Alternatives set aside: modeling a real async
orchestrator (imports non-determinism), and asserting trace/effect records directly (traces are an
out-of-core diagnostic seam that may differ across kernels — the contract stays on patches + resolves).
---

## 33. A second render adapter: the renderer-agnostic C# core

With a second *kernel* core in C# (§30), open item 2 asked for the second *renderer* that sits on it —
a WinUI/Reactor adapter. But the C# kernel's defining property is that it is offline, zero-NuGet, and
OS-neutral (`net10.0`, `System.Text.Json` only), and a real Reactor/WinUI binding needs the Windows App
SDK, the `Microsoft.UI.Reactor` packages, and a `net10.0-windows` target. Bolting those onto the kernel
island would make the portable core Windows-only.

The React adapter already shows the escape: its *core* (`render.tsx` + `registry.ts` + `controller.ts`)
is pure and headless — a `ResolvedNode → view` walk over a capability registry, plus a
framework-agnostic controller loop — and React elements are only the thin edge. So the second adapter is
built the same way in C#, generic over the view type:

- **`adapters/dotnet/GenUI.Render`** (its own offline island, references only `GenUI.Kernel`):
  `Renderer.Render<TView>` is the pure walk, honoring `Visible` (drop invisible children) and
  `Fallback` (kernel-unknown capability, or a known one with no registered view, uses the fallback) —
  the identical rule to `render.tsx`. `IComponentRegistry<TView>` is the capability→view vocabulary;
  `GenUIController` is the `controller.ts` loop (init→resolve, emit→dispatch→re-resolve→notify),
  synchronous because the C# kernel is.
- **`GenUI.Render.Check`** is a headless console runner (conformance-runner style, zero test deps) that
  renders a hand-built document into a serializable `RenderRecord` tree and drives the *whole* loop
  through the real kernel: render → node-bound emit → dispatch → re-resolve → re-render. It asserts the
  visibility drop, **both** fallback paths (known-but-unregistered vs. kernel-unknown), node-id capture
  on the bound emit, and the controller's one-rev patch + refresh. Wired into `npm test` as
  `test:dotnet-render` (17 checks green).

The concrete Reactor/WinUI binding (`TView = Element`, a capability→factory registry, a host window)
is now a small, well-scoped edge that lives *outside* the offline island. Item 2 narrows to exactly
that toolkit edge plus cross-adapter render equivalence; the traversal contract itself is settled
([ADR-0026](decisions/ADR-0026-second-render-adapter-dotnet.md)). Alternatives set aside: putting WinUI
directly on the kernel island (would make the core Windows-only), and writing the Reactor binding *as*
the adapter (would entangle the reusable walk with a toolkit — the reusable seam is the core, the
toolkit is the edge).
---

## 34. Everything is JSON — the bundle, one host, and per-bundle registries

The user pushed the thesis all the way down: an app should be JSON, any app should be hostable
anywhere, and adding one should never mean writing a new `.tsx`. The only code left is the kernel +
runtime, a fixed set of primitive leaf components, and a few named effect handlers. We made that real
in the React adapter's floor — three moves, no kernel/grammar/protocol change.

- **The bundle + one generic host.** An app is `Bundle = { manifest, document, state?, effects?,
  components? }`, with the JSON-only subset `SerializableBundle = { manifest, document, state? }`
  movable as data. `loadBundle` + `BundleHost` run *any* bundle — the console, its live Preview, and
  the playground are now the same host handed different bundles, not bespoke React apps.
- **Composition via an `embed` leaf.** The composition capability (renamed from `bundle` → `embed`,
  a verb in the document) mounts a whole bundle as a nested runtime — **inline** (a
  SerializableBundle bound from state, e.g. the console's per-profile Preview/Playground rebuilt as
  JSON from the draft) or as a **named app** resolved from an `AppRegistry` the host publishes
  (`props.app: "playground"`), so a *known* app carrying native effects can be embedded by reference.
  The outermost mount and a nested leaf are the same operation — no privileged app shell
  ([ADR-0030](decisions/ADR-0030-bundle-composition.md)).
- **Per-bundle registries = floor ⊕ overlay.** The design question was custom pool vs. central floor
  plus overlay; we took the overlay. A bundle may carry `components`, and the effective registry is
  `overlayRegistry(primitiveRegistry, bundle.components)` (extras win, floor fills the rest, fallback
  preserved), applied at both `BundleHost` and the resolved-app `embed`. Scope is per-bundle: a
  nested bundle inherits the floor, not the parent's custom vocabulary. This keeps the primitive
  vocabulary universal while letting a custom-vocabulary app be hosted anywhere
  ([ADR-0031](decisions/ADR-0031-per-bundle-registries.md)).

Verified in the running console (floor host, no `components` overlay): the empty-state standalone
Playground app renders its four cards and click→selection; the per-profile Playground tab renders as
an inline parameterized bundle; Preview renders read-only; the surface live-rebuilds as capabilities
are added — all through the one host, with no "unsupported"/"not registered" errors. A stale-HMR
`ReferenceError` after the `bundle`→`embed`/`BundleMount`→`Embed` rename cleared with a full page
reload (not just an HMR refresh).

**Decided, pending implementation:** reshape the workbench's *chrome* and *inspect* columns into two
bundles (each is already `state + kernel(manifest) + controller`), hosting their custom vocabulary via
the overlay; the middle *guest* stays a distinct compiler surface (Interaction→Presentation→UI
output), **not** a bundle, and its three cross-kernel bridges become named effects / thin host wiring —
running a compiler and forwarding events across kernel boundaries are irreducibly native.
---

## 35. The workbench, dogfooded — chrome & inspect as two bundles on the floor

The first application of the bundle model (§34, ADR-0030): the workbench had been the last app still
wiring bespoke React runtimes — `buildChromeRuntime`/`buildInspectRuntime` each hand-built an
`InMemoryStateModel` + `Kernel(WORKBENCH_MANIFEST)` + `GenUIController` and rendered through a private
`workbenchRegistry`. They were structurally already bundles minus packaging, so we packaged them.

- **Two bundles.** `chrome.ts` now exports `chromeBundle` and `inspectBundle` as plain `Bundle`
  data — `{ manifest: WORKBENCH_MANIFEST, document: authorDocument(root), state: { ns: seed },
  components: workbenchComponents }`. The imperative seed loops became one seed object per namespace;
  the runtime builders and their `ChromeRuntime`/`InspectRuntime` types are gone.
- **On the shared floor.** Both load through the floor host and render via
  `overlayRegistry(primitiveRegistry, workbenchComponents)` (ADR-0031) — the workbench's custom
  controls (facetList, regionEditor, regionTable, …) and its own takes on the shared primitives win
  over the floor, which fills the rest. `profile/registry.tsx` now exports the raw
  `workbenchComponents` map; the bespoke `workbenchRegistry`/`createRegistry` wrapper is retired.
- **One small floor addition.** `loadBundleRuntime(bundle) → { controller, state }` (with `loadBundle`
  delegating to it) exposes the state model for the *one* host that must reach into a bundle to bridge
  it to another — the workbench chrome driving the guest. That reach is the irreducibly native seam.
- **The guest stays the guest.** The middle column is untouched: still `buildSession` +
  `liveCardsBinding` rendered on `liveCardsRegistry` — the live Interaction→Presentation→UI compiler
  surface, deliberately **not** a bundle. Its three bridges (chrome→guest inputs/fires, guest→inspect
  artifacts, agent→chrome authoring) stay as React host wiring, not named effects: they cross kernel
  boundaries and run a compiler, which the closed single-kernel action grammar can't express. This is
  the deliberate end state, not a gap.

Verified: adapters/react typecheck + `build:workbench` clean (129 modules); full suite green (43
kernel + 5 react + 10 interaction + 3 sse, conformance, JSONata 147, both C# kernels + both render
adapters). In the browser all three columns render — chrome panels, the compiler board (its
`relationships` facet still the liveCards fallback, as before), and the inspect region table streamed
live; the Fire-event node list is populated from the guest tree (the guest→chrome bridge running).
Adding an app is now, with no exceptions left, a bundle handed to one host. Alternatives set aside:
rendering the bundles through `BundleHost` (it owns its controller/state internally, so the bridges
couldn't reach them); and converting the bridges to named effect handlers (they are cross-kernel, not
single-kernel — host wiring is the honest shape).
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
| A `hello`/`resume` GIK message for reconnection | Opens the closed five-message protocol for a connection-lifecycle concern; the client conveys its `rev` through the transport and the host onboards below GIK. |
| Always full-resync on reconnect (no patch log) | Correct but wasteful for large state / frequent reconnects; a bounded patch log makes incremental replay the common path and full resync the graceful fallback. |
| Rejecting unknown capabilities as hard errors at author time | They are safe at runtime via graceful fallback and support forward-compatibility (targeting a capability a renderer hasn't shipped); they are lint warnings, not errors. |
| Folding reference checks into schema validation | The schema is vocabulary-agnostic by design; reference correctness is manifest-relative and advisory, so it is a separate non-throwing lint. |
| Putting the HTTP/SSE binding in the kernel core | Would pull `node:http` into the portable core and break a browser bundle of the kernel index; infra lives in `transports/http-sse/` with its own tsconfig. |
| Bidirectional over the SSE stream | SSE is one-directional by design; a `POST` endpoint for the single client→host message (`event`) is simpler and idiomatic. |
| Behavioral conformance as inline TS tests only | Language-bound; a second kernel can't reuse them, defeating reducer-equivalence. Cases are language-neutral JSON with a per-kernel runner. |
| Asserting traces/effects in conformance cases | Trace/effect shapes are internal and may differ between kernels; patches + resolved props are the portable contract. |
| One UI DSL per domain, each with its own renderer | Fragments (N DSLs → N renderers); forces every domain team to learn UI primitives; loses a single conformance target. One UI DSL + many domain lowerings instead. |
| A separate kernel/grammar per layer | Duplicates interpretation/validation/tracing per layer and breaks the single-document invariant; layers are lowering stages that terminate at one kernel document. |
| Exposing the UI DSL directly to domain teams/agents | The UI DSL leaks upward and domain code fills with `grid`/`flex`/`column` — reinventing React/XAML; the UI DSL stays internal, reached only through lowerings. |
| UI platform owning Intent and/or Domain semantics | Couples the platform to specific goals/business objects and breaks domain-neutrality; the platform defines *how* domains plug in (a translation contract), not *what* they mean. |
| Keeping the platform boundary at the UI DSL (components public) | Makes every domain team a UI expert and mismatches how AI reasons ("compare these," not "render a table"); the public surface is the Interaction Model, one layer up. |
| A single Interaction → UI lowering (no Presentation split) | Fuses "what experience" with "how it appears," leaving context-adaptation nowhere clean and preventing one interaction taxonomy from serving many presentations — the presentation compiler (the moat) wouldn't exist. |
| Putting presentation context inside the Interaction Model | Re-couples the domain-neutral goal to a surface/device, defeating "same interaction, many presentations"; context belongs to the compiler. |
| Hard-coding a layout per interaction (no compiler) | Every interaction would render identically everywhere; adaptivity — the AI-native point — is lost. The compiler is a replaceable seam a profile can enrich. |
| Per-app hosts / registries / orchestrators (status quo) | Every app re-implements the same wiring, "adding an app" is code not data, and apps can't compose; a single bundle + one generic host makes an app data. |
| Embedding apps only by inlining their JSON | A known app's native effect handlers are functions and can't travel through JSON state; the named-app registry embeds by reference while inline embedding stays for the JSON-only case. |
| A dedicated app-shell component (distinct from the `embed` leaf) | Reintroduces a privileged top level and a second code path; the outermost mount and a nested mount are the same `embed`/`BundleHost` operation. |
| A fully custom component pool per bundle | Re-registers the primitives, lets the floor drift, and breaks `embed` composition (no common fallback base); the floor stays universal, apps add a small additive overlay. |
| A parent/fallback registry chain across nested bundles | More machinery than needed and would leak parent vocabulary downward; a flat per-bundle floor ⊕ overlay matches the actual requirement. |
| Rendering the workbench chrome/inspect through `BundleHost` | The host owns its controller and state internally, so the cross-kernel bridges couldn't reach them; the workbench loads the bundles via `loadBundleRuntime` and does its own thin host wiring. |
| Converting the workbench's 3 bridges into named effect handlers | They cross kernel boundaries and run a compiler; the single-kernel action/effect grammar can't express that. Host wiring (React effects) is the honest shape for an irreducibly native seam. |
