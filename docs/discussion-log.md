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

**Decision:** build a generic platform; the existing DSL/registry/app is **one reference profile**,
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

## 13. Reference profile selected + first build artifact

The **live-cards** profile (yaml-flow + demo-boards-ns-code + demo-boards-frontend) was selected as
the first reference profile and mapped onto every provider seam
([04-reference-profile.md](04-reference-profile.md)). Remaining open decisions were parked in
[not-yet-decided.md](not-yet-decided.md). The **first build artifact** was produced: the five
normative GUP draft-07 schemas + envelope, and a golden conformance fixture drawn from live-cards,
verified by a runner (`schemas/validate.mjs`) — all checks pass.

---

## Index of alternatives explicitly set aside

| Alternative | Set aside because |
|---|---|
| Standardize the existing DSL/app as the goal | Standardizes one instance; the value is a reusable contract. Kept as a reference profile. |
| Pluggable/consumer-defined grammar | Nothing left to standardize; loses interpreter, validator, tool-generator. |
| Separate meta-kernel for interactions | Duplicates interpretation/validation/tracing and splits the graph; the real meta level is the Manifest. |
| Stateful sagas as a kernel primitive | Breaks the pure-reducer law; harder validation + agent-authoring; durability belongs in a provider. |
| Renderer patches the store directly | Breaks validate-before-commit and the pure-reducer law. |
| In-process SDK delivery | Language-bound; can't drive multiple frameworks or an out-of-process orchestrator. |
| Kernel-side `await` for async | Forces the kernel to own time; async is modeled as machine states instead. |
| Renderer reads/writes the store or owns transport | Bypasses the reducer, breaks validate-before-commit, and couples UI to infrastructure. |
