# Blueprint Authoring Playbook

A Blueprint is a governed data-flow graph plus an independent presentation skeleton. A Cell is the
only unit of data flow — it owns ports, sources, compute, and event behavior, and its shape never
changes across tiers. A Cell also carries `potentialViews`: zero, one, or many named external
manifestations, each dormant unless its own declared region is reachable from the active
presentation. `presentation` is a closed set of named slots with no knowledge of Cells. Attachment —
which slot a potential view occupies, or which slot a slot nests inside — is always self-declared on
the thing attaching, never a separate table. Tiers and recipes only ever select, add, or replace: which
views exist, which slot attachment each occupies, which internal implementation backs a Cell — never
which Cells or slots exist.

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

### Execution = one deterministic transition, always to quiescence

A Blueprint's Kernel is a pure, stateless reducer: `(old state, events) → (new state, effects)`.
Nothing is mutated in place and nothing runs in the background — one invocation loads a committed
state snapshot, applies the given events, and runs to completion within that single call.

Applying an event does not resolve into one Cell's output. It publishes into the Kernel's consequence
graph, and every Cell whose inputs changed re-evaluates in turn, publishing its own outputs — which can
change further Cells' inputs, which can trigger more Cells, and so on. This propagation is reactive and
multi-hop, and — because an output can legitimately feed back into an earlier Cell's input — it can be
genuinely circular. It is bounded, not infinite: the Kernel keeps settling until no Cell's inputs change
anymore (quiescence) or an execution/publication budget is reached.

Only once the graph is quiescent does the transition conclude. Every `invoke`, `route`, and `request`
triggered anywhere during that propagation is collected as an **effect** at that point — never performed
inline, and never before quiescence — and returned alongside the new state for the host to carry out. A
Blueprint never observes its own effect's result within the same transition: the result re-enters later
as a new event, starting a fresh transition over the state the prior transition already committed.

### Blueprint shape = one authored document, assembled from a fixed set of top-level fields

An authored Blueprint's `payload` is one JSON document. An agent authoring one always fills the same
top-level fields — nothing else is invented:

- `id`, `kind`, `version` — identity;
- `structureMode` / `structurePolicy` — whether and how the authored document may ever change (see
  **Structure mode** below);
- `interface` — this Blueprint's own port surface, for when it is hosted inside another Blueprint (see
  **Interface** below);
- `contextFormSpec` — the schema for the immutable `externalContext` a materialization expects;
- `tiers` / `recipes` — the authored representations and the lowering between them (see **Tiers +
  recipes** below);
- `cells` — the data-flow graph (see **Cells** above);
- `presentation` — the named-slot skeleton, plus an optional closed capability vocabulary (see
  **Presentation** below);
- `services` — the declared contracts Cells call through (see **Services** below);
- `runtime` — declared initial state and host-dependency wiring (see **Runtime** below);
- `metadata` — rarely needed freeform notes with no authoritative meaning. Leave it out unless a real
  need arises.

