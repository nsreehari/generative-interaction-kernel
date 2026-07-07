# ADR-0033 — Provider engines: reactive `StateModel` and StepMachine `Orchestrator`, vendored from proven sources

**Status:** Proposed — 2026-07-07

## Context

The kernel (ADR-0001) owns only *shape*; *vocabulary* is supplied by providers. Two of those provider
seams currently ship as **passive reference implementations** that under-serve real applications:

1. **`StateModel` is a passive bag.** [`kernel/src/providers.ts`](../../kernel/src/providers.ts)
   defines it as `snapshot()` / `get(path)` / `apply(ops)` — a dumb key/value store. Derived state is
   made "live" only because the interpreter **re-evaluates every `derive` edge on every interpret
   pass** (whole-document, pull-based recompute). There is no dependency graph: a change to one base
   cell forces the interpreter to re-run *all* derivations to discover what actually moved. The
   `apps/workbench` guest→inspect derive chains hand-roll exactly this cascade because the store does
   not.

2. **The `Orchestrator` has no durable async execution.** ADR-0009 defines `invoke`/`confirm`/
   `navigate` as post-reduction effects, but the reference `Orchestrator` runs single, fire-and-forget
   effect handlers. There is no branching, retry, circuit-breaking, `forEach`, or resumable/persisted
   multi-step async work — the workbench's cross-kernel bridges (compiler run + event forwarding) exist
   partly to compensate.

Two engines that already solve these problems — battle-tested in the yaml-flow runtime — sit in the
sibling `yaml-flow` repo:

