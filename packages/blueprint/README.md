# @gik-ai/blueprint

Canonical Blueprint artifacts, Cells, two independent lowering axes (`serviceTiers`/`serviceRecipes`
and `projectionTiers`/`projectionRecipes`), and validated lowering into
`@gik-ai/kernel` executable programs.

Every Blueprint declares all four arrays. A recipe-free axis contains exactly one terminal tier and
an empty recipe array. The removed `tiers` and `recipes` fields are not normalized or deprecated
aliases; they are rejected.

Each projection tier declares its Blueprint-local named `capabilities`. A presentation's mandatory
`allowedCapabilities` is the one closed authorization boundary: exact strings admit terminal host
capabilities, while `{ "tier": "<id>" }` admits that projection tier's complete vocabulary. Host
component namespaces are flat and terminal; projection recipes specialize selection, filtering,
layout, and composition rather than lowering semantic components into primitive or Fluent ones.
Each Blueprint-local capability name belongs to exactly one projection tier, so Cells and recipes use
plain, unqualified names without ambiguous tier ownership.

For a nonterminal projection chain, prefer source-tier names in authored Cell views and replace them
explicitly in the recipe that leaves that tier:

```json
{
  "projectionTiers": [
    { "id": "intent", "kind": "product-intent", "capabilities": ["portfolio:holdings"] },
    { "id": "runtime", "kind": "runtime-document", "capabilities": [] }
  ],
  "presentation": {
    "slots": ["holdings"],
    "root": "holdings",
    "allowedCapabilities": [{ "tier": "intent" }, "primitive:editable-table"]
  },
  "cells": {
    "holdings": {
      "id": "holdings",
      "potentialViews": {
        "primary": { "capability": "portfolio:holdings", "region": "holdings" }
      }
    }
  },
  "projectionRecipes": [{
    "id": "intent-to-runtime",
    "from": "intent",
    "to": "runtime",
    "representations": [{
      "id": "default",
      "views": {
        "holdings": {
          "primary": { "capability": "primitive:editable-table", "region": "holdings" }
        }
      }
    }],
    "fallback": "default"
  }]
}
```

```bash
npm install @gik-ai/blueprint @gik-ai/kernel @gik-ai/evaluators @gik-ai/durable-runtime
```

## External services

A Blueprint may declare concrete services in `payload.services`. The Blueprint owns each
service's kind, concrete non-secret configuration (including endpoints and opaque
`credentialRef` values), operation contract, request and response stages,
validation, violation behavior, settlement, and failure settlement. Cells may associate operations
through `sources`, and behavior invokes a declared operation through the existing `invoke` action.

The Blueprint does not execute services. An outer host admits trusted service-kind factories,
constructs `DefaultServiceHost`, authorizes declared endpoints, resolves referenced secrets, and
connects it through the runtime Orchestrator. Service kinds own their reusable `configSchema` and
adapter behavior; they do not own deployment-specific endpoints. Literal credentials must never
appear in Blueprint configuration or runtime state.

