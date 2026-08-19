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
- **DESCRIBE, THEN DECIDE** — inspect plausible capabilities; never infer contracts from names.
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

## Authoring loop

1. **READ** — outcome, sections, context, constraints, currency, authority.
2. **MODEL** — stable responsibilities, state, ports, and data flow.
3. **DISCOVER** — shortlist from the accepted capability catalog.
4. **DESCRIBE** — inspect exact contracts for serious candidates.
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
