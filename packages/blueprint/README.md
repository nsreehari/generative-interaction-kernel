# @gik/blueprint

Canonical Blueprint artifacts, Cells, tiers, lowering recipes, and validated lowering into
`@gik/kernel` executable programs.

```bash
npm install @gik/blueprint @gik/kernel @gik/evaluators @gik/durable-runtime
```

## External services

A Blueprint may declare concrete logical services in `payload.services`. The Blueprint owns each
service's kind, non-secret configuration, operation contract, request and response stages,
validation, violation behavior, settlement, and failure settlement. Cells may associate operations
through `sources`, and behavior invokes a declared operation through the existing `invoke` action.

The Blueprint does not execute services. An outer host admits trusted service-kind factories,
constructs `DefaultServiceHost`, supplies credentials and endpoint policy, and connects it through
the runtime Orchestrator. Literal credentials must never appear in Blueprint configuration or
runtime state.

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

`gik:blueprint` is the host-provided structural capability for rendering a Blueprint inside another
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
    "root": "workspace"
  },
  "cells": {
    "catalog": { "potentialViews": { "primary": { "capability": "...", "region": "navigation" } } },
    "detail": { "potentialViews": { "primary": { "capability": "...", "region": "content" } } }
  }
}
```

Slot names express caller-owned placement intent. They are available to representation tiers and
lowering recipes, but are not component insertion points and carry no capability or props of their
own — visual styling for a region is always a rendering host/theme concern, never Blueprint-authored
data. Materialization flattens the resolved attachments deterministically into ordinary ordered
children, so Cells and component projections do not need to understand the slot names. Attachment is
always self-declared by the thing attaching (a slot's own `region`, or a named `potentialViews` entry's
own `region`),
never a third structure — deleting a Cell or a slot removes its own attachment fact with it. A Cell's
`region` may name more than one slot, rendering one independent instance per attachment while every
instance reads and writes through that one Cell. A representation may replace the complete
presentation or append additional slot entries (`presentationAppend`, a plain array concatenation).

## Worker hosting

`@gik/blueprint/worker` coordinates one journal/engine/effect cycle per wake. Connector-specific
factories are available from:

- `@gik/blueprint/worker/in-memory`
- `@gik/blueprint/worker/indexed-db`
- `@gik/blueprint/worker/filesystem-mcp`
- `@gik/blueprint/worker/azure`

Workers are asynchronous and placement-neutral. Wake notifications are hints, leases arbitrate
ownership, and effect outcomes return through the journal before changing Blueprint state.

## Exported API

### Artifact and validation

- `createBlueprint(definition)` clones a `BlueprintDefinition`, wraps it in the `BlueprintArtifact`
  envelope (`gik: "0.1"`, `type: "blueprint"`), validates it, and returns the validated artifact.
- `validateBlueprintArtifact(value)` asserts that a value is a `BlueprintArtifact`. Validation covers
  the envelope, Blueprint identity and runtime declaration, tier and recipe shape, Cell key/id
  agreement, service-operation references, presentation slot references,
  `presentation.allowedCapabilities`, and required `interface.inputs` for inline hosted child
  Blueprints.

### Materialization and transition

- `materializeBlueprint({ blueprint, externalContext?, resolveBlueprint?, capabilityCatalog? })`
  assembles child Blueprint references, validates external context, applies authored lowering recipes
  when present, and returns a portable `MaterializedBlueprint`.
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
  compiles a validated `ExecutableCellTopology` into an `@gik/kernel`
  `ExecutableProgramDefinition`.
- With a `presentation`, it projects Cells into the declared slot graph. Without a `presentation`, it
  still emits handlers, computation/source graph nodes, and discoverable hosted-Blueprint nodes.
- A `CellPotentialView`'s `before` and `after` decorations render as sibling fragments around the
  primary node. `wrap` decorations nest the primary node inside successive decoration layers,
  outermost first.

### Core authored contracts

- `BlueprintArtifact` is the portable authored envelope. Its `payload` is a `BlueprintDefinition`.
- `CellDefinition` is the authored unit for inputs, system inputs, sources, compute steps, outputs,
  event contracts, behavior, optional `potentialViews`, and optional hosted `blueprint`.
- `CellViewDecoration` is the reusable decoration shape: `capability`, optional `props`, optional
  `bindings`, and optional `visibility`.
- `CellPotentialView` adds optional `capability`, `region`, `before`, `after`, and `wrap`. A view is
  dormant unless its own `region` attaches to a slot reachable from the active presentation root; if
  `region` is an array, one independent instance is rendered per named slot.
- `PresentationDefinition` is a closed, flat set of `slots` plus a `root`. Slot entries
  self-declare nesting with `region`. `allowedCapabilities` is optional; when present, every
  capability used by Cell views and view decorations must appear in it.