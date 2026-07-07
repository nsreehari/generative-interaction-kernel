# ADR-0034 — Declarative reactions (`react`) and shared context (`context`), with the intent⇄product boundary kept native

**Status:** Proposed — 2026-07-07

## Context

The workbench (ADR-0030) wires three columns — chrome, guest, inspect — with three imperative
`useEffect` **bridges** living in `apps/workbench/src/Workbench.tsx`, entirely outside the document:

- **Bridge A (chrome → guest):** watches chrome inputs, runs the `buildSession` compiler, mounts the
  compiled guest, and forwards fires across kernels.
- **Bridge B (guest → inspect):** streams the guest's *rendered output* (`getTree()`, `getLastPatch()`,
  presentation) into inspect.
- **Bridge C (agent → chrome):** an autonomous actor emitting authoring events on its own cadence.

Every such bridge is a hole in the platform's value: it is React-only (a dotnet/Reactor host has no
Bridge A), invisible to the kernel and tooling, unserializable, and untestable in the headless
renderer. The whole reason genui exists — a **closed grammar an agent authors as confined, portable,
host-governed data** rather than arbitrary code — decays in exact proportion to how much real behavior
escapes into these native seams. The mission is therefore to **maximize the fraction of UI behavior
expressible inside the grammar, and keep native a small, audited escape hatch** — not a co-equal path.

Analyzing the bridges against the kernel's existing constructs exposes a precise gap. Reactions form
a 2×2 of {trigger} × {body}, and the kernel already has three of the four cells:

| Trigger \ Body | Pure (produces state) | Effectful (host code / I/O) |
|---|---|---|
| **On event** (tap) | `derive` / `assignFrom` in `on:{…}` ✅ | `invoke` in `on:{…}` ✅ |
| **On state change** (standing) | `computed` (ADR-0033 `ReactiveStateModel`) ✅ | **— nothing —** ❌ |

Bridge A sits in the empty cell: a **standing watch** ("when inputs change") whose **body is effectful**
(`buildSession`). Separately, most cross-runtime sharing in an app is not effectful at all — one region
writes a value another reads — which today forces a `useEffect` only because the two live in different
kernels. And a residue crosses the **author-intent ⇄ interpreter-product** boundary: Bridge A must
*mount* a compiled document (intent ← effect), Bridge B must *read back* rendered output (product →
data). `computed` and any state-sharing mechanism both live strictly on the author-intent side and
cannot express those crossings.

## Decision

Add **two declarative constructs to the closed grammar**, and hold the **intent⇄product boundary as a
native capability** rather than grammar.

### 1. `react` — a declarative reaction (the missing quadrant; maps to `UseEffect`)

A node gains an optional `react: Reaction[]`, where `Reaction = { when: string; run: Action[] }`.
`when` is an expression over state; `run` is a list of the **existing** closed-grammar actions
(`assign`/`derive`/`emit`/`invoke`/`navigate`/`confirm`). Semantics:

- **Kernel-side, change-triggered.** The kernel evaluates each reaction's `when` after a dispatch
  settles; when its value changes from the previously observed value, it runs `run` as a synthetic
  dispatch owned by the node. Executing in the kernel (not the adapter) is what makes it portable —
  React and Reactor both realize it as `UseEffect(deps)`, but the reaction itself is data the kernel
  interprets, identically on every adapter.
- **Baseline, not mount-fire.** The kernel seeds each reaction's baseline from the pre-event snapshot
  on first dispatch, so a reaction fires on genuine *changes*, never spuriously on the initial seed.
- **Bounded.** Reaction firing folds into the existing `MAX_SETTLE_DEPTH` guard, so a reaction whose
  body flips its own `when` cannot loop unbounded.
- **Purity rule stays.** Pure standing derivations remain `computed`; `react` is reserved for genuinely
  effectful bodies (`invoke`) or cross-cell writes. Using `react` to compute `tree = n*2` is a smell —
  `computed` already does it with no effect.

### 2. `context` — shared state as a scope, not new verbs (maps to `UseContext`)

