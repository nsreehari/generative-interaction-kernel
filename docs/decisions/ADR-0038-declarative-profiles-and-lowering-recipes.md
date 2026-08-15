# ADR-0038 — Declarative profiles: layers + data-driven lowering recipes

**Status:** Accepted — 2026-07-13

## Context

ADR-0016 established that the platform is one kernel plus higher-layer lowering stages. ADR-0018
split the platform-owned span into Interaction and Presentation, but the concrete implementation
still encoded the last translation step as a hard-coded `PresentationBinding` object in TypeScript.

That left three gaps:

- the profile itself was not a first-class artifact;
- the lowering contract was code-first rather than agent-authorable;
- the workbench still treated a binding as the primary unit instead of a profile.

At the same time, the kernel's terminal document language already contains the exact runtime edge
surface we want lowerings to target: `props`, `read`, `readExpr`, `on`, and `children`.
Introducing a second recipe-only binding language (`propsFrom`, `dataProp`, per-field remap
tables) would duplicate that surface and create drift.

As amended by ADR-0034 on 2026-08-13, reaction edges are no longer part of the Kernel document or
Blueprint Cell behavior grammar.

## Decision

Adopt **declarative profiles** as first-class artifacts.

- A **Profile** declares **N layers** and **N-1 lowering recipes** between them.
- A **GenUiProfile** is the first standardized profile kind (`kind: "genui-profile"`).
- **All lowering recipes are data-driven artifacts.** No profile-specific lowering logic is authored
  as hard-coded binding tables in TypeScript.
- Lowering recipes compile into the kernel's existing runtime-document language. They do **not**
  introduce a parallel binding DSL.
- The workbench becomes **profile-first**: it loads a profile, resolves its recipes, runs the
  declared lowerings, and inspects the resulting artifacts.

The first standardized GenUI layer kinds are:

- `interaction`
- `presentation`
- `runtime-document`

The first artifact set is intentionally narrow:

- a profile artifact (`type: "profile"`)
- lowering recipe artifacts (`type: "lowering-recipe"`)

The execution rule is:

> **Profiles declare layers; recipes declare transformations; the kernel still validates only the
> terminal runtime document before execution.**

## Recipe surface

Recipe artifacts must reuse the runtime-document vocabulary wherever possible.

- Use `props` for static authored configuration.
- Use `read` for plain state-path bindings.
- Use `readExpr` for shaped bindings.
- Use `on` for event handlers.
- Use `children` for structural emission.

Recipe artifacts must not invent redundant remapping concepts such as `propsFrom`, `dataProp`, or
field-by-field region-prop aliases when the lowerer can emit the terminal document fields directly.

## Planner stance

The platform still distinguishes planning from lowering:

- `interaction -> presentation`
- `presentation -> runtime-document`

Both transitions are declared by data-driven recipe artifacts. The execution engine that interprets
those artifacts may remain simple and deterministic at first, but the authored contract is data,
not a profile-local hard-coded binding.

## Workbench stance

The workbench's unit is now the **profile**, not a loose `{ spec, ctx, binding }` tuple.

- it loads a profile;
- resolves declared recipes;
- runs the lowering chain for the current interaction + context;
- exposes the intermediate artifacts and final runtime document for inspection/editing.

`liveCards` remains only the first migrated specimen used to validate the abstraction. It is not a
platform primitive.

## Alternatives considered

### A. Keep `PresentationBinding` and add a compatibility wrapper
**Rejected because:** the repo is pre-release and does not benefit from preserving a binding-centric
API that we already know is the wrong abstraction. Carrying both models would increase drift.

### B. Add a recipe DSL that introduces `propsFrom` / `dataProp` / alias maps
**Rejected because:** the kernel already owns the terminal document language. A parallel binding DSL
would duplicate semantics, increase authoring confusion, and make ACX worse rather than better.

### C. Keep profiles as code-only `Stage` composition
**Rejected because:** ACX needs authored artifacts that can be generated, linted, validated,
reviewed, diffed, and stored independently of handwritten TypeScript.

## Consequences

- `PresentationBinding` is migration residue and should be removed.
- The generic profile machinery (`@gik/profile`) gains explicit profile and recipe contracts,
  validators/lints, GenUI interpreters, and template-driven authoring/runtime helpers. (2026-07-13:
  this superseded the former single `interaction/` source tree; later cleanup folded the GenUI
  executable semantics into `@gik/profile` and left declarative assets under `profile/profile-templates/*`.)
- The workbench pivots to a profile-first model.
- Existing ADRs that described profile translation in terms of `binding` need refinement, not
  reversal.
- The kernel grammar and wire protocol remain unchanged.

## Amendment (2026-07-29): deterministic materialization context

ADR-0046 fixes the execution invariant for these recipes: an authored Blueprint and immutable
external context deterministically produce one terminal Blueprint. Context carries pinned profile,
policy, capability, locale, and strategy decisions; mutable runtime state is not a recipe input.
Recipe scheduling remains declarative lowering inside `@gik/blueprint`, not host-specific logic.