- **`continuous-event-graph/reactive.ts`** — a push-based, self-sustaining dependency graph
  (`drain journal → applyEvents → schedule → dispatch → repeat`). Its **dependency-mode** ("execute
  all eligible tasks", deterministic forward dataflow) is exactly *incremental derived state*: when an
  upstream cell changes, only genuine downstream dependents recompute. `board-live-cards-lib` uses it
  to turn a card's `requires`/`provides` into graph edges and its `compute` into `computed_values`.

- **`step-machine/StepMachine.ts`** — a durable, branching, resumable workflow executor
  (`StepFlowConfig { steps, transitions, failure_transitions, retry, circuit_breaker, forEach,
  terminal_states }`) over a pure reducer + a pluggable store. This is durable async orchestration.

ADR-0016 is explicit that the platform does **not** standardize existing engines *into the kernel* —
the kernel stays closed-grammar and language-neutral. But providers are precisely the seam where such
engines belong. ADR-0027 already set the precedent of **vendoring** a proven engine (canonical JSONata)
into the repo rather than taking an npm dependency, with a provenance note and a "do not hand-edit the
crux" discipline.

## Decision

**Adopt both engines as provider adapters — never as kernel code — and vendor their proven cores
verbatim under a new top-level `providers/` tree, mirroring ADR-0027's vendoring discipline.**

- **`reactive.ts` → a reactive `StateModel` provider.** A thin `ReactiveStateModel implements StateModel`
  wraps `createReactiveGraph`. Each derive edge `{ target, expr, deps }` becomes a task
  (`requires: deps`, `provides: [target]`); each base cell becomes a source task. `apply(ops)` writes
  base cells and pushes graph events; the engine's dependency cascade recomputes **only** affected
  derived cells. The kernel is untouched — this is a drop-in `store` for `createClient({ store })`.

  - **Run the engine in `dependency-mode`, never `eligibility-mode` — this is a correctness
    requirement, not a tuning choice.** The reactive engine offers two execution modes.
    *dependency-mode* ("execute **all** eligible tasks", deterministic forward dataflow) is the only
    mode compatible with a `StateModel`: derived state has exactly one correct value per input
    (`total = a + b` is always `a + b`), a single producer per cell (no conflicts to resolve), and must
    recompute **every** affected dependent. *eligibility-mode* — the exploratory graph — adds goal-directed
    **selection among competing candidate tasks** (`ConflictStrategy`: priority / cost / resource /
    round-robin) and can **stop early** on `goal-reached`; applied to derived state it would be
    non-deterministic, non-confluent, and could leave cells **stale**. The adapter therefore hard-codes
    `execution_mode: "dependency-mode"` (paired with `refreshStrategy: "data-changed"`, which supplies
    the incremental "skip dependents whose inputs didn't move" behavior). **eligibility-mode belongs to a
    different provider** — a future agentic Planner/Source seam that *selects* actions toward a goal —
    not to the authoritative store. The engine's mode split thus mirrors the provider split.

- **StepMachine → an `Orchestrator` provider.** A `StepOrchestrator` maps a genui `invoke` effect to a
  `StepFlowConfig` run over the vendored `StepMachine` + an in-memory store, giving `invoke` durable,
  branching, retryable, resumable semantics (the ADR-0009 effect seam, made real). *(Landed: a tool is
  a named `StepFlowConfig` + step handlers; `invoke(tool, args)` runs it to completion and maps the
  terminal result into a follow-up event and/or store ops. Unregistered tools stay unhandled.)*

- **Vendor the proven cores, mirror the source layout, keep the crux byte-identical.** The copied
  subset lives under `providers/vendor/` in a directory structure that mirrors `yaml-flow/src/` for the
  files copied, so every relative import (`../event-graph/types.js`, `../stores/memory.js`) resolves
  **unchanged** — no edits to the algorithmic core. The only permitted edits are (a) dropping files
  that pull external/domain dependencies not needed for the provider path (the ajv schema validators,
  the YAML/`fs` loaders, the node-`child_process` shell handler, the mermaid/inspect visualizers, and
  the yaml-flow `cli/common` domain glue), and (b) trimming the corresponding re-export lines. A
  `providers/vendor/README.md` records provenance and the "do not hand-edit the crux" rule, exactly as
  `kernel/src/vendor/README.md` does for JSONata.

- **`providers/` is a new top-level sibling** to `kernel/` and `adapters/` — the home for provider
  *implementations* beyond the in-kernel reference ones. Layout:

  ```
  providers/
    vendor/                       # proven engine cores, copied verbatim (crux unmodified)
      event-graph/                #   reactive engine — shared reducer/types/helpers
      continuous-event-graph/     #   reactive engine — push-based live graph (reactive.ts)
      step-machine/               #   StepMachine executor + pure reducer
      stores/                     #   in-memory StepMachine store
    reactive-state-model/         # ReactiveStateModel implements StateModel (+ test)
    step-orchestrator/            # StepOrchestrator implements Orchestrator (follow-up)
  ```

- **Derived state becomes eventually-consistent, by design.** The reactive engine's cascade is
  push/async (handlers initiate, `resolveCallback` completes across microtasks); genui's reduce is
  synchronous. So a `ReactiveStateModel` settles derived cells **across microtasks** rather than within
  one synchronous reduce tick. This matches how the source engine already treats async sources, and is
  correct for a live UI (the settle drives a re-render). The adapter therefore exposes an async
  `settle()` and an `onChange` notification the kernel bridge can use to re-interpret after the graph
  quiesces.

## Alternatives considered

### A. Build the derive-cascade / durable orchestration into the kernel
**Rejected because:** it directly violates ADR-0001 (closed grammar) and ADR-0016 (do not standardize
existing engines into the kernel). The kernel must stay a pure interpreter + pure reducer; a
dependency-graph scheduler and a durable workflow executor are vocabulary, not shape.

### B. Keep the passive `StateModel` (status quo whole-document recompute)
**Rejected because:** re-evaluating every `derive` edge on every pass is O(edges) per change with no
incrementality, and it pushes application code (the workbench) into hand-rolling the very dependency
cascades the store should own. The engine that fixes this already exists and is proven.

### C. Re-implement the engines natively "for genui"
**Rejected because:** it discards the battle-tested crux and creates a second, diverging implementation
to maintain. Vendoring the proven core (ADR-0027 precedent) preserves the exact semantics that already
ship in production.

### D. Take an npm dependency on `yaml-flow`
**Rejected because:** yaml-flow is an application monorepo, not a published, versioned library with a
stable surface; depending on it would couple genui to that whole tree and its `cli/common` domain
glue. Vendoring a small, self-contained subset (9 files for the reactive engine, ~5 for StepMachine)
is the same discipline ADR-0027 chose for JSONata.

## Consequences

- **New top-level `providers/` directory.** Provider implementations beyond the in-kernel reference
  ones now have a home. `providers/tsconfig.json` is added to the `typecheck` chain.

- **Vendored subset carries a provenance README and stays crux-frozen.** Refreshing it means re-copying
  from `yaml-flow/src/` at a pinned point, not hand-editing. The dropped peripherals (yaml/fs loaders,
  ajv validators, shell handler, visualizers, cli glue) are intentionally out of scope for the provider
  path.

- **Derived state is eventually-consistent.** Consumers read settled values via `snapshot()`/`get()`
  after the graph quiesces; the kernel bridge re-interprets on the adapter's `onChange`. This is a real
  semantic shift from "derived within the same synchronous tick" and is recorded here as the defining
  property of the reactive `StateModel`.

- **Stage F (workbench) gets a principled path.** The reactive `StateModel` turns the workbench's
  hand-rolled guest→inspect derive chains into declarative dependency edges the store maintains, and
  the `StepOrchestrator` gives the async `invoke`/source-fetch seam a durable executor — together they
  dissolve much of what makes the three-kernel bridges feel irreducible.

- **First adapter + test land now (ADR "A" follow-through).** `ReactiveStateModel` is implemented with
  a focused test proving that a base-cell `apply` cascades to a derived cell and that an upstream change
  re-derives — the first honest use of a yaml-flow engine inside genui, with zero kernel changes. The
  `StepOrchestrator` adapter has since landed too (branching + retry + an end-to-end `invoke`
  fulfilment through the real Kernel), so both engines are now live behind their provider seams.

## Amendment (2026-07-07): a declarative `computed` construct for standing derivations

Wiring the reactive `StateModel` surfaced a naming/semantics problem in the existing grammar: the
`derive` **action** (`{do:"derive", target, args:{expr}}`, authored inside an `on` handler) is used
for two genuinely different concepts:

- **(A) Standing invariants** — `total = a + b`, `fullName = first & " " & last`. These are *continuous
  relationships* that should hold at all times, independent of which event fired. Living inside an `on`
  handler is incidental — event-scoping carries no information here; it is migration residue. Their
  deps are inferable from the expression, and the declarative form is **analyzable** (cycle detection,
  undefined-cell detection, order-independence) in a way an imperative action sequence is not.

- **(B) Event-bound computed writes** — capturing an event *payload* (`x = event.payload.x`) or an
  intentional *freeze/snapshot* (on "place order", `checkoutTotal = cart.sum`, which must then stop
  tracking `cart.sum`). These genuinely need an event; they are a *write triggered by a moment*, not a
  standing relationship — semantically an `assign`-from-expression, not a derived cell.

**Decision:** introduce a first-class **declarative `computed` construct** — a map of `cell → expression`
— for concept (A). The `ReactiveStateModel` consumes it (via `ReactiveStateModel.fromComputed`), inferring
each cell's dependencies from the expression's parse tree (JSONata AST `path` nodes), so authors — and AI
agents — declare *what* a cell equals, never *when* to recompute it. Concept (B) stays an event-scoped
`assign`/`derive` action; it is **not** auto-lifted, because that would silently change on-event semantics
into on-any-dependency-change. The single overloaded `derive` verb was the only reason blanket auto-lifting
looked unsafe; a distinct construct removes the ambiguity instead of guessing.

**Naming — `computed`, not `derived`.** `computed` is the established term of art (Vue/MobX/Knockout) for
a value that is a standing function of other state, so both humans and agents read the intent immediately;
and it deliberately does **not** share a root with the imperative `derive` action, keeping the A/B split
legible in the grammar (`computed:` = standing cell; `derive`/`assign` = event action). `formulas` (a
spreadsheet flavor that pairs with the adapter's "cells" language) was the runner-up.

**This stays inside ADR-0001 / ADR-0016.** The *declaration* lives in provider-level configuration (and,
later, optionally the authored document); the *incremental cascade engine* stays in the provider. The
kernel remains a pure interpreter that reads a computed cell's value through an ordinary `read` edge and
never learns *how* it became computed. "Make derivation declarative" and "keep the kernel closed-grammar"
are therefore not in tension — the provider seam is exactly where a `computed` construct belongs.

**Why AI-authoring is a better fit here.** A declarative `computed` map is checkable output, not trusted
output: deps are derived mechanically from the expression, cycles and dangling references are detectable,
and the result is order-independent and idempotent. That removes the "did you re-derive `total` in *every*
handler that touches `a`?" burden — precisely the class of bug both humans and agents make in the
imperative form.

*Landed with this amendment:* a JSONata dependency extractor (AST `path`-node walk, mirroring the
`denyUnsafe` walker in `kernel/src/providers.ts`) and `ReactiveStateModel.fromComputed(computed, …)`,
with tests. Cycle detection over a `computed` graph is a natural follow-up the declarative form now makes
possible.