Cross-*kernel* sharing is expressed by surfacing a **single shared `StateModel` as a named context**
that independently-mounted documents bind to. Crucially this adds **no new action verbs** — it is a new
**scope** for the bindings that already exist: `read`/`assign`/`derive` may target a named context
namespace instead of local kernel state, and a **context provider** owns the shared store (seed +
optional `computed`, reusing ADR-0033 machinery, single source of truth to avoid split-brain). The
adapter realizes the provider as a React Context / Reactor `Context`; the **declaration stays data**, so
the sharing is portable and confined, with `UseContext` only the runtime under it.

This retires the bespoke `createSharedComposition` factory and the React `SharedCompositionElement`
primitives (added in commit `6013ff3`): "shared composition" collapses to *a context provider plus
ordinary nodes that read/write it*. No special container, no factory.

### 3. The intent⇄product boundary stays a native leaf capability

The two remaining crossings are **not** brought into the grammar; they become host-curated native
capability components registered in a bundle and referenced declaratively by capability, exactly like
any other leaf:

- **Compiler / guest-host** (Bridge A body): a native leaf that runs `buildSession` internally and
  renders the compiled guest; its inputs bound from context.
- **Inspector** (Bridge B): a native leaf that reads a runtime's resolved tree / last patch and
  displays it — devtools-style reflection stays a host concern, off the app grammar.

The **agent (Bridge C)** stays an external client emitting events; the document only *receives* them.

With this, the workbench's three bridges dissolve into **context + `react` + two native leaves + one
external client** — the grammar reclaims the pure-shared-state and effect-on-state classes, and the
irreducible intent⇄product crossings are confined to a small, audited native surface.

## Alternatives considered

### A. Leave the bridges as `useEffect` in the host
**Rejected because:** they are React-only, invisible to tooling, unserializable, and untestable — each
one erodes the confinement/portability that is the platform's entire reason to exist over "let the
agent author Reactor directly."

### B. Model Bridge A's trigger with `computed`
**Rejected because:** `computed` bodies are pure JSONata producing state; they cannot run a compiler or
any host I/O. Forcing the effectful case through `computed` either lies about purity or smuggles effects
into the reactive store. The honest split is `computed` for pure, `react` for effectful.

### C. Make `context` new action verbs (e.g. `contextWrite`)
**Rejected because:** it needlessly widens the closed grammar (and the dotnet parity surface). Sharing
is a *scope* on the read/assign/derive we already have; a provider owns the store. Fewer verbs, same
power.

### D. Bring the intent⇄product crossings (invoke-returns-fragment, render reflection) into the grammar
**Rejected (for now) because:** mounting an effect's output and reflecting a runtime's rendered tree are
exactly the author-intent ⇄ interpreter-product boundary. Pushing them into the grammar would grow the
closed surface for two host-specific, devtools-flavored concerns. A native leaf capability is the
intended escape hatch, and keeps the grammar strictly on the author-intent side. Revisit only if a
portable, cross-adapter need emerges.

### E. Keep `createSharedComposition` alongside `context`
**Rejected because:** once context bindings exist, the factory is a second, redundant way to express the
same shared-store idea. One mechanism (context) is clearer than two.

## Consequences

- **Two closed-grammar additions ⇒ dotnet parity work.** `react` and the `context` scope are GUP
  surface: the document schema, the TypeScript kernel, and the C# `Kernel` must all honor them, verified
  by the conformance matrix (ADR-0023/0024). Sequencing is **common + TypeScript first, validated, then
  dotnet** — the TS kernel and schema lead; the C# kernel mirrors.
- **`react` executes kernel-side, change-triggered, depth-bounded.** A limitation: a reaction whose
  `when` depends on a `computed` cell observes it only after the reactive store settles; within a single
  kernel tick a computed dependency may lag by one settle. Reactions over direct state are exact; the
  computed-dependent case is eventually-consistent (consistent with ADR-0033).
- **`SharedComposition` factory + React primitives are retired** in favor of context bindings on
  ordinary nodes. Migration removes `providers/shared-composition` and the `adapters/react`
  `SharedComposition*` primitives.
- **The intent⇄product boundary is a documented native surface.** Compiler-host and inspector leaves are
  bundle capabilities, audited like any host code; the agent remains an external client. This is the
  explicit line between what the grammar owns and what the host owns.
- **The workbench becomes (mostly) declarative.** Its remaining native footprint is the two leaves and
  the external agent — a concrete measure of how much the grammar reclaimed.
