# ADR-0046: Deterministic Blueprint materialization and portable execution values

**Status:** Accepted — 2026-07-29

## Context

`runTransition` previously prepared an assembled Blueprint, vocabulary, and program on every call.
That hid the authored-to-executable boundary, mixed initial-state seeding with ambient context, and
gave in-memory React hosts and stateless durable workers no common value to reuse. Tiers and recipes
also require an explicit invariant before their executor is connected: the same authored Blueprint
and immutable context must produce the same terminal Blueprint.

## Decision

Blueprint materialization is the deterministic pure function $M(A, C) = T$, where $A$ is the
authored Blueprint, $C$ is immutable external context, and $T$ is one portable
`MaterializedBlueprint`. The value contains the assembled terminal Blueprint, immutable context
snapshot, prepared vocabulary and program, and initial state. It is derived data, not a second
authored authority, but may be retained in memory or persisted opaquely for stateless execution.

`@gik/blueprint` exposes three execution paths:

- `materializeBlueprint({ blueprint, externalContext })` creates the portable value once;
- `runMaterializedTransition({ materializedBlueprint, state, events })` trusts that value and does
  no source hashing, assembly, or recompilation; and
- `runTransition({ blueprint, externalContext, state, events })` is the convenience path that
  materializes internally and delegates to the trusted path.

Runtime expressions read immutable context through `externalContext.*`. It is never merged into or
returned as mutable state, and writes targeting that namespace fail.

Semantic `BlueprintPatch` proposals always target the authored Blueprint. Applying an admitted
patch creates a new authored Blueprint and a new materialization in one pure operation. Fixed
Blueprints reject semantic patches; reconfigurable Blueprints rematerialize only after an
authorized patch; adaptive Blueprints may propose policy-admitted authored patches. Executable
`ProgramPatch` remains revision-local and distinct.

`@gik/react` materializes once per controller and reuses the trusted path. `@gik/durable-runtime`
remains generic: a Blueprint host stores authored Blueprint, external context, and portable
materialization inside its opaque spec and commits spec updates atomically with state, cursor, and
effects. A cold Azure Function can therefore read the value and execute without process memory.

The first implementation packages the existing recipe-free terminal preparation. Connecting a
non-empty recipe chain to Lowering Cell compiler Blueprints is a subsequent implementation phase;
until then the existing “must be lowered before its program can run” rejection remains.

## Amendment (2026-07-29): synchronous fixed-meta-graph lowering

`materializeBlueprint` is always synchronous. It lowers recipe-bearing authored Blueprints through
one fixed, package-owned compiler meta-graph Blueprint before preparing the terminal vocabulary and
program. Individual calls provide only the authored Blueprint and immutable external context; they
do not select or supply a compiler meta-graph.

The fixed meta-graph interprets vocabulary-driven recipes across an arbitrary ordered tier chain.
It performs no service invocation, agent synthesis, human approval, or self-modification during
materialization. Reconfigurable meta-graph ownership, deterministic fallbacks, and suggested
meta-graph patches are subsequent work. This amendment supersedes the temporary recipe rejection
above and the assumption that recipe executors are selected independently per stage.

## Alternatives considered

### A. Hash authored Blueprint and context on every transition

Rejected because fixed and unchanged reconfigurable runtimes already possess a trusted portable
materialization. Rechecking source identity on every event adds cost without strengthening a
provider transaction that stores the coherent spec revision.

### B. Keep materialization process-local

Rejected because stateless workers have no warm-memory guarantee and would recompile on every
invocation. The value must survive JSON persistence and transport.

### C. Persist only the terminal Blueprint as authority

Rejected because semantic adaptation would lose its authored target. The terminal Blueprint is
derived execution data; the authored Blueprint remains the patchable authority.

## Consequences

- Deleting a cached materialization changes performance, not the deterministic result.
- Durable providers remain unaware of Blueprint semantics.
- External context changes require a new materialization; they are not runtime state writes.
- Fixed and reconfigurable runtimes avoid repeated preparation between structure revisions.
- The package-owned lowering meta-graph and recipe vocabulary implementation are versioned,
  deterministic parts of materialization.

## Amendment (2026-07-30): context-selected Cell implementation programs

