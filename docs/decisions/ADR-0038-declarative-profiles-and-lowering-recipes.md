# ADR-0038 — Declarative profiles: layers + data-driven lowering recipes

**Status:** Accepted — amended 2026-08-24

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

Decorators are presentation facets on representation recipes. Selection must resolve only known
presented Cells, nested decorations are rejected, and all selection, binding, and visibility
expressions are validated before execution.

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

## Amendment (2026-08-19): presentation composition owns semantic slots

Presentation placement is Blueprint projection data, not Cell or component metadata. The flat
`placements` list is replaced by a parent-keyed `composition` map. Each parent contains a `slots` map
whose values are ordered Cell-id arrays. The map gives an authoring agent stable semantic regions such
as `navigation`, `actions`, and `content` without coupling those names to a component implementation.

Representation recipes may replace the complete presentation or append sparse composition. Append
merges by parent and slot and concatenates child arrays; array order is authoritative. Materialization
then projects the selected composition as ordinary ordered children. Component variants and
representation lowering remain responsible for physical presentation, including context-dependent
reordering or deliberate omission.

## Amendment (2026-08-21): presentation slots are Cell-agnostic; attachment is self-declared

The 2026-08-19 amendment's parent-keyed `composition` map is superseded. `presentation` is `{ slots,
root }` — a closed, flat set of named slots plus a root — and it carries no knowledge of Cells at all.
A slot self-declares its own parent slot via `region`; a Cell attaches to one or more slots the
identical way, by declaring `region` on its own view. There is no third structure recording who
contains whom, so deleting a Cell or a slot removes its own attachment fact with it.

A Cell's `region` may name more than one slot, rendering one independent instance per attachment while
every instance still reads and writes through that one Cell — the prior "a Cell may appear at most
once" rule is gone. Representation recipes still replace the whole presentation or append additional
slot entries, but append is now a plain array concatenation rather than a parent/slot merge, since
slots are a flat list rather than a nested tree.

## Amendment (2026-08-23): a view's primary capability may be nested inside `wrap` layers, not only flanked by `before`/`after`

**Presentation slot nesting only ever nests inert fragment wrapper nodes, never a specific capability's
own rendered children.** Confirmed by tracing the full pipeline: a nested slot's compiled fragment is a
sibling of whatever else attaches to the same parent slot (`compileSlot` in `cell-projection.ts`), and
`adapters/react`'s slot fragment renders as a bare `React.Fragment` pass-through with no relationship to
any other node's own component. Meanwhile a capability component like `FluentDialog` only ever receives
`children` from its *own* node's `edges.children`, which `toProgramNode` previously populated only from
that same view's `before`/`after` decorations. So a dialog-hosts-a-form composition, where the form
needs its own event, had no expressible answer: `before`/`after` are correctly inert (no event), and the
"own-Cell" rule for anything needing an event produced two independent Cells with no way to make one's
rendered view a structural child of the other's — exactly the anti-pattern
`.github/agents/gik-purpose-reviewer.agent.md`'s own invariant warns against ("presentation must not
manufacture Cells merely to express wrappers, dialogs, forms, tabs, panels... must still be expressive
enough for complete product experiences").

**The actual gap was narrower than it first appeared.** It was never about crossing Cell boundaries: a
form Cell whose `primary` view *is* `primitive:form` already routes its own `save`/`submit` event
through that same Cell's `behavior.on` today (e.g. `blueprint-studio`'s create-Blueprint Cell). The only
missing piece was letting that same view's primary capability nest inside another capability's own
rendered boundary — a purely presentational relationship, entirely within one Cell's one named view.

**`CellPotentialView` gains an optional `wrap?: readonly CellViewDecoration[]`,** the identical shape
`before`/`after` already use, ordered outermost-first. `toProgramNode` folds it around the primary
node right-to-left, each layer's `edges.children` holding the next one in — the primary is always
innermost, unchanged (same `edges.on = cellEvents(cell)` as always, since nothing about its own node
changes). `before`/`after` then flank the fully wrapped result exactly as they would the bare primary,
so all three compose freely. `presentation.allowedCapabilities` enforcement in
`validateBlueprintArtifact` was extended to scan `wrap` capabilities alongside the primary and
`before`/`after`, closing what would otherwise have been a silent bypass of that closed vocabulary.

One real, deliberate behavior difference from `before`/`after`: a wrap layer's own `visibility` gates
its whole subtree (the Kernel's `resolveNode`/the renderer's `renderNode` both return before recursing
into an invisible node's children), so hiding a wrap layer hides the wrapped primary too. This is the
common intended case (the primary only exists to be that layer's content) but is worth stating
explicitly since `before`/`after` visibility is independent and sibling-scoped by contrast.

**No change was needed anywhere in `kernel/src/interpret.ts`, `adapters/react/src/render.tsx`, or the
component implementation** - the mechanism produces an ordinary nested `DocNode`, and both the
Kernel's already-generic child-walking and the wrapper component's existing `{children}` consumption
already handle it. That is the entire reason this stayed a small,
`@gik/blueprint`-internal compiler/schema/type change.

## Amendment (2026-08-24): one recipe vocabulary becomes two axis-specific dialects

The `representationRecipe` dialect defined here — one recipe carrying `representations` + `fallback`
*and* optional `implementationPrograms` + `fallback` — is superseded and removed. See
ADR-0046's 2026-08-24 amendment for the full decision; this amendment records only the consequences
for the recipe vocabulary and its schema.

`lowering-recipe.schema.json` no longer publishes a `loweringRecipe`/`representationRecipe` definition.
It publishes exactly two dialects:

- `projectionRecipe` — `{ id, from, to, representations, fallback, metadata? }`;
- `serviceRecipe` — `{ id, from, to, implementationPrograms, fallback, metadata? }`.

Both keep `additionalProperties: false`, so a projection recipe declaring `implementationPrograms`, or
a service recipe declaring `representations`, is a schema error rather than a silently ignored field.
`fallback` is now **required** on a service recipe, mirroring the projection axis'
already-required `fallback`: a recipe whose predicates all miss must still resolve deterministically,
and requiring the fallback makes that an authoring-time error instead of a materialization-time one.

The evaluator's validator surface follows the same split. The `blueprint-lowering-recipe` validator
kind and the `validateLoweringRecipe`/`validateRecipe` functions are removed, replaced by
`blueprint-service-recipe`/`validateServiceRecipe` and
`blueprint-projection-recipe`/`validateProjectionRecipe`. The `blueprint` validator runs the
corresponding semantic checks over `payload.serviceRecipes` and `payload.projectionRecipes`
separately, and reports which axis a diagnostic came from. Capability collection for
`blueprint-capability-acceptance` reads un-lowered representations from
`payload.projectionRecipes[*].representations[*]`, since that is the only axis that can carry a view.

Historical decisions above are not rewritten: the "recipes select, never restructure" invariant, the
representation `extends`/decorator semantics, and the contract-stability rules for implementation
programs all survive the split unchanged — they simply now live on the axis that owns them.