See the repository's
[external-services decision](https://github.com/nsreehari/generative-interaction-kernel/blob/master/docs/decisions/ADR-0040-external-services-and-queueface.md)
for the ownership model.

## Hosted Blueprint references

A Cell may mount another Blueprint through a canonical host resource URI:

```json
{
	"id": "analysis",
	"blueprint": { "$ref": "blueprint:incident-analysis@1.0.0" },
	"potentialViews": {
		"primary": {
			"capability": "host:hosted-blueprint",
			"bindings": { "content": { "from": "incident.content" } }
		}
	}
}
```

Child Blueprints declare their public `interface.inputs`, `interface.outputs`, and `interface.events`.
Assembly rejects a parent Cell that omits a required child input. Values cross the runtime boundary as
immutable external context; the child owns its state, services, lifecycle, settlement, and outputs.

`parseBlueprintReference()` and `formatBlueprintReference()` provide canonical `blueprint:` URI handling.

## Nested Blueprints

`gik:blueprint` is a system-provided structural capability for rendering a Blueprint inside another
Blueprint. Bind its `blueprint` prop to a complete inline `BlueprintArtifact`; all remaining props
become the child Blueprint's initial inputs. The host mounts the child with isolated runtime state
and the parent Cell's stable instance identity.

```json
{
	"id": "generated-report",
	"potentialViews": {
		"primary": {
			"capability": "gik:blueprint",
			"bindings": {
				"blueprint": { "from": "portfolio.reportBlueprint" }
			}
		}
	}
}
```

For registry-resolved children, use a Cell `blueprint` declaration with a canonical `$ref`. Both
forms use the same host-scoped nested Blueprint renderer; `gik:blueprint` is not a standalone
component-library projection.
Artifact assembly remains synchronous so cycle detection and interface admission complete before execution.

`gik:blueprint` and the compiler-generated `gik:presentation-fragment` are intrinsic system
capabilities. They remain available when a host supplies a closed terminal component catalog and do
not need entries in that catalog.

## Presentation slots

Blueprint presentation is authored independently from Cell definitions. It is a closed, flat set of
named `slots` plus a `root` — it carries no knowledge of Cells at all. A slot self-declares its own
parent slot via `region`; a Cell attaches to one or more slots the identical way, by declaring `region`
on one of its own `potentialViews`:

```json
{
  "presentation": {
    "slots": [
      "workspace",
      { "id": "navigation", "region": "workspace" },
      { "id": "content", "region": "workspace" }
    ],
    "root": "workspace",
    "allowedCapabilities": [
      { "tier": "product-intent" },
      "semantic:event-series",
      "fluent:button"
    ]
  },
  "cells": {
    "catalog": { "potentialViews": { "primary": { "capability": "...", "region": "navigation" } } },
    "detail": { "potentialViews": { "primary": { "capability": "...", "region": "content" } } }
  }
}
```

Slot names express caller-owned placement intent. They are available to projection tiers and
projection recipes, but are not component insertion points and carry no capability or props of their
own — visual styling for a region is always a rendering host/theme concern, never Blueprint-authored
data. Materialization flattens the resolved attachments deterministically into ordinary ordered
children, so Cells and component projections do not need to understand the slot names. Attachment is
always self-declared by the thing attaching (a slot's own `region`, or a named `potentialViews` entry's
own `region`),
never a third structure — deleting a Cell or a slot removes its own attachment fact with it. A Cell's
`region` may name more than one slot, rendering one independent instance per attachment while every
instance reads and writes through that one Cell. A representation may replace the complete
presentation layout or append additional slot entries (`presentationAppend`, a plain array
concatenation), but it cannot replace the Blueprint's authored `allowedCapabilities` authority.

## Exported presentation regions

A slot is internal, Blueprint-owned topology. An **exported region** is the explicit, named contract an
application host may address, so nothing is exposed implicitly: a host can only discover and mount what
`presentation.exportedRegions` declares.

```json
{
  "presentation": {
    "slots": [
      "workspace",
      { "id": "command-bar", "region": "workspace" },
      { "id": "navigation", "region": "workspace" },
      { "id": "content", "region": "workspace" }
    ],
    "root": "workspace",
    "allowedCapabilities": [],
    "exportedRegions": [
      { "name": "command-bar", "slot": "command-bar", "required": true },
      { "name": "sidebar", "slot": "navigation", "description": "Catalog browsing" },
      { "name": "primary", "slot": "content", "required": true }
    ]
  }
}
```

Ownership stays split. The Blueprint owns which regions exist, which Cell views attach to each one,
their semantics and ordering, and whether each is `required`. The host owns where each region appears in
its shell, the surrounding chrome, and whether it mounts an optional region at all.

Exporting never changes how the presentation compiles: an exported slot keeps its one place in the
Blueprint-owned tree and is never rendered twice merely because it is exported. Validation rejects
exports with an invalid or duplicated `name`, an unknown `slot`, a slot unreachable from `root`, or a
slot that overlaps another exported region's subtree. Because a representation may replace the whole
presentation, the exported set is a property of the terminal Blueprint a materialization selected for
the current external context — read it with `listExportedPresentationRegions(terminalBlueprint)`.

## Worker hosting

`@gik-ai/blueprint/worker` coordinates one journal/engine/effect cycle per wake. Connector-specific
factories are available from:

- `@gik-ai/blueprint/worker/in-memory`
- `@gik-ai/blueprint/worker/indexed-db`
- `@gik-ai/blueprint/worker/filesystem-mcp`
- `@gik-ai/blueprint/worker/azure`

Workers are asynchronous and placement-neutral. Wake notifications are hints, leases arbitrate
ownership, and effect outcomes return through the journal before changing Blueprint state.

## Exported API

### Artifact and validation

- `createBlueprint(definition)` clones a `BlueprintDefinition`, wraps it in the `BlueprintArtifact`
  envelope (`gik: "0.1"`, `type: "blueprint"`), validates it, and returns the validated artifact.
- `validateBlueprintArtifact(value)` asserts that a value is a `BlueprintArtifact`. Validation covers
  the envelope, Blueprint identity and runtime declaration, per-axis tier and recipe shape and chain
  invariants, rejection of the removed `tiers`/`recipes` fields, Cell key/id
  agreement, service-operation references, presentation slot references,
  `presentation.allowedCapabilities`, `presentation.exportedRegions` (legal unique names, known and
  root-reachable slots, no overlapping subtrees), and required `interface.inputs` for inline hosted
  child Blueprints.
- Native service `config` remains kind-specific in the Blueprint schema. The host's registered
  `ServiceKindRegistry` validates it against the service kind's `configSchema`, rejects literal
  credential fields, authorizes endpoints, and resolves opaque credential references.

### Materialization and transition

- `materializeBlueprint({ blueprint, externalContext?, resolveBlueprint?, capabilityCatalog? })`
  assembles child Blueprint references, validates external context, applies the complete authored
  service chain and then the complete authored projection chain when present, and returns a portable
  `MaterializedBlueprint`.
- `MaterializedBlueprint` carries the terminal `BlueprintArtifact`, cloned immutable
  `externalContext`, derived vocabulary, compiled program, initial state, and `eventNodeOwners`.
- `capabilityCatalog` is optional. It lets a host supply real `CapabilityDescriptor` entries keyed by
  capability name. When the option is omitted, or a referenced capability is missing from it,
  materialization falls back to a permissive descriptor with
  `propsSchema: { type: "object", additionalProperties: true }`.
- `runMaterializedTransition({ state, materializedBlueprint, events, syncExternal?, contexts?,
  createOrchestrator?, sourceSettlements?, requestSettlements?, serviceSettlements? })` runs a
  transition from the portable materialization without reassembling or recompiling the authored
  source. It makes `externalContext.*` readable through a reserved read-only namespace, applies
  settlements and ordered events, validates declared event payload schemas, and returns updated
  mutable local `state` plus any `effects`, `completedWithinRun`, and interface `outputs`.

### Program composition

- `composeCellProgram({ cells, presentation? }, topology)` is exported from the package entrypoint. It
  compiles a validated `ExecutableCellTopology` into an `@gik-ai/kernel`
  `ExecutableProgramDefinition`.
- With a `presentation`, it projects Cells into the declared slot graph. Without a `presentation`, it
  still emits handlers, computation/source graph nodes, and discoverable hosted-Blueprint nodes.
- A `CellPotentialView`'s `before` and `after` decorations render as sibling fragments around the
  primary node. `wrap` decorations nest the primary node inside successive decoration layers,
  outermost first.

### Core authored contracts

- `BlueprintArtifact` is the portable authored envelope. Its `payload` is a `BlueprintDefinition`.
- `ServiceLoweringRecipeDefinition` selects contract-compatible Cell implementations through
  `implementationPrograms` and a required `fallback`. Despite the axis name, this seam
  covers Cell sources, compute, behavior, and top-level service declarations.
- `ProjectionLoweringRecipeDefinition` selects named views and presentation through
  `representations` and a required `fallback`.
- Service and projection chains resolve independently. Materialization applies the complete service
  chain before the complete projection chain and emits one terminal tier plus an empty recipe array
  for each axis.
- `CellDefinition` is the authored unit for inputs, system inputs, sources, compute steps, outputs,
  event contracts, behavior, optional `potentialViews`, and optional hosted `blueprint`.
- `CellViewDecoration` is the reusable decoration shape: `capability`, optional `props`, optional
  `bindings`, and optional `visibility`.
- `CellPotentialView` adds optional `capability`, `region`, `before`, `after`, and `wrap`. A view is
  dormant unless its own `region` attaches to a slot reachable from the active presentation root; if
  `region` is an array, one independent instance is rendered per named slot.
- `PresentationDefinition` is a closed, flat set of `slots` plus a `root`. Slot entries
  self-declare nesting with `region`. Its mandatory `allowedCapabilities` authorizes every
  capability used by Cell views and view decorations. `exportedRegions` is optional;
  when present, each `PresentationRegionExport` maps a unique host-addressable `name` to exactly one
  declared `slot`, with optional `required` and `description` metadata.
- `listExportedPresentationRegions(blueprint)` returns a terminal Blueprint's exported regions as
  normalized `ExportedPresentationRegion` values, in declaration order.
  `listPresentationRegionExports(presentation)`, `findExportedPresentationRegion(regions, name)`,
  `collectPresentationRegionExportErrors(presentation, blueprintId)`, and
  `PRESENTATION_REGION_NAME_PATTERN` are exported alongside it.
