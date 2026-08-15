# ADR-0002 — Interaction is a first-class behavior edge, not a second kernel

**Status:** Accepted — 2026-07-03

**Amended by:** [ADR-0049](ADR-0049-stable-event-contracts-and-effect-settlements.md) separates stable event declarations from selectable `behavior.on` handlers and closes the grammar at five actions.

## Context

The closed grammar encoded data reads (`read`), data writes (`write`), structure (`child`), and
visibility (`gate`), but had no declarative surface for **interactions** — intra-component (a
submit, a select, an edit) or inter-component (one node affecting another). Interaction behavior
was implicit inside component implementations and the orchestration layer. The question raised was
whether interactions require an additional "meta DSL / meta kernel."

## Decision

Promote interaction to a **first-class behavior edge**: `event → action → target`, symmetric with
`read` (data in) and `write` (data out). The kernel fixes the *shape* of an interaction and a
**closed set of action families** (`assign`, `derive`, `invoke`, `emit`, `navigate`, `confirm`);
providers supply the *vocabulary* (which events a capability emits, which custom actions exist).

Inter-component interaction requires **no separate mechanism**: an action writes to a shared
namespace path; another node already reads that path; reactive propagation re-resolves it. The
dataflow graph and the interaction graph are the same graph.

The genuine "meta" level the question sensed is the **Manifest** — the plane that declares the
capability/event/action vocabulary — not a second kernel. Three planes are distinguished:
**Kernel** (shape) · **Manifest** (vocabulary) · **Document** (a specific use).

## Alternatives considered

### A. A separate meta-kernel layer for interactions
**Rejected because:** it duplicates interpretation, validation, and tracing; it splits the unified
graph into a render graph and an interaction graph; and it misidentifies the needed extra
declarative level. The extra level that interactions require is the Manifest, which already exists
to declare capabilities.

### B. Leave interactions imperative inside components
**Rejected because:** imperative behavior is not portable, not validatable, not traceable, and not
agent-authorable — defeating the platform's purpose.

## Consequences

- Behavior is declarative, portable, validatable, traceable, and agent-authorable.
- `invoke`/`confirm` are the declarative seam to the Orchestrator provider and the human-in-the-loop
  approval gate.
- The existing reactive derivation model (`derive`) is recognized as the **data-only subset** of the
  behavior edge, unifying compute and interaction.
