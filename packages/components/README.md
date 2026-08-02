# @gik/components

Public, self-describing declarative components for GIK React hosts.

The package has three public layers:

- `@gik/components/primitives`: domain-neutral UI mechanics such as chart, form, editable table,
  growing container, and timer button.
- `@gik/components/semantic`: domain-neutral information structures such as timeline, sequence,
  metric comparison, and relationship graph. Bundles supply meanings such as incident, alert, or
  consequence through data, labels, mappings, tokens, and behavior.
- `@gik/components/fluent`: reusable Fluent 2 controls that retain `fluent:*` capability names:
  badges, buttons, inputs, personas, spinners, tabs, tags, lists, tables, and data grids. Presentation choices are closed
  variants backed by native Fluent props; icon buttons are `fluent:button` variants.

`@gik/components` re-exports both layers and aggregate `component*` registries for compatibility.
New consumers should import the narrow subpath and register `primitiveComponentViews` and
`semanticComponentViews` under separate provider aliases. Register `fluentComponentViews` under a
`fluent` provider alias when documents use the Fluent control layer.

The package uses Fluent 2 React v9 through `@fluentui/react-components`. It assumes the host wraps
rendering in a Fluent `FluentProvider`; it does not create a theme or introduce a semantic provider.
Components use Fluent theme tokens and contain no independent palette.

Every component accepts native root `className` and `style` props. Internal styles use `makeStyles`;
root classes use Fluent `mergeClasses` with the consumer class last so callsite Griffel rules can
override component defaults. Use exported slot props for nested customization when a component
declares slots. The package does not expose a synthetic or Fluent v8-style `styles` bag.

Each component exports one definition containing its renderer, closed props schema, recognized
semantic tokens, closed variants where applicable, emitted events, slots, agent-facing authoring
guidance, validator, and trial materializer.

```ts
import {
  semanticComponentDefinitions,
  semanticComponentViews,
} from "@gik/components/semantic";

import {
  primitiveComponentViews,
} from "@gik/components/primitives";

import {
  fluentComponentViews,
} from "@gik/components/fluent";

const timeline = semanticComponentDefinitions.timeline;
const guidance = timeline.describe();
const defaultVariant = guidance.defaultVariant;
const variants = guidance.variants;
const schema = timeline.getSchema();
const report = timeline.validate(timeline.materializeTrial().props);
```

## React adapters

The root package exports `GikComponent` as the typed convenience API for rendering one package
component without constructing a `ResolvedNode`:

```tsx
import { GikComponent } from "@gik/components";

<GikComponent
  kind="primitive:chart"
  spec={{
    kind: "bar",
    title: "Requests",
    fields: { label: "hour", value: "count" },
  }}
  data={[{ hour: "09:00", count: 12 }]}
  variant="compact"
  onEvent={({ name, payload }) => dispatch(name, payload)}
/>
```

The public props are:

- `kind`: required closed capability ID, such as `primitive:chart` or `semantic:timeline`.
- `spec`: component-specific declarative specification, assigned to the component's `spec` prop.
- `data`: generic component data, assigned to the selected definition's declared `dataProp`.
- `variant`: an optional declared presentation variant.
- `componentProps`: additional component-specific props. Explicit `spec`, `data`, and `variant`
  values take precedence.
- `children`: content for components that declare a `children` slot.
- `id`: optional projection-node identity. A React-generated identity is used when omitted.
- `onEvent`: receives declared component events as `{ kind, name, payload, actorId }`.

`GikComponent` validates the assembled props against the selected definition before rendering.
It has no JSON-string or declarative-effect props; non-runtime React hosts may translate `onEvent`
into their own dispatcher.

Use `GikComponentDeclarative` when the input is one canonical JSON `DocNode`. The adapter creates
the minimal package vocabulary and program wrapper internally, then runs the node through the GIK
kernel. `GikComponentRuntimeProvider` supplies initial state and native effect handlers separately
from the JSON declaration:

```tsx
import {
  GikComponentDeclarative,
  GikComponentRuntimeProvider,
} from "@gik/components";

<GikComponentRuntimeProvider
  state={{ report: { points } }}
  effectHandlers={{ handleSelection }}
>
  <GikComponentDeclarative
    nodeJson={{
      id: "request-chart",
      capability: "primitive:chart",
      props: { spec: chartSpec },
      edges: {
        read: { points: "report.points" },
        on: {
          select: [{ do: "invoke", args: { tool: "handleSelection" } }],
        },
      },
    }}
  />
</GikComponentRuntimeProvider>
```

`nodeJson` accepts a JSON value and validates that it is a canonical projected node. It supports
the standard node edges, including `read`, `readExpr`, `gate`, `write`, `on`, `react`, and
`children`. The provider also accepts shared `contexts` and an optional projection-provider
resolver. Referenced `invoke` tools are declared as vocabulary externals and must have matching
provider handlers.

Projection providers remain explicit. A host registers each layer under a provider name, and a
bundle imports only the capabilities it uses. Nothing is ambient.

## Agent authoring kit

Generate instructions and tools for only the components an agent may author. Semantic and primitive
catalogs have parallel, layer-specific APIs:

