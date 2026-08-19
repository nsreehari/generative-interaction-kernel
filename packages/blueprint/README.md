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
	"view": {
		"capability": "host:hosted-blueprint",
		"bindings": { "content": { "from": "incident.content" } }
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
	"view": {
		"capability": "gik:blueprint",
		"bindings": {
			"blueprint": { "from": "portfolio.reportBlueprint" }
		}
	}
}
```

For registry-resolved children, use a Cell `blueprint` declaration with a canonical `$ref`. Both
forms use the same host-scoped nested Blueprint renderer; `gik:blueprint` is not a standalone
component-library projection.
Artifact assembly remains synchronous so cycle detection and interface admission complete before execution.

## Presentation composition

Blueprint presentation is authored independently from Cell definitions. `roots` select the projected
entry Cells, while `composition` maps each parent Cell to semantic slots containing ordered child Cell
ids:

```json
{
  "projections": {
    "presentation": {
      "roots": ["workspace"],
      "composition": {
        "workspace": {
          "slots": {
            "navigation": ["catalog"],
            "content": ["detail"]
          }
        }
      }
    }
  }
}
```

Slot names express caller-owned placement intent. They are available to representation tiers and
lowering recipes, but are not component insertion points. Materialization flattens the selected
composition deterministically into ordinary ordered children, so Cells and component projections do
not need to understand the slot names. A representation may replace the complete presentation or
append sparse parent/slot composition; append concatenates children within an existing slot.

## Worker hosting

`@gik/blueprint/worker` coordinates one journal/engine/effect cycle per wake. Connector-specific
factories are available from:

- `@gik/blueprint/worker/in-memory`
- `@gik/blueprint/worker/indexed-db`
- `@gik/blueprint/worker/filesystem-mcp`
- `@gik/blueprint/worker/azure`

Workers are asynchronous and placement-neutral. Wake notifications are hints, leases arbitrate
ownership, and effect outcomes return through the journal before changing Blueprint state.