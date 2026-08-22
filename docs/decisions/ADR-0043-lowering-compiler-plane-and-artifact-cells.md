# ADR-0043: Lowering compiler plane and artifact Cells

**Status:** Accepted — 2026-07-24

## Context

ADR-0016 and ADR-0038 established layered, declarative lowering, but described the terminal artifact
primarily as a projected UI document. The Kernel now accepts projected and headless executable
programs and owns a continuous graph suitable for user interfaces, services, workflows,
automations, and agent systems. Blueprint tiers and recipes therefore cannot remain frontend-only.

Lowering also needs an extension model. A fixed recipe catalog cannot anticipate every domain, and
an AI agent may need to select, compose, or propose a strategy when existing recipes are
insufficient. Letting transient model reasoning directly mutate an executing Kernel would erase the
boundary between compilation and authoritative execution.

## Decision

### Lowering is a compile phase, not a deployment phase

Lowering transforms higher-level artifacts into one canonical executable Blueprint before the
Kernel grants that artifact execution authority. It may run during a developer build, in CI, in an
authoring workbench, at publication time, or on demand immediately before execution. "Compile
time" means before authoritative execution, not necessarily before deployment.

The terminal artifact may be:

- a projected executable program for an interactive frontend;
- a headless service or automation program;
- a workflow or agent program whose behavior is represented by the canonical graph; or
- a Blueprint containing both headless behavior and an optional projection.

No backend Blueprint must fabricate a presentation tier, projection root, or renderer capability.
All terminal programs cross the same Kernel validation boundary.

### Strategy and compilation are separate planes

The strategy plane may be asynchronous and nondeterministic. An agent or host may select existing
recipes, compose a compatible chain, parameterize a strategy, synthesize candidate declarative
recipes, compare candidates, or suspend for human approval.

The compilation plane is policy-controlled and evidence-producing. A registered executor consumes
a validated recipe and input artifact, emits the next artifact, and preserves provenance. Terminal
emission must pass structural and semantic validation before the resulting Blueprint can execute.
Agent reasoning may author compiler inputs; it is not itself executable authority.

### Lowering uses an artifact Cell meta-graph

A Lowering Cell is one independently addressable artifact-processing participant above Kernel
execution. Its minimal contract declares:

- an ID and kind;
- optional source and target layer kinds;
- typed artifact input and output ports;
- an optional versioned strategy and executor reference; and
- policy for determinism, validation, and approval.

The initial kinds are `transform`, `select-strategy`, `synthesize-strategy`, `validate`, `approve`,
and `emit-blueprint`. This contract supports deterministic stages and agent- or human-mediated
strategy work without defining an execution engine yet.

A Lowering Cell is not an application `CellDefinition`. Two graphs remain distinct:

```text
compiler meta-graph --produces--> validated executable Blueprint
                                         |
                                         v
                              Kernel continuous runtime graph
```

The compiler may use the same explicit-port and causal principles as the runtime, but compiler
state, candidate artifacts, approvals, and provenance do not become application runtime state
unless the produced Blueprint explicitly models them.

### One backend-neutral terminal lowering API

`ProgramLowering<In, Out>` may terminate in any `ExecutableProgramDefinition`.
`lowerToProgram` preserves whether the result is projected or headless and validates it before
returning a wire message. `lowerToProjectedProgram` remains a narrower convenience for callers that
require a projection.

## Consequences

- Blueprint tiers and recipes are backend-neutral artifact-compilation concepts.
- UI-oriented layer kinds such as interaction and presentation remain valid profile choices, not
  mandatory universal tiers.
- Service-oriented profiles may define domain-specific tiers and lower directly to a headless
  executable program.
- An agent can redefine strategy by producing or selecting validated strategy artifacts, subject to
  executor registration and policy.
- Reproducibility requires strategy identity, version, inputs, outputs, and evidence to be retained
  by future compiler orchestration.
- Physical package extraction of authoring and lowering remains deferred until these contracts
  stabilize; capability boundaries are documented before package boundaries are changed.
- This ADR refines ADR-0016's UI-only terminal description without reversing its one-kernel,
  optional-layer, composable-stage, or validate-before-execute decisions.

## Not decided here

- The persistent wire schema for a complete lowering meta-graph.
- Which agent provider or protocol performs strategy synthesis.
- Candidate scoring, caching, incremental recompilation, retry, or provenance storage formats.
- Whether compiler orchestration eventually reuses `ContinuousGraphRuntime` internally.
- Physical package names or release boundaries for authoring and compiler APIs.

## Amendment (2026-07-29): deterministic inputs to the compiler plane

ADR-0046 requires materialization to be deterministic for authored Blueprint plus immutable
external context. Any agent synthesis, strategy selection, validation outcome, or approval that
would otherwise be nondeterministic must be pinned into authored data or external context before
the trusted materialization is reused. Compiler provenance remains derived evidence and does not
grant the terminal artifact independent authored authority.