```ts
import { getSemanticComponentAgentKit } from "@gik/components/semantic";
import { getPrimitiveComponentAgentKit } from "@gik/components/primitives";
import { getFluentComponentAgentKit } from "@gik/components/fluent";

const kit = getSemanticComponentAgentKit([
  "semantic:timeline",
  "semantic:action-board",
]);

const primitiveKit = getPrimitiveComponentAgentKit([
  "primitive:form",
  "primitive:editable-table",
]);

const fluentKit = getFluentComponentAgentKit([
  "fluent:button",
  "fluent:dropdown",
]);

// Add kit.instructions to the agent's authoring context.
// Contribute kit.tools to createStatelessAgentFaceDispatcher(extraTools).
```

The generated instructions derive from each selected definition's `describe()` metadata. Tool
schemas and handlers are restricted to the same selected capabilities. Short registry IDs such as
`timeline` and full IDs such as `semantic:timeline` are accepted and deduplicated. Omitting the list
selects the complete registry; an explicit empty list is rejected.

The package also exports the underlying pure APIs:

- `listSemanticComponents()`
- `describeSemanticComponent(capability)`
- `validateSemanticComponentProps(capability, props)`
- `preflightSemanticComponent(capability, props)`
- `materializeSemanticComponentTrial(capability, variant?)`
- `getSemanticComponentAgentInstructions(components?)`
- `createSemanticComponentAuthoringTools(components?)`
- `getSemanticComponentAgentKit(components?)`
- `listPrimitiveComponents()`
- `describePrimitiveComponent(capability)`
- `validatePrimitiveComponentProps(capability, props)`
- `preflightPrimitiveComponent(capability, props)`
- `materializePrimitiveComponentTrial(capability, variant?)`
- `getPrimitiveComponentAgentInstructions(components?)`
- `createPrimitiveComponentAuthoringTools(components?)`
- `getPrimitiveComponentAgentKit(components?)`
- `listFluentComponents()`
- `describeFluentComponent(capability)`
- `validateFluentComponentProps(capability, props)`
- `preflightFluentComponent(capability, props)`
- `materializeFluentComponentTrial(capability, variant?)`
- `getFluentComponentAgentInstructions(components?)`
- `createFluentComponentAuthoringTools(components?)`
- `getFluentComponentAgentKit(components?)`

`semanticComponentAuthoringTools`, `primitiveComponentAuthoringTools`, and
`fluentComponentAuthoringTools` are convenience catalogs for their complete registries.
These are ACX authoring tools, not live AX runtime tools. The package does not create
`copilot-instructions.md`, `SKILL.md`, or other host-specific agent customization files.

## Variants

`variant` is an optional top-level rendering prop with a closed component-specific string enum. An
authoring agent should inspect `describe().variants`, select a value whose `useWhen` guidance matches
the target surface, and use `defaultVariant` when no alternate presentation is required. Variants do
not change domain meaning, semantic status mapping, event contracts, or host theme ownership.

- Timeline: `standard`, `compact`, `minimal`
- Sequence: `standard`, `compact`
- Entity constellation: `grouped`, `compact`
- Decision summary: `detailed`, `concise`
- Action board: `board`, `list`
- Metric comparison: `standard`, `compact`, `ranked`
- Narrative section: `standard`, `compact`
- Evidence trail: `detailed`, `compact`
- Annotated source excerpt: `annotated`, `compact`
- Chart: `standard`, `compact`
- Semantic graph: `network`, `relations`

Chart's visualization kind is independent of
presentation variant. Set `spec.kind` to `bar`, `line`,
or `pie`; use `variant` only for `standard` or `compact` density.

Growing container owns bounded overflow for its `children` slot. Set `followEnd` to `always`,
`when-at-end`, or `off`. It has no data prop or presentation variant.

Timer button emits `press` with reason `manual` or `timeout`. It supports a simple auto countdown,
optional repeating timeout behavior, or a user-selectable manual/auto pace. Timer state is
projection-local; durable scheduling remains a runtime or service responsibility.

Form renders a schema-driven committed object editor and emits `save` with `{ values }`. Editable
table renders a committed row editor and emits `save` with `{ rows }`. Both keep draft state local;
bundle reactions own persistence and external effects.

## Events and effects

These projection components are declarative leaves. A definition's `events` list describes the
semantic events that its view may emit; the generated capability descriptor exposes the same list as
`emits`. A bundle may map those events to closed-grammar actions or external effect handlers in its
behavior graph. Components do not execute bundle effects directly.

Semantic timeline, sequence, entity constellation, and decision summary are currently render-only leaves.
Action board additionally emits `action`; a consuming bundle decides whether and how that event
causes state changes or external effects.

Primitive components:

- `chart`
- `editable-table`
- `form`
- `growing-container`
- `timeline`
- `timer-button`

Semantic components pending the catalog naming review described above:

- `timeline`
- `sequence`
- `entity-constellation`
- `decision-summary`
- `action-board`
- `metric-comparison`
- `narrative-section`
- `evidence-trail`
- `annotated-source-excerpt`
- `semantic-graph`