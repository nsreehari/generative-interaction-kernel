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
| [0010](ADR-0010-transport-seam.md) | Transport — GUP over a transport seam | Accepted |
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

## Format

Each record follows: **Status · Context · Decision · Alternatives considered (with reasons for
rejection) · Consequences.**
