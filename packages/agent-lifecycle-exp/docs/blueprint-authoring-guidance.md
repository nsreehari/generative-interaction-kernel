# Blueprint Authoring Playbook

A Blueprint is a governed data-flow graph plus an independent presentation skeleton. A Cell is the
only unit of data flow — it owns ports, sources, compute, and event behavior, and its shape never
changes across tiers. `presentation` is a closed set of named slots with no knowledge of Cells.
Attachment — which slot a Cell's view occupies, or which slot a slot nests inside — is always
self-declared on the thing attaching, never a separate table. Tiers and recipes only ever select:
which view, which slot attachment, which internal implementation — never which Cells or slots exist.

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
- `agentLifecycle` — which agent operations (`author`/`customize`/`use`) this Blueprint exposes, and to
  which target/intent kinds;
- `context` / `contextFormSpec` — the schema for the immutable `externalContext` a materialization
  expects;
- `tiers` / `recipes` — the authored representations and the lowering between them (see **Tiers +
  recipes** below);
- `cells` — the data-flow graph (see **Cells** above);
- `presentation` — the named-slot skeleton (see **Presentation** below);
- `services` — the declared contracts Cells call through (see **Services** below);
- `runtime` — declared state, namespaces, and context shape (see **Runtime** below).

A minimal, complete Blueprint — one source-backed Cell feeding a second Cell through a port, both
attached to the presentation skeleton — looks like this. Note the `compute` step: it is what turns the
settled source into both committed state and the `computed.*` value the output reads; a source alone
never populates `computed` on its own.

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
        "kind": "incidents",
        "sources": [
          { "id": "list", "service": "incident-data", "operation": "listIncidents", "contract": "storage-kv/v1" }
        ],
        "compute": [
          { "id": "capture", "expression": "sources.list", "assign": "review.incidents", "dependencies": ["sources.list"] }
        ],
        "outputs": [
          { "token": "incidentList", "from": "computed.review.incidents", "when": "$exists(computed.review.incidents)" }
        ],
        "view": {
          "capability": "fluent:table",
          "bindings": { "rows": { "from": "review.incidents" } },
          "region": "list"
        }
      },
      "detail": {
        "id": "detail",
        "kind": "detail",
        "inputs": [{ "token": "incidentList", "as": "incidents" }],
        "view": { "capability": "primitive:markdown", "region": "detail" }
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
add, remove, replace, or rename a Cell. `addCell`/`replaceCell`/`removeCell`
(`VocabularyLoweringRecipeDefinition`'s `BlueprintPatch`) is a governance-gated edit to the *authored*
Blueprint itself, admitted only under `reconfigurable`/`adaptive` structure mode — never a lowering-time
tool. If an interaction needs its own event and its own behavior, that is a real data-flow
responsibility: author it as a Cell from the start, not as something a recipe introduces partway
through lowering.

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
- **projection** — `view`: how the Cell manifests to a renderer, and which slot(s) it occupies (see
  **Attachment** below).

A representation selects between authored alternatives for one or both seams through a `when`
predicate over immutable `externalContext` — desktop vs. compact, editable vs. read-only, which
service backs a source, and so on. It never changes a Cell's ports or event contracts, and mutable
runtime state is never a materialization input: a new external context produces a new materialization,
not a runtime switch.

### Components exist only inside a Cell's projection

A button, container, or text block is never itself a data-flow participant — it has no ports of its
own. It exists only as the Cell's `view`, and every binding or visibility rule on it is scoped entirely
to the one Cell that owns it: a `view` is one primary component plus, optionally, inert `before`/`after`
decorations around it. A decoration never carries its own event or its own derivation — the moment a
piece of content needs either, it is not a decoration, it is its own Cell.

Use capability, props, bindings, and decorations according to the described component contract:

- Intrinsic content → props.
- State-backed content → bindings.
- Surrounding presentation → decorations (`before`/`after`).
- Where it renders → `region` (see **Attachment** below).
- Independently meaningful content, with its own event or derivation → its own Cell, not a decoration.

Declare only capabilities actually used and import matching projection views.

### Presentation = a closed set of named slots, nothing more

The `presentation` section declares only two things: every slot name that exists, and which one is the
root. It has no knowledge of Cells, and it carries no tree of who contains whom:

```json
"presentation": {
  "slots": [
    "studio",
    { "id": "catalog", "region": "studio" },
    { "id": "workspace", "region": "studio" },
    { "id": "catalog-title", "region": "catalog" },
    { "id": "catalog-list", "region": "catalog" }
  ],
  "root": "studio"
}
```

### Attachment is self-declared, by whatever is attaching

Nothing is ever declared as "containing" something else in a separate table. Instead, the thing being
placed says, on itself, which slot it lives in:

- a **slot** that nests inside another slot carries its own parent as `region`, as shown above;
- a **Cell's view** carries the slot(s) it occupies the same way: `"view": { "region": "catalog-list", ... }`.

A view's `region` may be an array when the same Cell's projection is meant to render independently in
more than one slot — the same underlying Cell, instantiated twice, each instance still reading and
writing through that one Cell's ports and events (the same relationship as one reusable component
mounted under two different parents on a page).

Because attachment is self-declared, deletion is always safe: removing a Cell removes its own `region`
declaration with it; removing a slot removes its own parent declaration with it. Nothing external ever
needs to be found and edited, and `PREFLIGHT` only needs to confirm every declared `region` resolves to
a slot, or Cell, that still exists.

### Tiers + recipes select — they never restructure

A tier is an authored representation; a recipe lowers one tier to the next by choosing between
authored alternatives for a Cell's two seams. A recipe may:

- select or override a Cell's **view** — capability, props, bindings, visibility, decorations, and
  which slot(s) its `region` attaches to;
- select a **contract-compatible implementation** for a Cell — swap the `sources`/`compute`/`behavior`
  powering an existing Cell id, while its ports and event contracts stay exactly as declared.

A recipe never adds a slot, never adds a Cell, and never changes which Cells exist. Generation earns
no special trust: the terminal Blueprint must pass the same validation as any hand-authored one.

### Services = the declared contract a Cell's sources and invokes call through

Top-level `services` maps a service id (e.g. `incident-data`) to its `operations`: a Blueprint-facing
tool name mapped to a fully declarative pipeline — `operation` (the provider verb), `contract` (the
wire shape), optional `request`/`response` stages, and a mandatory `settlement`, each stage a JSONata
`transform` plus optional guardrail `validators`. A Cell's `source` names that same `service` id,
`operation`, and `contract` directly. An `invoke` names the operations-map key as `control.tool` and,
only when it depends on that operation's declared settlement, names the owning service as
`control.serviceRef`. Declare a service once; every Cell that needs it references it by id — never
inline connection details on the Cell itself.

### Runtime = the declared state, namespaces, and context shape

`runtime` is where a Blueprint declares what actually exists to read and write: `state` seeds the
initial value for every namespace a Cell's `compute`/`outputs`/`behavior` can assign or read;
`namespaces` lists which top-level state namespaces are valid; `contexts` names any additional
read-only context stores beyond `externalContext`; `capabilities` and `externals` declare the
projection-view vocabulary (`view.capability` values and their prop schemas/slots/emitted events)
available to this Blueprint. Top-level `context` (with an optional `contextFormSpec`) is the schema for
the immutable `externalContext` a materialization is given — declare its shape here rather than assuming
callers already know it.

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
event. What must survive from heartbeat to heartbeat is exactly what a Cell's `state.persistence`
(`ephemeral`, `checkpointed`, or `durable`) declares — ephemeral working values reset naturally; anything
that must outlive a single reflex needs `checkpointed`/`durable` persistence declared explicitly.

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
5. **COMPOSE** — slots and root, Cells, and each Cell's view and `region` attachment.
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