A minimal, complete Blueprint — one source-backed Cell feeding a second Cell through a port, both
attached to the presentation skeleton — looks like this. Note the `compute` step: it is what turns the
settled source into both committed state and the `computed.*` value the output reads; a source alone
never populates `computed` on its own. Note also `potentialViews`: even a Cell with only one
manifestation still names it (`primary` is the conventional name for a Cell's sole view) — tiers/recipes
address a view by that name, and the name is what lets an AI coding agent add a second manifestation
later (e.g. `compact`) without touching the first.

```json
{
  "gik": "0.1",
  "type": "blueprint",
  "payload": {
    "id": "incident-review",
    "kind": "app",
    "version": "1",
    "structureMode": "fixed",
    "tiers": [{ "id": "base", "kind": "app-domain" }],
    "recipes": [],
    "services": {
      "incident-data": {
        "kind": "storage-kv",
        "version": "1",
        "operations": {
          "listIncidents": {
            "operation": "read",
            "contract": "storage-kv/v1",
            "settlement": { "transform": { "kind": "jsonata", "expr": "{'ops':[]}" } }
          }
        }
      }
    },
    "runtime": { "state": { "review": {} } },
    "cells": {
      "incidents": {
        "id": "incidents",
        "sources": [
          { "id": "list", "service": "incident-data", "operation": "listIncidents" }
        ],
        "compute": [
          { "id": "capture", "expression": "sources.list", "assign": "review.incidents", "dependencies": ["sources.list"] }
        ],
        "outputs": [
          { "token": "incidentList", "from": "computed.review.incidents", "when": "$exists(computed.review.incidents)" }
        ],
        "potentialViews": {
          "primary": {
            "capability": "fluent:table",
            "bindings": { "rows": { "from": "review.incidents" } },
            "region": "list"
          }
        }
      },
      "detail": {
        "id": "detail",
        "inputs": [{ "token": "incidentList", "as": "incidents" }],
        "potentialViews": {
          "primary": { "capability": "primitive:markdown", "region": "detail" }
        }
      }
    },
    "presentation": {
      "slots": ["root", { "id": "list", "region": "root" }, { "id": "detail", "region": "root" }],
      "root": "root"
    }
  }
}
```

### Cells = the unit of data flow

A Cell is the only participant in the data-flow graph — the sole thing with ports, and the only thing
tiers/recipes are forbidden from restructuring. Name it for a stable semantic responsibility, not a
layout (`summary`, `evidence`, `risks`, `actions` — never `left-column`, `header-bar`). A Cell owns:

- **ports** — `inputs` (what it consumes) and `outputs` (what it publishes);
- **sources** — external/service fetches, each independently gated by its own `when`;
- **compute** — an ordered internal derivation step (see below);
- **events + behavior** — declared event ingress (`events`) and the actions that answer each one
  (`behavior.on`, detailed under **Events + behavior** below);
- **hosting** — nest another Blueprint via `blueprint` (`$ref` to a registered id, or `inline`); its
  declared outputs surface as this Cell's own outputs, exactly like any other Cell.

A Cell's identity, ports, and event contracts are invariant across every tier: no tier or recipe may
add, remove, replace, or rename a Cell. `addCell`/`replaceCell`/`removeCell` (a `BlueprintPatch`) is a
governance-gated edit to the *authored* Blueprint itself, admitted only under `reconfigurable`/`adaptive`
structure mode via `admitBlueprintPatch` — never a lowering-time tool, and never something a recipe
carries. If an interaction needs its own event and its own behavior, that is a real data-flow
responsibility: author it as a Cell from the start, not as something a recipe introduces partway
through lowering.

### Interface = a Blueprint's own port surface, for when it is hosted

Top-level `interface` (`inputs`/`outputs`/`events`) is what a *whole Blueprint* exposes when a Cell
hosts it via `blueprint`, exactly parallel to a Cell's own `inputs`/`outputs`/`events`. Declare
`interface.inputs` for anything the hosting Cell must supply — a missing required input is rejected by
Blueprint validation itself, checked against the hosting Cell's actual terminal (post-lowering) view,
not the pre-lowering authored one, since a representation may still introduce, replace, or remove the
view that supplies it; declare `interface.outputs` as `{ token: { from: <state path> } }` so the hosting Cell's own
outputs can surface a value the hosted Blueprint produced; declare `interface.events` for every event
name the hosting Cell may raise into it. A Blueprint meant only to run standalone does not need one.

### compute = the Cell's shared derivation, available to every one of its facets

`compute` is an ordered list of expressions evaluated over the Cell's own `inputs`, settled `sources`,
`systemInputs`, and every earlier `compute` result in the same evaluation. Each step's `assign` both
commits a real state write and makes that value available, for the rest of that one evaluation, to:

- later `compute` steps — chained derivation;
- `sources[].when` — gating whether a source fires;
- `outputs[].from` — what a port publishes;
- and, once committed to state, the Cell's own view bindings and later `behavior.on` handlers.

Reach for `compute` whenever a Cell needs to derive a value, whether or not that Cell has any sources —
it is not a helper that exists only to feed a source.

### A Cell has exactly two seams that context is ever allowed to vary

Everything a Cell is allowed to vary by context lives in exactly two places, and both are resolved
once, deterministically, at materialization (`materializeBlueprint(A, C) = T` — ADR-0046) — never
re-evaluated at runtime:

- **implementation** — `sources` + `compute` + `behavior`: how the Cell gets and derives its data, and
  how it answers its own events;
- **projection** — `potentialViews`: the named external manifestations a Cell carries, each one dormant
  until its own `region` is reachable from the presentation active for that materialization (see
  **Attachment** below).

These two seams are independently selected — not two facets of one choice. A Blueprint's `recipes` lower
one tier to the next using the *same mechanism applied twice*: a recipe's `representations[]` selects,
per `when` predicate over immutable `externalContext`, which alternative of a Cell's `potentialViews`
apply; its `implementationPrograms[]` independently selects, by its own `when` predicates, which
alternative `sources`/`compute`/`behavior` apply. Both lists are declared once per recipe and compose
multiplicatively — any representation combined with any implementation program is a valid, real
materialization — so N representations and M implementation programs give N×M actual outcomes from only
N+M authored entries. This is the mechanism that lets, say, a headless host, a browser host, and an
Azure Function host all run the *same* Blueprint (representations vary; sources/behavior may too), while
a "which stock-quote provider" choice and a "mobile vs. desktop layout" choice stay entirely independent
of each other. The only thing invariant across every tier is a Cell's ports (`inputs`/`outputs`) and its
declared event names/payload shapes — but the two seams are not symmetric in what they may introduce:

- **projection** — a representation may introduce a Cell's very first named view, add another one
  alongside an existing view, or replace one already there; nothing about a view needs to pre-exist.
- **implementation** — an implementation program may only *replace* a `sources` entry (or the service it
  names) that the Cell already declares at authoring time. The compiler enforces this by resolving each
  source's contract (its named operation's `contract`, in `services`) rather than by comparing an
  authored value: an override's set of source ids and their *resolved* contracts must exactly match the
  Cell's already-authored `sources`, and a service override's `{operationId, contract}` pairs must
  exactly match that service's already-authored `operations` — same count, same ids, same contracts,
  every time. An implementation program can swap *which* service backs a source, or change a service's
  request/response transforms and config, but it can never give a Cell a source (or a service an
  operation) that was not already authored on the Cell or in top-level `services`. If a Cell needs a
  source at all under some external context, author that source (and its backing service) as the
  baseline at authoring time; implementation programs then only ever choose between concrete backings
  for it.

