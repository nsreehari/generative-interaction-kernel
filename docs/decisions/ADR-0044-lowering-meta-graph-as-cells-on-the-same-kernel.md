# ADR-0044 — The lowering meta-graph runs as Cells on the same Kernel

**Status:** Accepted — 2026-07-28

## Context

ADR-0043 gave the compiler plane a contract — a Lowering Cell meta-graph with kinds `transform`,
`select-strategy`, `synthesize-strategy`, `validate`, `approve`, and `emit-blueprint` — but left the
executor undecided: "Whether compiler orchestration eventually reuses `ContinuousGraphRuntime`
internally" was explicitly out of scope.

That gap is no longer theoretical. `docs/sot/gik-public/blueprint.yaml` documents the boundary
directly: `@gik/blueprint` "declares Lowering Cells but does not schedule a compiler meta-graph,"
and a `BlueprintArtifact` "is not an `ExecutableProgramDefinition`" — there is no executor anywhere
in the codebase that actually walks a tier chain and produces a terminal program. Any Blueprint
with more than one tier (the two-tier "agent-sourced data → presentation" shape needed for the
Public-Source Due Diligence sample, and any `reconfigurable`/`adaptive` Blueprint with real
recipes) is unimplementable until this executor exists.

## Decision

**A Lowering Cell meta-graph is authored and executed as an ordinary Blueprint, running on its own
instance of the same Kernel and Face machinery application Blueprints already use.** No new
execution engine is built for the compiler plane.

Each Lowering Cell kind maps onto an existing, already-shipped primitive — no new Kernel node
operation kind and no new action verb is introduced:

| Lowering Cell kind    | Existing primitive it becomes                                          |
| ---------------------- | ------------------------------------------------------------------------ |
| `transform`            | A JSONata `compute` Cell (same shape as `positions`/`summary` in `portfolio-tracker`). |
| `select-strategy`      | A `compute` Cell for deterministic rules, or a service-backed Cell for judgment calls. |
| `synthesize-strategy`  | A service-backed Cell (the Foundry-agent pattern) with AJV response validators. |
| `validate`             | Declarative guardrails — the same validator engine service responses already use. |
| `approve`              | The Kernel's existing `confirm` action verb (human-in-the-loop gate). |
| `emit-blueprint`       | An `effect_handlers` leaf that hands off the finished artifact.       |

A **compiler Blueprint** is hand-authored directly as Cells at the terminal tier — zero recipes,
exactly like `portfolio-tracker` and `foundry-agent` are today. This avoids infinite regress: the
compiler does not itself need compiling.

**Compiling and running stay two distinct Kernel instances.** The compiler Blueprint opens as its
own Kernel/ControlFace runtime, seeded with the source artifact as initial state. It runs to
quiescence (or pauses at a `confirm` gate), and its `emit-blueprint` Cell's output token is the
materialized artifact. That artifact is then handed to the existing, unchanged `openBlueprint` /
`reconfigureBlueprint` path — it never gains direct execution authority over the target
application's live Kernel. This preserves ADR-0043's plane separation: compiler state, candidate
artifacts, and approvals stay inside the compiler's own runtime unless the produced Blueprint
explicitly models them.

A thin host-side driver is the only genuinely new code: open the compiler Blueprint, seed it, run
it to completion (resolving `confirm` gates via a caller-supplied approval path), read the
`emit-blueprint` output, validate it as a `BlueprintArtifact`, and pass it into the existing open
path.

## Alternatives considered

### A. A bespoke `materializeProgram` function
**Rejected because:** a plain deterministic function handles pure-transform recipes fine but would
have to hand-roll its own async/agent-call/approval handling for `select-strategy`,
`synthesize-strategy`, and `approve` — duplicating what `invoke`, service guardrails, and `confirm`
already do inside the Kernel. The Cell-based design subsumes this case: a compiler Blueprint with
only chained `transform` Cells *is* the plain-function case, expressed in the same vocabulary as
the richer one.

### B. A standalone, purpose-built meta-graph engine
**Rejected because:** it would duplicate `ContinuousGraphRuntime`, the reducer, JSONata evaluation,
the service host, and the guardrail validators — machinery that already exists, is tested, and is
domain-agnostic by design (ADR-0001, ADR-0016). Building a second engine contradicts the one-kernel
principle those ADRs establish.

### C. Embed Lowering Cells directly inside the target application Blueprint
**Rejected because:** it collapses ADR-0043's plane separation. Compiler state, candidate
artifacts, and approvals would become application runtime state by default, and a
`synthesize-strategy` Cell's agent output would gain execution authority before passing through the
existing validated open/reconfigure path — exactly the risk ADR-0043 was written to prevent.

## Consequences

- No new Kernel node operation kind, no new action verb. `approve` reuses `confirm` (ADR-0019)
  directly.
- The only new surface is a thin host-side driver (open → seed → run-to-completion/gate → extract →
  validate → hand to the existing open path), not a new runtime.
- Provenance (strategy identity, inputs, outputs, evidence — flagged as unresolved in ADR-0043)
  falls out of the Kernel's existing revision history and checkpoint/patch log for free.
- Compiling becomes potentially asynchronous and human-gated once `select-strategy`,
  `synthesize-strategy`, or `approve` Cells are used. "Materialize" and "open" remain two distinct
  phases even though both now run on the same Kernel — `openBlueprint` itself stays synchronous and
  unchanged.
- Whether `LoweringRecipeDefinition` stays a flat `{id, from, to, expr}` for pure-transform cases,
  or gains an optional reference to a compiler-Cell-subgraph for richer cases, is an authoring-surface
  decision deferred to implementation (see Not decided here).

## Not decided here

- Whether `LoweringRecipeDefinition` gains a `compilerBlueprintRef`-style field, and its exact shape.
- The persistent wire schema and storage format for compiler-run provenance (still deferred from
  ADR-0043).
- Whether `emit-blueprint` output that itself contains child-Blueprint references interacts with the
  existing "no nested child-Blueprint mutation" boundary in `applyBlueprintPatch` — to be confirmed
  during the first real spike.
- Whether a shared, reusable "compiler bundle" (floor-style generic `transform`/`validate`/`approve`
  Cells) ships under `samples/bundles/`, or each domain hand-authors its own compiler Blueprint.
- Physical package placement of the host-side driver (`@gik/blueprint` vs. a new package) — deferred
  until the driver exists and its dependency shape is known.
