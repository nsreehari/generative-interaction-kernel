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
> ([ADR-0009](decisions/ADR-0009-orchestrator-effects.md)).

## Open

1. **Safe expression subset.** JSONata is the reference default `ExpressionProvider`
   ([ADR-0007](decisions/ADR-0007-reference-kernel-implementation.md)). Still open: whether a
   smaller, sandboxed subset is *mandated* for agent-authored guards/gates (e.g. no function
   definitions, no `$eval`) versus relying on the provider seam per profile.

2. **Second kernel core (C#).** The TypeScript/JS core exists (Phase 1) and is verified by the
   golden fixture. Embedded placement still implies a second core for the C#/WinUI renderer runtime;
   open whether it is an independent spec-conformant reimplementation (verified by the same
   fixture) or a shared portable core compiled to both targets.

3. **Second render adapter.** React is the first render adapter
   ([ADR-0008](decisions/ADR-0008-first-render-adapter-react.md)). Still open: the WinUI/Reactor
   adapter, which also requires the second (C#) kernel core (item 2), and how render equivalence
   across adapters is verified.

4. **Manifest generation flow.** How a profile *publishes* its `manifest` — derived automatically
   from the DSL schema + registry, hand-authored, or a hybrid. Determines whether the manifest is a
   build artifact or a source artifact.

5. **Versioning & migration policy.** How `manifest` and `document` versions evolve, how a renderer
   negotiates the manifest version, and how breaking capability changes are migrated.

6. **Custom action registration.** The mechanism by which a provider adds actions beyond the six
   closed families, and how those custom actions are declared in the manifest and validated.

7. **Transport bindings.** A `TransportProvider` seam plus an in-memory reference pair and
   `KernelTransportHost` now carry GUP envelopes across a boundary
   ([ADR-0010](decisions/ADR-0010-transport-seam.md)); the host is a broker with a patch log that
   supports reconnection via incremental replay or full resync
   ([ADR-0012](decisions/ADR-0012-reconnection.md)). Still open: the concrete *network* transports
   for the first onboarding profile (SSE exists in the profile today; WebSocket / stdio / in-proc for
   embedded), conveying `fromRev` over that transport, and log persistence across host restarts.

8. **ObservabilitySink format & targets.** The `trace` message shape exists; the sink targets
   (console, OpenTelemetry, ETW, file) and required trace points are not yet fixed.

9. **Human-in-the-loop `confirm` UX contract.** The `confirm` action now runs as an Orchestrator
   effect: the Orchestrator surfaces the prompt and returns the approval/denial as a follow-up event
   ([ADR-0009](decisions/ADR-0009-orchestrator-effects.md)). Still open: a *standard* prompt payload
   shape, cancellation/timeout, and how denial vs. approval are conventionally named on the wire.

10. **Progressive / streaming document assembly.** Whether v0.1 supports partial documents
    materializing as they are produced by an agent, and how that is expressed on the wire. (Orchestrator
    results already stream follow-up patches within a dispatch, but agent-side streaming of the initial
    `document` is separate.)

11. **Conformance suite scope.** The Phase 1 kernel added executable cases beyond the single golden
    fixture (gate visibility, guard-skipped invoke, machine transition, rev sequencing, trace
    observability, validate-before-commit rejection). Still open: the full required matrix
    (edge/negative cases) and **reducer equivalence across kernels** (JS vs a future C# core).

12. **Canonical reference profile.** Whether to author a clean, minimal exemplar profile that
    *defines* the platform's ideal shape, distinct from the first onboarding profile (live-cards,
    which is a pragmatic pilot adopter, not a pristine reference).