A representation's `views` entry for a Cell is keyed by view name and upserted onto that Cell's
`potentialViews` — so a representation can add a Cell's first view, add a second named view alongside an
existing one, or replace one already there, all with the same shape. Mutable runtime state is never a
materialization input: a new external context produces a new materialization, not a runtime switch.

### A view is dormant until its region is reachable — sources are not

`potentialViews` are like unqueried database views: authored, real, and completely inert until something
selects them. A Cell's view stays dormant — never rendered, never in the document tree, contributing
nothing — unless its own `region` names a slot reachable from the presentation active for that
materialization. This is a *materialization-time* selection, never a runtime one. Naming more than one
view on the same Cell (e.g. `primary` and `compact`, or `primary` and `nested`) is the ordinary way one
Cell serves several different presentations — one Cell, one data flow, many potential manifestations,
only one ever live per slot per materialization.

Do not confuse this with `sources`: a Cell's sources/compute run unconditionally as part of the
consequence graph regardless of whether any of its views are attached anywhere. A Cell can be a "pure
data" participant with zero `potentialViews` at all — it still fully participates in data flow, and
its `behavior.on` handlers still dispatch, addressed directly by Cell id rather than by a compiled view
node.

### Components exist only inside a Cell's projection

A button, container, or text block is never itself a data-flow participant — it has no ports of its
own. It exists only as one of a Cell's `potentialViews`, and every binding or visibility rule on it is
scoped entirely to the one Cell that owns it: a named view is one primary component plus, optionally,
inert `before`/`after` decorations around it. A decoration never carries its own event or its own
derivation — the moment a piece of content needs either, it is not a decoration, it is its own Cell.

Use capability, props, bindings, and decorations according to the described component contract:

- Intrinsic content → props.
- State-backed content → bindings.
- Surrounding presentation → decorations (`before`/`after`).
- Where it renders → `region` (see **Attachment** below).
- Independently meaningful content, with its own event or derivation → its own Cell, not a decoration.

Declare only capabilities actually used and import matching projection views. A Blueprint may
optionally close this vocabulary down further with `presentation.allowedCapabilities` (see below) —
when present, referencing anything outside it is a validation error, not just a convention.

### Presentation = a closed set of named slots, plus an optional closed capability vocabulary

The `presentation` section declares every slot name that exists, which one is the root, and
optionally — via `allowedCapabilities` — the closed set of capability names any view or decoration in
this Blueprint may use. It has no knowledge of Cells, and it carries no tree of who contains whom:

