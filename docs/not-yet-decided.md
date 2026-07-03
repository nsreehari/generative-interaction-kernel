# Not Yet Decided

Open decisions parked here so they are not forgotten. Each will graduate to an ADR when resolved.
Resolved items are removed from this list and recorded in [decisions/](decisions/README.md).

> Resolved since the last replay: **reference profile** → live-cards
> ([04-reference-profile.md](04-reference-profile.md)); **kernel placement** → hybrid, primarily
> embedded ([ADR-0005](decisions/ADR-0005-kernel-placement.md)).

## Open

1. **Expression dialect.** The `ExpressionProvider` language is pluggable, but the reference kernel
   needs a default. Candidate: **JSONata** (used by the live-cards profile). Decide whether JSONata
   is the reference default and whether a smaller safe subset is mandated for agent-authored guards.

2. **Reference kernel core: language & runtime.** Embedded placement means the core runs per
   renderer runtime (JS **and** C#). Decide the first target (likely JS/React) and whether the two
   cores share one portable implementation (e.g. a single core compiled to multiple targets) or are
   independent spec-conformant reimplementations verified by the conformance fixture.

3. **First renderer.** Which `RenderAdapter` to build first for the live-cards profile — React
   (matches the existing frontend) or WinUI/Reactor — to demonstrate the protocol end to end.

4. **Manifest generation flow.** How a profile *publishes* its `manifest` — derived automatically
   from the DSL schema + registry, hand-authored, or a hybrid. Determines whether the manifest is a
   build artifact or a source artifact.

5. **Versioning & migration policy.** How `manifest` and `document` versions evolve, how a renderer
   negotiates the manifest version, and how breaking capability changes are migrated.

6. **Custom action registration.** The mechanism by which a provider adds actions beyond the six
   closed families, and how those custom actions are declared in the manifest and validated.

7. **Transport bindings.** The concrete transports for the reference profile (SSE exists today;
   WebSocket / stdio / in-proc for embedded). Decide the reference set.

8. **ObservabilitySink format & targets.** The `trace` message shape exists; the sink targets
   (console, OpenTelemetry, ETW, file) and required trace points are not yet fixed.

9. **Human-in-the-loop `confirm` UX contract.** How the `confirm` action surfaces to the user and
   how approval/denial flows back as an event.

10. **Progressive / streaming document assembly.** Whether v0.1 supports partial documents
    materializing as they are produced by an agent, and how that is expressed on the wire.

11. **Conformance suite scope.** What the conformance suite must cover beyond the single golden
    fixture (edge cases, negative cases, reducer equivalence across kernels).