## Amendment (2026-07-29): one vocabulary-driven compiler meta-graph

All tier chains are lowered by one package-owned compiler meta-graph Blueprint. Recipes remain
portable transformation data expressed in the shared vocabulary; they do not name or embed a
compiler for each `from`/`to` pair. The same fixed meta-graph interprets an ordered chain of any
length, carrying each emitted artifact into the next tier until it reaches the terminal tier.

The first runtime implementation keeps that meta-graph fixed and executes only deterministic,
synchronous lowering during `materializeBlueprint`. Meta-graph reconfiguration, agent or human
pipelines, fallback-driven patch suggestions, and durable meta-graph revision management are
deferred. They may later change the shared reconfigurable meta-graph under host authority, but do
not change the recipe contract or make individual materialization calls select a compiler.

## Amendment (2026-07-30): recipes may select contract-compatible Cell programs

Tiers and recipes are static authored materialization data. A recipe may use immutable external
context to select the implementation program by which a Cell fulfills its semantic responsibility.
This includes selecting among source modes, service or provider bindings, computations, and other
inner program variants declared by the recipe vocabulary.

This selection does not replace the Cell or change its semantic contract. Across tiers, the Cell
retains its identity, input and output ports, token contracts, and role in the data-flow graph. Each
selectable inner program must satisfy those same contracts. For example, a market-price Cell may
select a live service binding or a mock service binding while accepting the same holdings input and
emitting the same quote output.

The selected program is fixed in the emitted terminal Blueprint. Changing the relevant external
context requires a new materialization; it is not a runtime state transition or an adaptive change.
This amendment distinguishes a Cell's stable semantic behavior from the contract-compatible inner
program selected to perform it.

## Amendment (2026-08-14): recipe interpretation executes inside compiler Cells

The fixed package-owned meta-graph is now the production execution path used by
`materializeBlueprint`. The authored Blueprint and immutable external context enter a separate
compiler Kernel through `lowering:source`; the compiler Cells resolve the ordered chain, apply the
registered vocabulary or representation operation, and validate and emit `compiled:artifact`.

Registered TypeScript implementations remain valid implementations of compiler-Cell vocabulary
operations. They do not schedule recipes or form a second graph engine: Cell ordering, readiness,
token propagation, budgets, and quiescence remain owned by the Kernel's one
`ContinuousGraphRuntime` traversal. A terminal Blueprint is accepted only from the
`emit-blueprint` Cell's declared output token.

## Amendment (2026-08-14): representation recipes may generate presentation decorations

A representation may declare ordered decorators whose `select` expression is evaluated during
lowering against the current Blueprint artifact, its payload, its authored Cell array, and immutable
external context. The expression returns one Cell id or an array of Cell ids. This gives recipes a
declarative map/filter facility over authored structure without introducing application-specific
compiler code.

Each decorator may contribute one `before` and/or `after` Cell-view decoration. Lowering stores the
expanded decorations on matched terminal Cell views; executable preparation composes them with the
original Cell into a presentation fragment with stable generated node ids. The original Cell keeps
its id, children, bindings, events, and semantic contract. Decoration bindings and visibility remain
runtime JSONata scoped to that matched Cell, so a recipe can select Cells having `sources` at compile
time and show `fluent:spinner` while each Cell's `numSourcesRunning` is nonzero at runtime.

Decorators are presentation facets and are invalid for headless representations. Selection must
resolve only known presented Cells, nested decorations are rejected, and all selection, binding,
and visibility expressions are validated before execution.

## Amendment (2026-08-15): evaluator-owned system inputs for runtime presentation state

Cell authors may declare named evaluator-owned values through `systemInputs`, for example
`systemInputs: ["numSourcesRunning"]`, and reference them as
`systemInputs.numSourcesRunning`. A declaration grants access to a known token; it does not add a
persisted Cell input or expose the underlying runtime state. The evaluator owns each token's schema,
pure resolver, and lowering-time runtime expression.

`numSourcesRunning` is projected from the Cell's raw source request/completion tokens in
`blueprintRunState`. Neither this count nor another derived system input is persisted. Cell
evaluation remains pure: Blueprint supplies raw run state as internal evaluator context, the
evaluator resolves only the Cell's declared tokens, and lowering replaces declared system-input
references in presentation expressions with evaluator-owned Kernel expressions.

Cell-authored compute, source-guard, and output expressions use explicit `inputs`, `sources`,
`systemInputs`, and `computed` namespaces. Outputs from the current evaluation cycle are published
from `computed.<assign-path>`; bare assignment paths are not an alternate namespace. The internal
`blueprintRunState` and `cellRunState` namespaces are unavailable to Cell expressions. This keeps
spinner decoration declarative without making runtime storage layout part of the Cell-authoring
contract.
