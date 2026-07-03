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

## Format

Each record follows: **Status · Context · Decision · Alternatives considered (with reasons for
rejection) · Consequences.**
