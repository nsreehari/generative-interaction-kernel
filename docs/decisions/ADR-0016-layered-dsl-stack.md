# ADR-0016 — Layered DSL stack: one kernel, lowering compilers above it

**Status:** Accepted — 2026-07-04

## Context

Real platforms serve many domains (security, workflow, compliance, data). The tempting move is
one UI DSL per domain, each with its own renderer. That fragments fast: every domain team has to
learn UI primitives (`grid`, `flex`, `column`), and you end up rebuilding React/XAML with extra
steps.

The cleaner shape is **layers of abstraction**, not many DSLs:

```
Task / Intent DSL    "what are we trying to do"        (an agent usually emits here)
      |
Domain DSL           "what concepts exist here"        (a domain team owns this)
      |
Interaction DSL      "how is this pattern used"        (the platform owns this)
      |
UI DSL = kernel doc  "how it is expressed"             (the closed grammar)
      |
Renderer(s)          React / WinUI / Teams / ...
```

The kernel's closed grammar (ADR-0001, ADR-0002) is already the bottom **UI DSL** layer. The open
question was where the higher layers live, and whether each one needs its own kernel or grammar.

## Decision

**Keep one kernel and one grammar. Every layer above it is a *lowering stage* — a pure transform
that compiles a higher-level DSL down to the layer below, ending at a kernel document.**

- A stage is `Stage<In, Out> = (input: In) => Out`. Stages compose into a pipeline
  (`pipeline(a).to(b).to(c)`), and the last stage always produces a kernel `DocumentPayload`.
- The produced document passes the **same validate-before-commit gate** as a hand-authored one
  (`lowerToDocument`, mirroring `authorDocument` in ADR-0013). So a bug in a higher-layer compiler
  is caught at the kernel boundary, not at render time.
- Layers are **optional**. A simple profile can go straight `Domain -> UI`. A rich one uses all
  four. Nothing forces a Task or Interaction layer to exist.
- **A profile declares layers and lowering recipes.** In the simplest case that is still a Domain
  DSL plus one lowering stage; in richer cases it is an ordered artifact describing multiple layers
  and the recipes between them. See ADR-0038 for the declarative artifact form.

The ownership rule that falls out of this:

> **Domains own semantics · the platform owns interaction patterns · renderers own visual
> implementation.**

## Where agents author, and where the kernel sits

- **Agents may author at any layer**, but should emit at the **highest layer they can**. Emitting a
  Task or Domain document keeps the LLM away from raw UI and lets the lowering enforce house style,
  accessibility, and theming. Authoring lower is still allowed and still safe — the kernel is the
  common floor and every layer ends at the same validated document.
- **The kernel is composable for every layer** in the sense that all layers **terminate at the same
  kernel document**; it is *not* re-run per layer. Lowering happens once, top-to-bottom, and the
  kernel interprets the single document that comes out. Higher layers are compile-time; the kernel
  is run-time.

## Alternatives considered

### A. One UI DSL per domain, each with its own renderer
**Rejected because:** it fragments (N DSLs -> N renderers), forces every domain team to become a UI
expert, and loses a single conformance target. It is the failure mode this ADR exists to avoid.

### B. A separate kernel/grammar per layer
**Rejected because:** it duplicates interpretation, validation, and tracing at every layer and
breaks the single-document invariant. This is the same reasoning as ADR-0002 (interaction is an
edge, not a second kernel), applied to layers.

### C. Expose the UI DSL directly to domain teams and agents
**Rejected because:** the UI DSL leaks upward, domain code fills with `grid`/`flex`/`column`, and
you have reinvented React/XAML. Keeping the UI DSL internal (reached only through lowerings) is the
guardrail.

## Consequences

- The platform is **one kernel + one renderer contract + a stack of pluggable lowering compilers**.
- Each stage is pure and independently testable; the conformance matrix (ADR-0015) extends to
  **per-stage** checks, while cross-kernel equivalence still only has to hold at the UI-DSL layer.
- The **Interaction DSL** — a platform-owned, domain-agnostic pattern library (`compare`,
  `master-detail`, `drilldown`, `wizard`, `selectable`) — is now a named layer to build. It is the
  piece that stops every domain re-learning UI primitives. Left open (not-yet-decided #13/#14).
- Agent-authoring (ADR-0013) is unchanged at the kernel layer and now has room to grow upward:
  typed builders can exist per layer, all ending at the same validated document.
- ADR-0038 refines the representation of a profile from code-only stage composition to a
  declarative artifact of layers + data-driven lowering recipes.
- No new grammar, no new wire message. The layered stack is entirely compile-time above an
  unchanged kernel and protocol.
