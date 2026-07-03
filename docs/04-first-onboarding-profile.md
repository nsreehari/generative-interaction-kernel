# 04 — First onboarding profile: live-cards (yaml-flow + demo-boards-ns-code + demo-boards-frontend)

The **first profile to onboard** onto the platform is the existing three-repo system, mapped onto
the platform's provider seams. This profile is called **live-cards**.

## Onboarding profile ≠ canonical reference profile

This is the **first real system we migrate onto the platform** — a pilot adopter — **not** a
pristine, canonical exemplar that *defines* the platform's ideal shape. It carries legacy residue
and will not map perfectly. Its value is precisely that: it pressure-tests the abstractly-defined
contracts against a messy reality and surfaces where adapters or new platform capabilities are
needed.

**Governing rule (per [ADR-0001](decisions/ADR-0001-closed-grammar-kernel.md)):** we do **not** bend
the kernel to fit this profile's quirks. Where the profile does not map cleanly, each case is
decided deliberately — either it is a genuine, general need (→ add a platform capability) or it is
profile residue (→ migrate it). Reverse-engineering the platform to match live-cards would be
exactly the "standardize the existing DSL" path that was rejected.

A clean, canonical *reference* profile (a minimal exemplar built to demonstrate the ideal) may be
authored separately later; it is tracked in [not-yet-decided.md](not-yet-decided.md).

## Provider mapping

| Provider (kernel contract) | Onboarding-profile implementation | Repo |
|---|---|---|
| **SchemaProvider** | `live-cards.schema.json` (per-kind constrained draft-07 DSL) | yaml-flow |
| **CapabilityRegistry** | the `kind → component` registry + cardview entries | demo-boards-frontend |
| **StateModel** | namespaces `card_data` / `requires` / `fetched_sources` / `computed_values`; `CardCompute` derivation; storage adapters (FS / Firebase / Azure / in-memory / localStorage) | yaml-flow |
| **ExpressionProvider** | JSONata (runtime `jsonata-sync`) | yaml-flow |
| **RenderAdapter** | `NodeRenderer` interpreter + tier renderers (Board / Pane / Card / Cardview) | demo-boards-frontend |
| **Orchestrator** | Azure AI Foundry agent loop + MCP server (tool registries, preflight validation) | demo-boards-ns-code |
| **TransportProvider** | SSE slices (`openBoardSse`) + board-sse-state reducer | demo-boards-frontend / yaml-flow |
| **ObservabilitySink** | *(gap — to be built at the kernel level)* | — |

## Grammar mapping

| Kernel edge | Onboarding-profile mechanism |
|---|---|
| `render` | `kind` → component |
| `read` | `bind` / `bind_ref` into a namespace |
| `write` | `writeTo` into a namespace |
| `child` | nested `children` / tier composition |
| `gate` | `visible` predicate |
| `behavior` | *currently imperative in components + the compute engine; not yet a declarative `on`/`do` edge* |

## Fit assessment

Onboarding sorts each seam into one of three buckets:

| Bucket | Meaning | Examples in live-cards |
|---|---|---|
| **Maps cleanly** | provider contract satisfied as-is | SchemaProvider, ExpressionProvider (JSONata), StateModel namespaces |
| **Needs an adapter/shim** | works via a thin translation layer | CapabilityRegistry (`kind→component` map), TransportProvider (SSE), RenderAdapter (`NodeRenderer`, plus the dual-grammar `normalizeElement` bridge) |
| **Genuine gap or residue** | requires a platform feature *or* profile migration | declarative **behavior edge** (interactions are imperative today); **observability** (no `trace`); explicit **manifest** as a published artifact |

The third bucket is the point of onboarding: each item is triaged as *platform capability to add*
vs *profile residue to migrate* — never as "bend the kernel."

## Status

First onboarding profile **selected** and mapped. Extraction into conforming providers (and the
triage of the "genuine gap or residue" bucket) is future work. The golden fixture in
[schemas/](../schemas/README.md) is drawn from this profile as an illustrative example — not as a
normative reference.