## Amendment (2026-07-29): fixed common meta-graph for runtime lowering

The compiler plane has one package-owned meta-graph Blueprint, expressed as Cells and prepared by
the same Blueprint/Kernel machinery as application graphs. It is not a catalog of pair-specific
compilers. Tier definitions provide representation contracts, recipes provide vocabulary-driven
transformation data, and the common meta-graph interprets every ordered stage.

`materializeBlueprint` always considers this common meta-graph internally; callers do not supply a
compiler or meta-graph per call. For the first implementation its structure is fixed and its
deterministic lowering path is synchronous. Agent calls, human approval, strategy synthesis, and
host-authorized reconfiguration remain compiler-plane capabilities for a later phase and cannot
block the runtime materialization path.

## Amendment (2026-08-14): fixed compiler Cells are the production materialization path

The fixed common meta-graph is compiled to one Kernel Program and executed on a separate Kernel
instance during `materializeBlueprint`. Its three production Cells are `resolve-stage`,
`apply-vocabulary-patch`, and `emit-blueprint`; their tokens carry the source, resolved chain,
intermediate artifact, and validated terminal artifact. The application Kernel is still created
only after this compiler Kernel emits the terminal Blueprint, preserving compiler/application plane
separation.

The deterministic path uses the Kernel's synchronous publication mode. That mode is intentionally
restricted to a synchronous expression provider and output-only graphs: asynchronous node outcomes,
state operations, effects, events, and program mutations are rejected. Rich agent, service, or
approval compiler pipelines continue to use the asynchronous compiler-host path and are not part of
portable synchronous materialization.

## Amendment (2026-08-22): remove VocabularyLoweringRecipeDefinition as a lowering recipe kind

`VocabularyLoweringRecipeDefinition` (a recipe carrying a raw `BlueprintPatch` — `addCell`/
`replaceCell`/`removeCell`/`setPresentation`) applied that patch directly via `applyBlueprintPatch`
from `applyLoweringRecipe`, entirely bypassing `admitBlueprintPatch`'s `structureMode` gate. This
contradicted the Cell-identity invariant this same ADR and the authoring guidance already state:
`addCell`/`replaceCell`/`removeCell` is a governance-gated edit to the *authored* Blueprint, admitted
only under `reconfigurable`/`adaptive` structure mode via `admitBlueprintPatch` — never a lowering-time
tool, and a recipe must never add, remove, or restructure which Cells exist. The recipe kind had zero
real product consumers (only a quarantined `samples/blueprints/half-baked/` sample and one test
fixture, both excluded from the build/test paths already).

Removed `VocabularyLoweringRecipeDefinition` and its handling entirely; `RepresentationLoweringRecipeDefinition`
is now the sole lowering recipe kind (`blueprint/src/types.ts`, `lowering-recipe.schema.json`,
`applyLoweringRecipe` in `fixed-lowering-meta-graph.ts`). This does not affect the separate runtime
patch path — `admitBlueprintPatch`/`admitAdaptiveProgramPatch`/`applyBlueprintPatch` in
`structure-patch.ts`, and `applyBlueprintPatches` in `run-transition.ts` — which remains the only way a
`reconfigurable`/`adaptive` Blueprint's Cell effects/behavior may propose `addCell`/`replaceCell`/
`removeCell`, still fully gated by `structureMode` and origin authorization exactly as before. The three
fixed-lowering meta-graph compiler Cell ids (`resolve-stage`, `apply-vocabulary-patch`, `emit-blueprint`)
are unchanged — `apply-vocabulary-patch` is an internal compiler-plane Cell id, not a recipe-authoring
surface, and its operation (`apply-lowering-chain`) already applied whichever recipe kind a stage
carried; it now only ever receives representation recipes.

## Amendment (2026-08-23): re-check hosted-child inputs against the terminal, not the pre-lowering, Cell shape

