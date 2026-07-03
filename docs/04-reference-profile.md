# 04 — Reference profile: live-cards (yaml-flow + demo-boards-ns-code + demo-boards-frontend)

The **first reference profile** — the concrete instantiation that proves the kernel is generic — is
the existing three-repo system, mapped onto the platform's provider seams. This profile is called
**live-cards**.

Its role is *evidence*, not *goal*: it demonstrates one full set of providers so the kernel's
contracts are validated against something real. It is **not** the platform, and standardizing it is
not the objective (see [ADR-0001](decisions/ADR-0001-closed-grammar-kernel.md)).

## Provider mapping

| Provider (kernel contract) | Reference-profile implementation | Repo |
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

| Kernel edge | Reference-profile mechanism |
|---|---|
| `render` | `kind` → component |
| `read` | `bind` / `bind_ref` into a namespace |
| `write` | `writeTo` into a namespace |
| `child` | nested `children` / tier composition |
| `gate` | `visible` predicate |
| `behavior` | *currently imperative in components + the compute engine; to be extracted into declarative `on`/`do` edges* |

## What this profile exercises vs what it forces us to build

- **Exercises (already real):** the DSL, registry, data/namespace model, expression language,
  renderer, orchestrator, and transport — one working instance of every seam except observability.
- **Forces us to build (kernel-level):** the declarative **behavior edge** (interactions today are
  imperative), **observability**, and the **manifest** as an explicit published artifact derived
  from the schema + registry.

## Status

Reference profile **selected**. Mapping documented here. Extraction into conforming providers is
future work; the immediate artifact is the wire protocol schemas + a golden fixture drawn from this
profile (see [schemas/](../schemas/README.md)).