The deterministic function $M(A, C) = T$ may specialize the inner program of a Cell from immutable
external context. Authored tiers and recipes define the finite selection rules and
contract-compatible candidates; context supplies the materialization-time facts used by those
rules. The terminal Blueprint contains the selected source mode, service or provider binding,
computation, or other internal program details.

Such specialization preserves the Cell's identity, semantic responsibility, input and output
contracts, and logical data-flow role. It is an authored lowering transformation that preserves the
stable-Cell invariant, not a runtime reconfiguration. A different context value produces a new
terminal Blueprint through a new materialization; the selected program does not switch in response
to mutable runtime state.

Whether authorization, readiness, busy, dead, or wiped Cell conditions are represented as external
control context, declarative gates, or another control-plane vocabulary is not decided here. In
particular, this amendment does not settle the `http-proxy-access-gate` model or authorize control
values to be carried through application data-flow state.

## Amendment (2026-08-14): synchronous materialization uses compiler Kernel execution

The synchronous invariant is implemented without a side interpreter. For a recipe-bearing authored
Blueprint, `materializeBlueprint` runs the fixed compiler Blueprint on its own Kernel instance. The
compiler receives only the authored artifact and immutable external context, executes the resolved
recipe chain through compiler Cells, and emits the terminal Blueprint on a declared graph output.
Executable vocabulary, program, and initial state are prepared only from that validated emission.

The Kernel's asynchronous and synchronous graph APIs share one traversal. Synchronous publication
requires `SyncJsonataExpressionProvider` and rejects asynchronous outcomes or non-output
consequences. These restrictions preserve $M(A,C)=T$ and prevent synchronous materialization from
silently acquiring service, approval, event, state-mutation, or adaptive-program behavior.

## Amendment (2026-08-19): deterministic presentation composition

Presentation composition is part of the authored input to $M(A,C)$. A parent-keyed composition map
groups ordered child Cell ids under semantic slot names. Representation selection may replace that
map or append sparse parent/slot entries. The fixed lowering meta-graph merges append entries
deterministically and validates all referenced Cells before executable preparation.

The terminal program contains only the resulting ordered child tree. Blueprint slot names do not
become component props or renderer-specific insertion points, so equivalent hosts receive the same
materialized child order without needing component-specific slot behavior.

## Amendment (2026-08-21): presentation is a Cell-agnostic named-slot skeleton; attachment is self-declared

The 2026-08-19 amendment's parent-keyed composition map is superseded. `presentation` is part of the
authored input to $M(A,C)$, but it now carries no knowledge of Cells at all: `{ slots, root }`, where
each slot is a bare id or self-declares its own parent slot via `region`. A Cell attaches to one or
more slots by declaring `region` on its own view — never the reverse, and never through a third
composition structure. Deleting a Cell or a slot removes its own attachment declaration with it;
nothing external can be left dangling by an incomplete edit.

A Cell's `region` may name more than one slot. Each named attachment materializes its own independent
rendered instance of that Cell's projection, all reading and writing through the one same Cell — the
prior "a Cell may appear at most once" restriction no longer holds. The terminal program still
contains only the resulting ordered tree; slot names remain caller-authored placement intent, never a
component prop or renderer-specific insertion point.

## Amendment (2026-08-22): `runtime` sheds derivable/dead fields; `presentation.allowedCapabilities` replaces `runtime.capabilities`

`BlueprintRuntimeDefinition` no longer carries `version`, `expression`, `namespaces`, `contexts`,
`actions`, or `capabilities` as authored fields — only `externals` and `state` remain. Evidence for
each removal:

- `version`/`expression`/`contexts` had zero consumers anywhere, including `describeCatalog` (the one
  real agent-facing consumer of the materialized manifest). `expression` was always `"jsonata"` in
  every real sample and never branched on — the Kernel hardcodes `SyncJsonataExpressionProvider`
  regardless of its value.
- `namespaces` and `actions` are now derived by the host during materialization rather than
  hand-authored: `namespaces` = `Object.keys(runtime.state)` (verified to hold exactly, with zero
  exceptions, across every real sample and every `assign` target); `actions` = the distinct
  `behavior.on` `do` verbs actually used, scanned rather than maintained by hand. Nothing ever enforced
  an authored list against either, so authoring one was pure duplication with drift risk and no payoff.
