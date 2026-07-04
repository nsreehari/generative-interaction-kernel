# Not Yet Decided

Open decisions parked here so they are not forgotten. Each will graduate to an ADR when resolved.
Resolved items are removed from this list and recorded in [decisions/](decisions/README.md).

> Resolved since the last replay: **first onboarding profile** → live-cards
> ([04-first-onboarding-profile.md](04-first-onboarding-profile.md)); **kernel placement** → hybrid,
> primarily embedded ([ADR-0005](decisions/ADR-0005-kernel-placement.md)); **reference kernel
> implementation** → TypeScript/JS first, JSONata (v2, patched) as the default `ExpressionProvider`
> ([ADR-0007](decisions/ADR-0007-reference-kernel-implementation.md)); **effect execution &
> async data** → `invoke`/`confirm`/`navigate` run as post-reduction effects via an Orchestrator
> provider, async data modeled as machine states
> ([ADR-0009](decisions/ADR-0009-orchestrator-effects.md)); **`confirm` UX contract** → standard
> prompt payload, outcome vocabulary, and `confirmed`/`dismissed` follow-up event names
> ([ADR-0019](decisions/ADR-0019-confirm-contract.md)); **ObservabilitySink** → fixed trace points +
> reference `console`/`buffer`/`multi` sinks ([ADR-0020](decisions/ADR-0020-observability-sink.md));
> **optional layers** → no layer is mandatory, validation happens once at the UI-DSL boundary
> ([ADR-0021](decisions/ADR-0021-optional-layers.md)); **progressive/streaming document assembly** →
> deferred beyond v0.1 — a complete document per message
> ([ADR-0022](decisions/ADR-0022-defer-streaming.md)).

## Open

1. **Safe expression subset.** JSONata is the reference default `ExpressionProvider`
   ([ADR-0007](decisions/ADR-0007-reference-kernel-implementation.md)). Still open: whether a
   smaller, sandboxed subset is *mandated* for agent-authored guards/gates (e.g. no function
   definitions, no `$eval`) versus relying on the provider seam per profile.

2. **Second render adapter.** React is the first render adapter
   ([ADR-0008](decisions/ADR-0008-first-render-adapter-react.md)). The second (C#) kernel core it
   would sit on now exists ([ADR-0024](decisions/ADR-0024-second-kernel-csharp.md)). Still open: the
   WinUI/Reactor adapter itself, and how render equivalence across adapters is verified.

3. **Manifest generation flow.** How a profile *publishes* its `manifest` — derived automatically
   from the DSL schema + registry, hand-authored, or a hybrid. Determines whether the manifest is a
   build artifact or a source artifact.

4. **Versioning & migration policy.** How `manifest` and `document` versions evolve, how a renderer
   negotiates the manifest version, and how breaking capability changes are migrated.

5. **Custom action registration.** The mechanism by which a provider adds actions beyond the six
   closed families, and how those custom actions are declared in the manifest and validated.

6. **Transport bindings.** A `TransportProvider` seam plus an in-memory reference pair and
   `KernelTransportHost` now carry GUP envelopes across a boundary
   ([ADR-0010](decisions/ADR-0010-transport-seam.md)); the host is a broker with a patch log that
   supports reconnection via incremental replay or full resync
   ([ADR-0012](decisions/ADR-0012-reconnection.md)); and a concrete **HTTP/SSE** binding
   (`transports/http-sse/`) carries the full protocol over a real socket, conveying `fromRev` as a
   query param ([ADR-0014](decisions/ADR-0014-http-sse-transport.md)). Still open: additional network
   bindings (WebSocket / stdio / in-proc for embedded), auth on the endpoints, and session/log
   persistence across host restarts.

7. **Canonical reference profile.** Whether to author a clean, minimal exemplar profile that
   *defines* the platform's ideal shape, distinct from the first onboarding profile (live-cards,
   which is a pragmatic pilot adopter, not a pristine reference). Note: a **profile** is now defined
   as a *Domain DSL + its lowering to the kernel* ([ADR-0016](decisions/ADR-0016-layered-dsl-stack.md)).

8. **Interaction taxonomy (Layer 3).** The platform-owned interaction vocabulary
    ([ADR-0018](decisions/ADR-0018-interaction-presentation-split.md)) is specified in
    `interaction/src/interaction.ts`: all 12 kinds, each with its `Facet[]` (`{ name, role,
    required }`, `role` = a semantic display role, `required` = never dropped on constrained
    surfaces). Still open: whether these facet sets are *authoritative*, how facets/roles are
    versioned, and how a domain extends the taxonomy without forking it — this taxonomy is "the moat"
    ([ADR-0017](decisions/ADR-0017-platform-boundary.md)) so its shape needs deliberate design.

9. **Presentation planner + compiler + context taxonomy (Layer 3→4).** The seam is now split: a
    `PresentationPlanner` (interaction + context → Presentation DSL; `defaultPresentationPlanner`
    is the deterministic reference, and the slot an AI planner fills) and the Presentation
    *Compiler* (`lowerPresentation`: Presentation DSL → UI DSL). The DSL is a first-class,
    schema-validated artifact (`schemas/presentation.schema.json`) whose regions carry `priority`
    (hierarchy), `disclosure` (progressive disclosure), an optional `presentation` type hint, and an
    optional `rationale` (explainability). The planner reads a real `PresentationContext` — including
    `device` and `expertise`, which now drive density/disclosure — and picks from `layoutTemplates`.
    Still open: the actual **AI planner** (this reference one is rule-based, with no *learned*
    attention or explanation model — it emits a templated rationale, not a reasoned one), whether
    these are the right context axes / templates, and how data-shape should influence presentation.
