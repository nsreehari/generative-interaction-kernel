# Documentation guide

## Consumer documentation

The [root package map](../README.md#choose-a-package) links every public and
private workspace package. Each package README owns its installation guidance,
entry points, exported API, and examples. Package versions and dependency ranges
belong to `package.json`; do not maintain parallel version catalogs here.

The [samples repository](https://github.com/nsreehari/gik-samples) owns component
documentation, runnable Blueprints, Studio, and application-specific host setup.

## Cross-package contracts

| Document | Scope |
| --- | --- |
| [Purpose-bearing Cells](dpp.md) | Full DPP manifest, context dataflow, correlation, lowering, and withdrawal |
| [Cell Senses](senses.md) | Observation declarations, host reconciliation, delivery and durability limits |
| [Architecture](02-architecture.md) | Provider boundaries, reduction, state/effect ownership, and composition |
| [Protocol](03-protocol.md) | Portable wire messages and revision semantics |
| [Conformance](../conformance/README.md) | Language-neutral execution cases and runner obligations |
| [JSONata conformance](../conformance/jsonata/README.md) | Expression corpus and deterministic verification |
| [Schemas](../schemas/README.md) | Wire schema and fixture validation |
| [Maintainer contracts](sot/README.md) | Cross-package implementation responsibilities and compatibility detail |
| [Releasing](releasing.md) | Versioning, publication, and external verification |
| [Agent operations](automation/dual-agent-operations.md) | Maintainer-approved issue routing and execution |

## Design and history

- [Vision](01-vision.md) explains the platform's motivation.
- [Onboarding profiles](04-first-onboarding-profile.md) classifies adopter
  requirements without making one application's DSL the platform grammar.
- [Architecture decisions](decisions/README.md) retain rationale and amendments.
- [Discussion log](discussion-log.md) and [parked decisions](not-yet-decided.md)
  are historical/design material, not current package installation instructions.

Prefer a link to the owning README over another API list or setup sequence.
Retain unique protocol semantics, boundary invariants, test contracts, and
decision rationale; those are not redundant onboarding material.