- `capabilities` is replaced by `presentation.allowedCapabilities: string[]` (optional; absent means
  open, present makes it a real, validated closed set — the first place "declared once, Cells cannot
  exceed it" is actually enforced for capabilities). The removed field's `propsSchema`/`dataProp`/
  `emits`/`slots` were never consulted by the real renderer (`adapters/react`'s `render.tsx` resolves a
  capability through the platform's own component registry, never through the manifest) and were never
  checked against what a view actually used — the compiler even auto-registered an unknown decorator
  capability rather than rejecting it. `validateBlueprintArtifact` now enforces
  `allowedCapabilities` directly: every capability referenced by a Cell view or view decoration must
  appear in it, when it is declared.

`$M(A,C)$'s constructed vocabulary manifest is unaffected in shape — it still carries `namespaces`,
`actions`, and `capabilities` (`ProjectedVocabularyManifest` itself, a kernel-level wire type, is
untouched) — only their *source* changes, from Blueprint-authored data to host-derived data computed
during materialization.

## Amendment (2026-08-24): the one lowering chain splits into two independent axes

The single authored `tiers`/`recipes` pair is superseded and **removed**. A Blueprint payload now
declares four required arrays:

```text
serviceTiers      serviceRecipes
projectionTiers   projectionRecipes
```

This is a hard cut. `validateBlueprintArtifact` rejects a payload that declares either removed field,
and the Blueprint schema's `additionalProperties: false` rejects it structurally as well. There is no
compatibility normalization, no dual-read, and no deprecation window: a pre-split Blueprint fails
loudly rather than silently materializing only one axis.

**Why two axes rather than two lists inside one recipe.** ADR-0046 already held that projection and
implementation are independently selected. The pre-split shape expressed that as two optional lists on
one recipe, which forced the two seams to share a tier chain, share a stage count, and share one
recipe identity even when the product's real context dimensions had nothing in common. Splitting the
arrays makes the independence structural: each axis has its own tiers, its own recipes, its own
predicates, and its own fallback, and either axis may be a single terminal tier with an empty recipe
array while the other lowers through several stages.

**What the `service` axis actually selects.** The axis keeps the requested `service` terminology, but
its scope is deliberately broader than transport: a service recipe's `implementationPrograms` select
the whole contract-compatible **Cell implementation seam** — `sources`, `compute`, `behavior`, *and*
top-level `services` declarations. The name describes the *choice* ("which concrete backing service
implementation answers this Cell's already-authored contracts"), not a restriction to service
declarations alone. The contract-stability rules are unchanged: an override's source ids and their
*resolved* operation contracts, and a service override's `{operationId, contract}` pairs, must match
what was already authored.

**Split recipe contracts.** The combined recipe contract is removed.
`ProjectionLoweringRecipeDefinition` owns `representations` + `fallback`;
`ServiceLoweringRecipeDefinition` owns `implementationPrograms` + `implementationFallback`. Both
fields are required on their own dialect, and the schema rejects each dialect carrying the other's
fields, so a recipe can never quietly do both jobs.

**Independent resolution, identical invariants.** Both axes resolve through one shared
`resolveLoweringAxis` implementation, so `service` and `projection` are held to exactly the same chain
invariants — unique tier and recipe ids, known endpoints, no branching or merging, one source tier and
one terminal tier when recipes are present, and exactly one terminal tier when the axis is
recipe-free. Tier and recipe ids are per-axis namespaces; the two chains never have to be the same
length. Diagnostics name the failing axis.

**Deterministic application order.** $M(A,C)$ applies the **complete service chain first**, then the
**complete projection chain**. Two consequences are load-bearing and are now stated rather than
implied:

1. A representation observes the already-selected terminal implementation. A decorator `select`, for
   example, may legitimately match Cells whose lowered `sources` name a particular service.
2. Service selection can never observe projected presentation. If a service choice appears to need
   presentation input, that is a modelling error, not a missing capability.

Neither axis' *resolution* depends on the other; only this application order is shared, and it is
fixed, so $M(A,C)=T$ stays deterministic.

**Terminal emission.** The terminal Blueprint keeps exactly one terminal tier in each axis and clears
both recipe arrays, and — as before — must pass the same validation as a directly authored Blueprint.