Hosted-child required-input satisfaction (a hosting Cell's attached views must supply every entry a
hosted child's own `interface.inputs` marks `required`) was checked exactly once, by a private
`validateChildInputs` helper called only from `assembleBlueprint`, against the Cell's *authored*
`potentialViews` — strictly before any representation lowering ever ran. Since a representation may
introduce a hosting Cell's very first named view, add one alongside an existing view, or replace one
already there, this ordering meant the check could be wrong in either direction: rejecting a Blueprint
whose only supplying view a representation was about to add, or accepting one whose supplying view a
representation was about to replace with one that no longer supplies it. It also meant
`validateBlueprintForAuthoring` — the agent-facing "validate this Blueprint" surface, which never calls
`assembleBlueprint` — never performed this check at all for a directly inlined hosted child, in
contradiction of the standing invariant that hosted-child inputs, like the terminal Kernel program
itself, must be validated before the artifact receives execution authority.

Folded the check into `validateBlueprintArtifact` itself, gated on `blueprint.recipes.length === 0` —
i.e. it only ever runs once this Blueprint has no more lowering ahead of it. This resolves to exactly
one evaluation against the actually-final Cell shape: immediately, for an already-terminal Blueprint
(authored with no recipes, or a nested hosted child not yet reached its own separate lowering pass);
or via the terminal re-validation `emit-blueprint` already performs on the lowered artifact (whose
`recipes` it forces to `[]` before validating). `assembleBlueprint`'s own explicit calls to the old
helper were removed — its existing `validateBlueprintArtifact(assembled)` call, run immediately after
every child is embedded inline, now performs the same check for free. Verified both failure directions
with dedicated regression tests: a representation stripping a previously-satisfying binding is now
rejected at the terminal stage; a representation supplying a hosting Cell's only view is no longer
falsely rejected pre-lowering.

Separately confirmed (not itself a change): a nested hosted child's own tiers/recipes are never lowered
by the outer `lowerWithFixedMetaGraph` call — `assembleBlueprint` only resolves references and embeds
each child inline, unlowered. A hosted child is compiled as an opaque graph leaf whose rendered view
carries the unlowered child artifact as a prop; a host-driven `HostedBlueprintReconciler` later mounts
it by running it through its own fully independent `materializeBlueprint` call (its own assemble, its
own lowering, its own Kernel instance), bridging outputs back to the parent via a synthetic event. This
is deliberate — the same compiler-Kernel/application-Kernel separation this ADR already establishes,
applied again at the parent/child Blueprint boundary — not a gap.

## Amendment (2026-08-23): hosting is a data-flow property, never dependent on presentation — supersedes the prior amendment's mechanism

The prior amendment (immediately above) checked hosted-child required inputs against a hosting Cell's
*view* (`potentialViews` props/bindings), gated on that view's `region` resolving through the active
`presentation`. That mechanism, and the pre-existing `composeCellProgram` throw it lived alongside
(`'Blueprint '${id}' without a presentation cannot host child Blueprint Cell ...'`), both made the same
category error the authoring guidance already warns against for `sources`/`compute`: they let a
presentation-only concept (a view, its region, whether that region is reachable) gate whether a Cell's
own data flow — hosting, explicitly one of a Cell's ordinary data-flow-owning properties alongside
ports/sources/compute/behavior, described as working "exactly like any other Cell" — actually
functions. `presentation` is, and was always documented as, entirely optional at the whole-Blueprint
level; nothing about hosting a child Blueprint may ever require it.

Corrected the mechanism, replacing the prior amendment's view-based one entirely:

- `validateBlueprintArtifact` now checks a hosted child's required `interface.inputs` against the
  hosting Cell's own declared `inputs` ports (`input.as ?? input.token`) — never `potentialViews`,
  never `region`, never presentation reachability. Since a Cell's ports never change across lowering
  (the one invariant every tier shares), this check needs no "wait until terminal"/`recipes.length`
  gating at all: it is accurate at every validation call, unconditionally.
- `composeCellProgram` no longer rejects a presentation-less Blueprint that hosts a child. Every Cell
  with `blueprint` set now always gets a discoverable node — built from that Cell's own `inputs` ports,
  reusing the same `edges.read` mechanism as any other bound prop — regardless of whether this
  Blueprint has a `presentation` at all, or whether that one Cell has a reachable view of its own. This
  reuses the existing `HostedBlueprintReconciler`/`HOSTED_BLUEPRINT_OUTPUT_EVENT` discovery and
  output-bridging mechanism unchanged (both already keyed on the bare Cell id), so a host's existing
  `program.root !== undefined` gate for subscribing to the tree now naturally also covers headless
  hosting with zero host-side changes needed.
- A *presented* hosting Cell's view may still carry visibility, decorations, and its own unrelated
  props — but the hosted child's own inputs are now sourced solely from `cell.inputs`, for both
  presented and headless hosting alike, so validation and runtime behavior can never diverge by
  presentation state.

Confirmed via exhaustive repository search that no real product sample authors a Cell's own `blueprint`
field directly (mechanism A) at all — every real sample dynamically binds a `gik:blueprint`-capability
*view* prop to a Blueprint-shaped value computed as data (mechanism B, e.g.
`samples/blueprints/incident-analysis-new-shell`'s `report-resolution` Cell). Mechanism B is
inherently presentation-native (it is a rendering-time selection of what a view currently renders) and
is unaffected by this amendment; only mechanism A (`CellDefinition.blueprint`, the ordinary
data-flow-owning hosting property this ADR and the authoring guidance describe) was ever wrongly
coupled to presentation, and is what this amendment corrects.