```json
"presentation": {
  "slots": [
    "studio",
    { "id": "catalog", "region": "studio" },
    { "id": "workspace", "region": "studio" },
    { "id": "catalog-title", "region": "catalog" },
    { "id": "catalog-list", "region": "catalog" }
  ],
  "root": "studio",
  "allowedCapabilities": ["fluent:text", "fluent:list"]
}
```

`allowedCapabilities` is optional and absent by default (any capability name is legal, the ordinary
case). Declare it only when a Blueprint genuinely needs a closed, enforced vocabulary — for example, a
Blueprint validating an AI-generated nested Blueprint against a fixed set of capabilities it was told
it may use.

### Attachment is self-declared, by whatever is attaching

Nothing is ever declared as "containing" something else in a separate table. Instead, the thing being
placed says, on itself, which slot it lives in:

- a **slot** that nests inside another slot carries its own parent as `region`, as shown above;
- a **Cell's named view** carries the slot(s) it occupies the same way:
  `"potentialViews": { "primary": { "region": "catalog-list", ... } }`.

A view's `region` may be an array when that same named view is meant to render independently in more
than one slot — the same underlying Cell, instantiated twice, each instance still reading and writing
through that one Cell's ports and events (the same relationship as one reusable component mounted under
two different parents on a page). A Cell with several named `potentialViews` can also attach each one to
a different region — e.g. `primary` in a form slot and `nested` in a preview slot — so it presents two
independent manifestations of the same data at once.

Because attachment is self-declared, deletion is always safe: removing a Cell removes its own
`potentialViews` (and every `region` they declared) with it; removing a slot removes its own parent
declaration with it. Nothing external ever needs to be found and edited, and `PREFLIGHT` only needs to
confirm every declared `region` resolves to a slot, or Cell, that still exists.

### Tiers + recipes select — and, for views only, may add — they never restructure

A tier is an authored representation; a recipe lowers one tier to the next by independently choosing,
through its `representations[]` and `implementationPrograms[]` (see **two seams** above), between
authored alternatives for a Cell's two seams. A recipe may:

- add, select, or replace one or more of a Cell's named **`potentialViews`** — capability, props,
  bindings, visibility, decorations, and which slot(s) each named view's `region` attaches to; a view
  named here does not need to already exist on the Cell;
- select or replace a Cell's **implementation** — the `sources`/`compute`/`behavior` powering an existing
  Cell id, while its ports and event contracts stay exactly as declared. Unlike views, an implementation
  program cannot introduce a source (or a service operation) the Cell (or `services`) did not already
  declare at authoring time — see **two seams** above for the exact contract the compiler enforces.

A recipe never adds a slot, never adds a Cell, and never changes which Cells exist. Generation earns
no special trust: the terminal Blueprint must pass the same validation as any hand-authored one.

### Services = the declared contract a Cell's sources and invokes call through

Top-level `services` maps a service id (e.g. `incident-data`) to its `operations`: a Blueprint-facing
tool name mapped to a fully declarative pipeline — `operation` (the provider verb), `contract` (the
wire shape), optional `request`/`response` stages, and a mandatory `settlement`, each stage a JSONata
`transform` plus optional guardrail `validators`. A Cell's `source` names that same `service` id and
`operation` — never a `contract`; the source's contract is always the one the named operation declares,
resolved by the compiler rather than restated by the author. An `invoke` names the operations-map key
as `control.tool` and the owning service as `control.serviceRef`. There is no way to embed a private,
one-off service declaration directly on a Cell: every source must reference a real `services[...]`
entry, and referencing an unknown service or operation is rejected at validation time. Declare a
service once; every Cell that needs it references it by id.

### CellSource.acceptanceCriteria = per-usage-site guardrails, additive to the operation's own

A `source`'s `acceptanceCriteria` reuses the same `GuardrailRule[]` vocabulary as the operation's own
`response.validators`, plus `blueprint-capability-acceptance`: it checks every capability a response
declares or uses (`presentation.allowedCapabilities` plus every view/decorator `capability`, across
both a materialized `cells[*].potentialViews` shape and an un-lowered `recipes[*].representations[*]`
shape) against an accepted-capabilities list read from the request (`acceptedField`, default
`"acceptedCapabilities"`).

Put a check on the operation's `response.validators` when it holds no matter which Cell calls it
(always a valid Blueprint, always inert, always this tier shape). Put it on a source's own
`acceptanceCriteria` when it depends on what *this* call told the provider (which capabilities/sections
it said were acceptable) — that data is call-site-specific and cannot live at the operation level. This
matters most when a source's response is itself a generated Blueprint, since the accepted set is
usually computed by that Cell's own `input` transform and varies by caller.

