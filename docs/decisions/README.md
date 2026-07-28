# Architecture Decision Records

Each ADR captures one decision: its context, the decision, the alternatives considered, why the
rejected options were set aside, and the consequences.

| ADR | Title | Status |
|---|---|---|
| [0001](ADR-0001-closed-grammar-kernel.md) | Closed-grammar kernel with provider-supplied vocabulary | Accepted |
| [0002](ADR-0002-interaction-as-edge.md) | Interaction is a first-class behavior edge, not a second kernel | Accepted |
| [0003](ADR-0003-stateless-events-with-reducer.md) | Stateless events; sequencing as data reduced by a pure reducer | Accepted |
| [0004](ADR-0004-protocol-over-sdk.md) | Deliver as a protocol + kernel, not an in-process SDK | Accepted |
| [0005](ADR-0005-kernel-placement.md) | Kernel placement: hybrid, primarily embedded | Accepted |
| [0006](ADR-0006-render-adapter-infra-agnostic.md) | Render adapter is storage/transport/persistence agnostic | Accepted |
| [0007](ADR-0007-reference-kernel-implementation.md) | Reference kernel implementation — TypeScript first, JSONata default | Accepted |
| [0008](ADR-0008-first-render-adapter-react.md) | First render adapter — React | Accepted |
| [0009](ADR-0009-orchestrator-effects.md) | Orchestrator — invoke/confirm/navigate as post-reduction effects | Accepted |
| [0010](ADR-0010-transport-seam.md) | Transport — GIK over a transport seam | Accepted |
| [0011](ADR-0011-client-runtime.md) | Client runtime — interpret + state replica on the renderer side | Accepted |
| [0012](ADR-0012-reconnection.md) | Reconnection — broker host with a patch log, resume or full resync | Accepted |
| [0013](ADR-0013-agent-authoring.md) | Agent-authoring path — typed builders, validate-before-commit, lint over throw | Accepted |
| [0014](ADR-0014-http-sse-transport.md) | Concrete transport binding — HTTP + SSE, kept out of the portable core | Accepted |
| [0015](ADR-0015-conformance-matrix.md) | Behavioral conformance matrix — portable JSON cases + per-kernel runner | Accepted |
| [0016](ADR-0016-layered-dsl-stack.md) | Layered DSL stack — one kernel, lowering compilers above it | Accepted |
| [0017](ADR-0017-platform-boundary.md) | Platform boundary — the platform owns Interaction, Presentation, Runtime | Accepted |
| [0018](ADR-0018-interaction-presentation-split.md) | Interaction / Presentation split — with a context-aware presentation compiler | Accepted |
| [0019](ADR-0019-confirm-contract.md) | Human-in-the-loop `confirm` contract — standard prompt, outcomes, event names | Accepted |
| [0020](ADR-0020-observability-sink.md) | ObservabilitySink — fixed trace points + reference sinks | Accepted |
| [0021](ADR-0021-optional-layers.md) | Layers are optional; only the terminal UI-DSL document is validated | Accepted |
| [0022](ADR-0022-defer-streaming.md) | v0.1 ships complete documents; incremental streaming deferred | Accepted |
| [0023](ADR-0023-conformance-runner-portability.md) | Conformance runner contract — pin the language-neutral semantics a second kernel must honor | Accepted |
| [0024](ADR-0024-second-kernel-csharp.md) | Second kernel — an independent C# reimplementation verified by the conformance matrix | Accepted |
| [0025](ADR-0025-orchestrator-scripting-conformance.md) | Scripted Orchestrator effects in the conformance matrix — portable effect-seam behavior | Accepted |
| [0026](ADR-0026-second-render-adapter-dotnet.md) | Second render adapter — a renderer-agnostic C# adapter core (Reactor/WinUI binding is a thin edge) | Accepted |
| [0027](ADR-0027-own-jsonata-engine.md) | Own the JSONata engine in both kernels — no third-party dependency, no separate package | Accepted |
| [0028](ADR-0028-safe-expression-subset.md) | Safe expression subset — a provider capability, mandated-safe by default for predicate positions | Accepted |
| [0029](ADR-0029-winui-reactor-binding.md) | WinUI/Reactor render binding — the toolkit edge on the C# adapter core, with cross-adapter equivalence anchored by the shared walk | Accepted |
| [0030](ADR-0030-bundle-composition.md) | The bundle — one host runs any app; apps compose via an `embed` leaf | Accepted |
| [0031](ADR-0031-per-bundle-registries.md) | Per-bundle capability registries — shared floor + additive overlay | Accepted |
| [0032](ADR-0032-framework-keyed-bundles.md) | Framework-keyed bundles — `samples/bundles/` sibling to `samples/apps/`, apps compose them | Proposed |
| [0033](ADR-0033-provider-engines-reactive-statemodel-step-orchestrator.md) | Provider engines — reactive `StateModel` and StepMachine `Orchestrator`, vendored from proven sources | Proposed |
| [0034](ADR-0034-declarative-reactions-and-context.md) | Declarative reactions (`react`) and shared context (`context`), with the intent⇄product boundary kept native | Proposed |
| [0035](ADR-0035-stop-dotnet-port.md) | Stop the C#/.NET port — master becomes TypeScript-only; the port is frozen on the `dotnet-port` branch | Accepted |
| [0036](ADR-0036-rename-navigate-to-route.md) | Rename the `navigate` action verb to `route` — a medium-neutral name for the closed grammar's flow/destination handoff | Accepted |
| [0037](ADR-0037-face-projections-and-transport-boundary.md) | Face package with pure/live strata; projections own policy, transports stay agnostic | Accepted |
| [0038](ADR-0038-declarative-profiles-and-lowering-recipes.md) | Declarative profiles — layers plus data-driven lowering recipes | Accepted |
| [0039](ADR-0039-sync-expression-evaluation.md) | Platform JSONata is pure — a single canonical engine version, no divergent sync build | Accepted |
| [0040](ADR-0040-external-services-and-queueface.md) | External services as one adapter contract — host execution, Blueprint-owned operations, Face projections | Accepted (amended) |
| [0041](ADR-0041-blueprint-first-hosting-and-controlface-lowering.md) | Blueprint-first application hosting — ControlFace owns runtime opening and lowering lifecycle | Accepted (amended) |
| [0042](ADR-0042-controlled-invocation-progress.md) | Controlled invocation progress with terminal settlement | Proposed |
| [0043](ADR-0043-lowering-compiler-plane-and-artifact-cells.md) | Lowering compiler plane and artifact Cells | Accepted |
| [0044](ADR-0044-provider-neutral-durable-transition-runtime.md) | Provider-neutral durable transition runtime | Accepted |
| [0045](ADR-0045-lowering-meta-graph-as-cells-on-the-same-kernel.md) | The lowering meta-graph runs as Cells on the same Kernel — no second execution engine | Accepted |

## Format

Each record follows: **Status · Context · Decision · Alternatives considered (with reasons for
rejection) · Consequences.**
