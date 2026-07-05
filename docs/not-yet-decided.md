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
> ([ADR-0022](decisions/ADR-0022-defer-streaming.md)); **safe expression subset** → enforcement is a
> provider capability (compile-time AST rejection of `$eval`/lambda/`transform`), mandated-safe by
> default for predicate positions (gates + guards) and overridable through the seam
> ([ADR-0028](decisions/ADR-0028-safe-expression-subset.md)); **second render adapter** → a
> renderer-agnostic C# core plus a concrete **WinUI/Reactor** binding (`TView = Element` + a host
> window) outside the offline island, with cross-adapter render equivalence anchored by the single
> shared `Renderer.Render` walk ([ADR-0026](decisions/ADR-0026-second-render-adapter-dotnet.md),
> [ADR-0029](decisions/ADR-0029-winui-reactor-binding.md)).

## Open

1. **Manifest generation flow.** How a profile *publishes* its `manifest` — derived automatically
   from the DSL schema + registry, hand-authored, or a hybrid. Determines whether the manifest is a
   build artifact or a source artifact.

2. **Versioning & migration policy.** How `manifest` and `document` versions evolve, how a renderer
   negotiates the manifest version, and how breaking capability changes are migrated.

3. **Custom action registration.** The mechanism by which a provider adds actions beyond the six
   closed families, and how those custom actions are declared in the manifest and validated.

4. **Transport bindings.** A `TransportProvider` seam plus an in-memory reference pair and
   `KernelTransportHost` now carry GUP envelopes across a boundary
   ([ADR-0010](decisions/ADR-0010-transport-seam.md)); the host is a broker with a patch log that
   supports reconnection via incremental replay or full resync
   ([ADR-0012](decisions/ADR-0012-reconnection.md)); and a concrete **HTTP/SSE** binding
   (`transports/http-sse/`) carries the full protocol over a real socket, conveying `fromRev` as a
   query param ([ADR-0014](decisions/ADR-0014-http-sse-transport.md)). Still open: additional network
   bindings (WebSocket / stdio / in-proc for embedded), auth on the endpoints, and session/log
   persistence across host restarts.

5. **Canonical reference profile.** Whether to author a clean, minimal exemplar profile that
   *defines* the platform's ideal shape, distinct from the first onboarding profile (live-cards,
   which is a pragmatic pilot adopter, not a pristine reference). Note: a **profile** is now defined
   as a *Domain DSL + its lowering to the kernel* ([ADR-0016](decisions/ADR-0016-layered-dsl-stack.md)).

6. **Interaction taxonomy (Layer 3).** The platform-owned interaction vocabulary
    ([ADR-0018](decisions/ADR-0018-interaction-presentation-split.md)) is specified in
    `interaction/src/interaction.ts`: all 12 kinds, each with its `Facet[]` (`{ name, role,
    required }`, `role` = a semantic display role, `required` = never dropped on constrained
    surfaces). Still open: whether these facet sets are *authoritative*, how facets/roles are
    versioned, and how a domain extends the taxonomy without forking it — this taxonomy is "the moat"
    ([ADR-0017](decisions/ADR-0017-platform-boundary.md)) so its shape needs deliberate design.

7. **Presentation planner + compiler + context taxonomy (Layer 3→4).** The seam is now split: a
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
