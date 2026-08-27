# 04 - Onboarding profiles

An onboarding profile maps an existing application onto the kernel's provider
seams. It is a migration and validation aid, not a canonical definition of the
platform.

## Onboarding profile != canonical reference profile

A pilot adopter will usually carry legacy residue and imperfect mappings. That
is useful: it pressure-tests the contracts and reveals where adapters or new
framework capabilities are needed.

The governing rule from
[ADR-0001](decisions/ADR-0001-closed-grammar-kernel.md) is that the kernel does
not bend to fit one application's quirks. Each mismatch must be classified as
either:

- a general requirement that belongs in the public framework;
- an adapter concern at a provider seam; or
- product-specific residue that remains outside the framework.

A clean reference profile may be authored separately to demonstrate the ideal
platform shape. It should use repository-owned public fixtures and must not
depend on private application repositories or deployment infrastructure.

## Provider mapping

An onboarding assessment should map the application to these public contracts:

| Provider seam | Evidence to identify |
|---|---|
| **SchemaProvider** | The domain grammar and validation rules |
| **CapabilityRegistry** | The mapping from declared capabilities to implementations |
| **StateModel** | State namespaces, derivations, and storage adapters |
| **ExpressionProvider** | The expression dialect and evaluation boundary |
| **RenderAdapter** | The interpreter from kernel nodes to platform views |
| **Orchestrator** | Governed effect and tool execution |
| **TransportProvider** | Process or network transport for projections |
| **ObservabilitySink** | Trace capture and diagnostics |

## Fit assessment

Classify each seam into one of three buckets:

| Bucket | Meaning |
|---|---|
| **Maps cleanly** | The public provider contract is satisfied as-is |
| **Needs an adapter** | A bounded translation layer is sufficient |
| **Framework gap or product residue** | Deliberate triage is required |

This classification prevents an onboarding implementation from becoming an
implicit, product-shaped extension of the kernel.