`acceptanceCriteria` is additive, never a second policy authority: it merges with `response.validators`
and both are gated by the operation's one `onViolation` — there is no separate `onViolation` to author
on a source. Enforcement is host-level, right after `response.transform` and before
`settlement.transform` — materialization/`runTransition` never reads or evaluates it.

### Runtime = the declared initial state, plus host-dependency wiring

`runtime.state` is the only thing a Blueprint author actually declares here: the initial value for
every namespace a Cell's `compute`/`outputs`/`behavior` can assign or read. The namespaces a Blueprint
has, and the action verbs its `behavior.on` handlers use, are never separately authored — a host derives
both automatically (namespaces from `state`'s own top-level keys; actions by scanning declared
`behavior.on` handlers), so there is nothing to keep in sync by hand. `runtime.externals` declares
host-dependency wiring beyond services — currently `projectionViews` (the projection-view vocabulary
`potentialViews.<name>.capability` values resolve through) and `effectHandlers`. Top-level
`contextFormSpec` is the schema for the immutable `externalContext` a materialization is given — declare
its shape here rather than assuming callers already know it.

### Structure mode = governed change between generations, never mid-transition

`structureMode` — `fixed`, `reconfigurable`, or `adaptive` — decides whether the *authored* Blueprint
itself may ever change, and how. `fixed` accepts no `BlueprintPatch` at all. `reconfigurable` accepts
one only from an `authorized` origin. `adaptive` additionally admits a patch whose every operation is
listed in `structurePolicy.allowedBlueprintOperations` — a closed, authored whitelist, never an open
door. Admitting a patch produces a brand-new authored Blueprint; nothing about the Blueprint that is
currently running is touched. That new artifact must go through `materializeBlueprint` again, from
scratch, before anything executes it.

A separate, narrower whitelist — `structurePolicy.allowedProgramOperations` — lets an already-running
`adaptive` Blueprint's *executable* revision accept a pre-authorized `ProgramPatch` (graph/handler/
derivation edits) directly, without a new materialization. This is the one true runtime-mutable seam in
the whole model, and it is deliberately small: it can rewire the executable graph, but it can never
change a Cell's authored identity, ports, or event contracts.

### Continuous operation: many transitions over one lifetime, not one call

A Blueprint's real life is a long-lived sequence of transitions, not a single request/response — think
of a continuously running system fed a stream of events or sensor readings, not a one-shot form submit.
Each event is one heartbeat: propagate to quiescence, emit effects, commit state, wait for the next
event. What must survive from heartbeat to heartbeat is exactly what lives in `runtime.state` — the
whole record persists (or is checkpointed by the host) as one indivisible whole between transitions;
there is no current per-Cell fine-grained persistence tier. A Cell's `sources`/`compute` simply re-run
against whatever `runtime.state` holds at the start of each heartbeat.

This is also the honest shape of "self-evolving": evolution is never a Cell restructuring itself
mid-reflex — that is exactly what the Cell-invariance rule above forbids, for the same reason a living
organism does not grow a new organ to answer one stimulus. Self-evolution is inter-generational: an
`adaptive` Blueprint proposes a patch, governance admits or rejects it (selection pressure, not free
mutation), and if admitted, a new authored Blueprint is materialized and takes over — a new generation
that then goes on living its own continuous, reactive life the same way the last one did.

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
step must observe the committed state. A host derives the declared action vocabulary automatically by
scanning every `behavior.on` handler across the Blueprint — there is nothing to separately declare.

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
5. **COMPOSE** — slots and root, Cells, and each Cell's named `potentialViews` and `region` attachment.
6. **LOWER** — tiers, recipes, view/region selection, and permitted implementations.
7. **PREFLIGHT** — schemas, references, capability subset, cycles, and budgets.
8. **RETURN** — one complete Blueprint artifact; no commentary.

## Final gate

- Objective accomplished.
- Required sections satisfied.
- Used capabilities ⊆ accepted capabilities.
- No invented facts or hidden uncertainty.
- No unauthorized services, sources, actions, effects, or behavior.
- Component props, variants, data props, events, and slots validate.
- Cell, slot, region, and tier references resolve.
- Composition is intuitive, non-repetitive, and no denser than necessary.
