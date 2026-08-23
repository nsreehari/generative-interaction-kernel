# @gik/components

Public, self-describing declarative components for GIK React hosts.

The package has five public layers:

- `@gik/components/primitives`: domain-neutral UI mechanics such as chart, collection board, form,
  editable table, growing container, infinite canvas, source viewer, and timer button.
- `@gik/components/semantic`: domain-neutral information roles and relationships such as event
  series, processes, measures, narratives, evidence, decisions, and relationship sets.
- `@gik/components/security`: security-domain contracts such as adversarial attack paths.
- `@gik/components/software`: software-domain contracts such as source findings and comparisons.
- `@gik/components/fluent`: reusable Fluent 2 controls that retain `fluent:*` capability names:
  badges, buttons, inputs, personas, spinners, tabs, tags, lists, tables, and data grids. Presentation choices are closed
  variants backed by native Fluent props; icon buttons are `fluent:button` variants.

`@gik/components` re-exports every layer and aggregate `component*` registries for convenience.
New consumers should import narrow subpaths and register each selected `*ComponentViews` registry
under its matching provider alias. Domain catalogs are opt-in rather than ambient.

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

Component-private interaction mechanics remain inside the component. Blueprint state represents
application behavior and cross-Cell coordination, not every local visual toggle. Components such
as `primitive:pane-with-trigger` therefore own their open/closed state by default and may emit
optional observation events. Use controlled props only when application behavior genuinely needs
to coordinate that state across components.

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

import { securityComponentViews } from "@gik/components/security";
import { softwareComponentViews } from "@gik/components/software";

const eventSeries = semanticComponentDefinitions["event-series"];
const guidance = eventSeries.describe();
const defaultVariant = guidance.defaultVariant;
const variants = guidance.variants;
const schema = eventSeries.getSchema();
const report = eventSeries.validate(eventSeries.materializeTrial().props);
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

- `kind`: required closed capability ID, such as `primitive:chart` or `semantic:event-series`.
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

Generate instructions and tools for only the components an agent may author. Every catalog has a
parallel, layer-specific API:

```ts
import { getSemanticComponentAgentKit } from "@gik/components/semantic";
import { getPrimitiveComponentAgentKit } from "@gik/components/primitives";
import { getFluentComponentAgentKit } from "@gik/components/fluent";
import { getSecurityComponentAgentKit } from "@gik/components/security";
import { getSoftwareComponentAgentKit } from "@gik/components/software";

const kit = getSemanticComponentAgentKit([
  "semantic:event-series",
  "semantic:work-set",
]);

const primitiveKit = getPrimitiveComponentAgentKit([
  "primitive:form",
  "primitive:editable-table",
]);

const fluentKit = getFluentComponentAgentKit([
  "fluent:button",
  "fluent:dropdown",
]);

const securityKit = getSecurityComponentAgentKit(["security:attack-path"]);
const softwareKit = getSoftwareComponentAgentKit(["software:source-comparison"]);

// Add kit.instructions to the agent's authoring context.
// Contribute kit.tools to createStatelessAgentFaceDispatcher(extraTools).
```

The generated instructions derive from each selected definition's `describe()` metadata. Tool
schemas and handlers are restricted to the same selected capabilities. Short registry IDs such as
`event-series` and full IDs such as `semantic:event-series` are accepted and deduplicated. Omitting the list
selects the complete registry; an explicit empty list is rejected.

The renderer-free `agentFacingComponentCatalog` is designed for the common transport-free
`describe` tool. Agents first use `catalog-capabilities` to shortlist, then request every selected
contract together with `multiple-capabilities`. There is no singular detail operation; hosts should
merge custom catalogs before constructing the tool.

The package also exports the underlying pure APIs:

- `listSemanticComponents()`
- `describeSemanticComponent(capability)`
- `validateSemanticComponentProps(capability, props)`
- `preflightSemanticComponent(capability, props)`
- `materializeSemanticComponentTrial(capability, variant?)`
- `getSemanticComponentAgentInstructions(components?)`
- `createSemanticComponentAuthoringTools(components?)`
- `getSemanticComponentAgentKit(components?)`
- `listSecurityComponents()` / `getSecurityComponentAgentKit(components?)`
- `listSoftwareComponents()` / `getSoftwareComponentAgentKit(components?)`
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

Each layer exports a `*ComponentAuthoringTools` convenience catalog for its complete registry.
These are ACX authoring tools, not live AX runtime tools. The package does not create
`copilot-instructions.md`, `SKILL.md`, or other host-specific agent customization files.

The root entry point also exports `componentViews`, `componentDefinitions`, and
`componentCapabilities` — each an aggregate merging the fluent, primitive, semantic, security, and
software registries of the same name. Use them when a host wants one combined registry across every
layer instead of registering each layer separately.

## Variants

`variant` is an optional top-level rendering prop with a closed component-specific string enum. An
authoring agent should inspect `describe().variants`, select a value whose `useWhen` guidance matches
the target surface, and use `defaultVariant` when no alternate presentation is required. Variants do
not change domain meaning, semantic status mapping, event contracts, or host theme ownership.

- Event series: `chronology`, `axis`, `text`
- Process: `flow`, `stages`, `text`
- Entity set: `clusters`, `matrix`, `list`, `text`
- Decision: `summary`, `rationale-chain`, `text`
- Graph diagram: `diagram`, `canvas`
- Chart: `standard`, `compact`
- Collection board: `standard`, `compact`
- Fluent list: `standard`, `selectable`, `vertical-cards`
- Date time: `date`, `time`, `timestamp`
- Gantt: `standard`, `compact`
- Semantic graph: `network`, `relations`
- Infinite canvas: `standard`, `compact`, `minimal`
- Source viewer: `standard`, `compact`
- Attack graph: `canvas`, `diagram`, `relations`, `gantt`, `text`

