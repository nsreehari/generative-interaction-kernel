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
