# Blueprint Authoring Playbook

A Blueprint is a governed semantic graph. Cells own stable responsibilities; tiers and recipes
lower them; views project them; roots and composition organize them.

## Experience heuristics

- **OUTCOME FIRST** — optimize for the user's task, not component usage.
- **SECTIONS ≠ COMPONENTS** — sections are obligations; choose their presentation.
- **VOCABULARY ≠ CHECKLIST** — accepted capabilities are options, not inventory to exhaust.
- **FIT > VARIETY** — choose the representation that fits the data and purpose.
- **COMPLEMENT > REPEAT** — combine views only when each adds understanding.
- **SIGNAL > DENSITY** — prioritize what matters; avoid dashboard clutter.
- **KISS** — use the smallest composition that fully accomplishes the objective.
- **DRY** — do not repeat information across prose, tables, and charts.
- **FACTS ≠ JUDGMENTS** — distinguish facts, derivations, interpretations, and uncertainty.
- **HONEST UNKNOWN** — expose missing evidence; never manufacture certainty.
- **CLOSED WORLD** — supplied context is the factual boundary unless explicitly expanded.
- **LEAST AUTHORITY** — use only accepted capabilities and authorized behavior.
- **BATCH DESCRIBE** — shortlist, then inspect every candidate in one `multiple-capabilities` call.
- **PREFLIGHT** — validate the Blueprint and every selected component contract.

The invocation owns the outcome, required sections, accepted capabilities, constraints, and local
currency. Satisfy every required section; decide how many Cells it needs and which authorized
components communicate it most intuitively.

## Blueprint mechanics

### Cells = responsibilities

Name Cells for stable semantic roles, not layouts: `summary`, `evidence`, `risks`, `actions`.
A Cell may compute, call a service, present, group children, or host another Blueprint. Keep its
identity, responsibility, ports, and data-flow role stable across tiers.

### Tiers + recipes = lowering

Tiers are authored representations. Recipes lower one tier to the next. A representation may:

- select views;
- select roots and composition;
- append sparse composition;
- add decorations;
- provide contract-compatible Cell implementations.

Generation earns no special trust: the terminal Blueprint must pass normal validation.

### Roots + composition = semantic organization

Sketch the semantic tree, then encode it:

```json
{
  "roots": ["report"],
  "composition": {
    "report": {
      "slots": {
        "overview": ["summary"],
        "analysis": ["evidence", "risks"]
      }
    }
  }
}
```

Slot names express meaning; views decide physical layout. Slot declaration order and each Cell array
define authoritative order. Every referenced Cell must exist and every presented Cell appears once.

### Structural Cells = meaningful boundaries

Add a structural Cell only when the boundary owns layout, grouping, visibility, identity,
accessibility, decoration, binding, representation selection, or nested Blueprint hosting.

### Views = projection choices

Use capability, props, bindings, and decorations according to the described component contract.

- Intrinsic content → props.
- State-backed content → bindings.
- Surrounding presentation → decorations.
- Independently meaningful content → its own Cell.

Declare only capabilities actually used and import matching projection views.

### Events + behavior = interaction

A Cell declares stable event ingress under `events`, including the payload schema for each event.
`behavior.on` supplies the ordered actions for those events. A lowering implementation may replace
the handler while preserving the event name and payload contract.

The closed action vocabulary is:

- `assign` — write a literal value or an expression result to runtime state;
- `emit` — re-enter the owning Cell through another declared event;
- `invoke` — call an authorized external tool or service;
- `route` — request an authorized destination handoff;
- `request` — acquire a governed decision, clarification, or data response.

`assign` and `emit` complete while handling the event. `invoke`, `route`, and `request` produce
external effects: work that the host performs after the Blueprint has finished its synchronous state
transition. Any action may have a `guard`. Carry effect input explicitly and do not depend on ordering
between multiple external effects.

Expressions in one handler read the state snapshot from the start of that handler. A later action in
the same list must not depend on observing an earlier `assign`; emit a follow-up event when another
step must observe the committed state. Declare every action family the Blueprint uses in
`runtime.actions`.

Use a Cell source when external data is an input to the Cell's computation or outputs. Use behavior
actions when an external call is a response to a declared user or system event. When an `invoke`
depends on the declared settlement of a Blueprint service operation, identify that service with
`control.serviceRef`; other invokes are fire-and-forget from Blueprint state.

For `invoke`, put the authorized operation in `control`, explicit input in `data`, and any condition
in `guard`. For `request`, use `control.kind` `decision`, `clarification`, or `data`, define its
response schema, and carry host context in `data`. Requests return through later declared events, not
immediate values.

## Authoring loop

1. **READ** — outcome, sections, context, constraints, currency, authority.
2. **MODEL** — stable responsibilities, state, ports, and data flow.
3. **DISCOVER ONCE** — if needed, call `catalog-capabilities` with the accepted capability IDs.
4. **DESCRIBE ONCE** — call `multiple-capabilities` with all shortlisted IDs; never serialize details.
5. **COMPOSE** — roots, semantic slots, Cells, and views.
6. **LOWER** — tiers, recipes, bindings, and permitted implementations.
7. **PREFLIGHT** — schemas, references, capability subset, cycles, and budgets.
8. **RETURN** — one complete Blueprint artifact; no commentary.

## Final gate

- Objective accomplished.
- Required sections satisfied.
- Used capabilities ⊆ accepted capabilities.
- No invented facts or hidden uncertainty.
- No unauthorized services, sources, actions, effects, or behavior.
- Component props, variants, data props, events, and slots validate.
- Cell, binding, root, composition, and tier references resolve.
- Composition is intuitive, non-repetitive, and no denser than necessary.