Timeline's `axis` variant places point events as labeled markers on one horizontal scale. Its
`spec.scale` uses the same datetime and numeric linear coordinate options as Gantt, including
fractional values, shared `tickStep` markers, and presentation-only `displayPrefix` labels.

Chart's visualization kind is independent of
presentation variant. Set `spec.kind` to `bar`, `line`,
or `pie`; use `variant` only for `standard` or `compact` density.

Gantt accepts either actual timestamps or logical coordinates. Omit `spec.scale` (or set
`kind: "datetime"`) for timestamp intervals. Set `spec.scale.kind` to `linear` for numeric ranges.
Optional `minimum` and `maximum` values define a fixed domain such as `0..100`; without bounds, the
domain is derived from data. `displayPrefix` is presentation-only, so numeric `1` may display as `T1`.
Set a positive `tickStep` to render shared column markers above the tracks: milliseconds for datetime
scales and coordinate units for linear scales. Datetime row labels and axis markers use human-readable
browser-local values. `primitive:datetime` owns the reusable `date`,
`time`, and `timestamp` scalar presentations and exports matching formatter utilities. Dates omit
the year when it is the current local year and include it for previous or future years. Time and
timestamp omit seconds and timezone labels by default; `showSeconds` and `showTimeZone` opt into them.
Time uses 24-hour format by default; set `hourFormat: "12"` for locale-appropriate AM/PM output.
The formatter exports accept the same options programmatically.

Growing container owns bounded overflow for its `children` slot. Set `followEnd` to `always`,
`when-at-end`, or `off`. It has no data prop or presentation variant.

Infinite canvas accepts JSON-native node descriptors and ports. Put target ports on `left` or `top`,
source ports on `right` or `bottom`, and give each intended connection one shared token; the component
derives edges automatically and emits `node`, `edge`, and `layout`. It does not accept an edge array or
React render callbacks through its declarative contract.

Attack graph accepts semantic `entities` and `relationships` plus declarative field mappings. Its
variants choose a representation rather than a density: `canvas` maps relationships to matching
ports and delegates interaction and geometry persistence to `primitive:infinite-canvas`; `diagram`
renders a static node-link overview; `relations` renders accessible source-predicate-target cards
without drawn edges; `gantt` maps relationships with start/end fields into `primitive:gantt`; `text`
renders plain ordered relationship statements with no visual geometry and includes human-readable
start/end timestamp metadata when mapped timestamp fields are available.
Attack graph passes its optional `spec.ganttScale` through to the primitive, so relationships may use
actual timestamps or numeric linear coordinates, optionally formatted as `T1..T5` for presentation.
Datetime and linear scales are configurations of the same `gantt` representation, not Attack Graph variants.

Timer button emits `press` with reason `manual` or `timeout`. It supports a simple auto countdown,
optional repeating timeout behavior, or a user-selectable manual/auto pace. Timer state is
projection-local; durable scheduling remains a runtime or service responsibility.

Form renders a schema-driven committed object editor and emits `save` with `{ values }`. Editable
table renders a committed row editor and emits `save` with `{ rows }`. Both keep draft state local;
explicit event handlers own persistence and external effects.

Collection board arranges records in declared columns. Its optional interaction configuration enables
single selection, ordering within a column, and movement between columns without assigning workflow
meaning to those columns. It emits `select`, `activate`, `reorder`, and `move`; event handlers validate
business transitions and persist the resulting placement. `standard` and `compact` are density variants.

Source viewer renders exact mapped source rows and precomputed diffs. Set `spec.kind` to `source`,
`unified-diff`, or `split-diff`; these are representations of one source-row model, while `standard`
and `compact` remain density variants. Diff rows must already contain aligned before/after content and
a recognized change value. The primitive presents changes but does not calculate or interpret them.

## Events and effects

These projection components are declarative leaves. A definition's `events` list describes the
semantic events that its view may emit; the generated capability descriptor exposes the same list as
`emits`. A bundle may map those events to closed-grammar actions or external effect handlers in its
behavior graph. Components do not execute bundle effects directly.

Most semantic and domain components are render-only leaves. Work sets and interactive graph
presentations emit declared intents; consuming bundles decide whether and how those intents change
state or invoke effects.

Primitive components:

- `chart`
- `datetime`
- `editable-table`
- `form`
- `gantt`
- `graph-diagram`
- `growing-container`
- `infinite-canvas`
- `timer-button`

Canonical semantic components:

- `argument` (`map`, `outline`, `text`)
- `event-series` (`chronology`, `axis`, `text`)
- `process` (`flow`, `stages`, `text`)
- `work-set` (`board`, `queue`, `list`, `text`)
- `entity-set` (`clusters`, `matrix`, `list`, `text`)
- `evidence-case` (`case`, `sources`, `chain`, `text`)
- `decision` (`summary`, `rationale-chain`, `text`)
- `narrative` (`article`, `outline`, `briefing`, `text`)
- `measure-set` (`tiles`, `table`, `ranking`, `text`)
- `milestones` (`rail`, `timeline`, `list`, `axis`, `text`)
- `relationship-set` (`network`, `matrix`, `relations`, `text`)

Security components:

- `attack-path` (`canvas`, `diagram`, `relations`, `gantt`, `text`)

Software components:

- `source-findings` (`findings`, `text`)
- `source-comparison` (`unified-diff`, `split-diff`, `text`)