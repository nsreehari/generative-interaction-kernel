# T3 — Live Workspace : SOC — working notes

> Scope: **Beats 2 and 3** of the 4-Beat pitch IA (see `working-doc.md` D3). Build the runtime-plane
> hero and expose the semantic blueprint that lowers into it: a mixed human-agent incident room
> where distinct participants act through one governed event model, change one shared operational
> state, and leave one attributable causal record.
>
> Status: **BEATS 2 AND 3 IMPLEMENTED AND VALIDATED (2026-07-15).** `live-workspace-soc` now mounts
> the governed mixed-team runtime and reveals its executable four-tier semantic blueprint in the
> same developer-console shell. The existing `workbench` remains unchanged and independently
> routable.

---

## 0. Product thesis

GIK is not primarily a UI generator, agent framework, or workflow engine. It is a shared
interaction kernel for systems in which humans and agents participate together:

> **Many actors. One state. Multiple views. Governed actions. Complete provenance.**

For the demo audience, say it in operational language:

> **A mixed team of humans and agents can collaborate through one shared operational state, with
> every contribution attributable and every consequential action governed.**

Humans and agents are peers in participation, but not necessarily in authority. Both use the same
event path and affect the same state. Their roles determine what each may contribute, propose,
recommend, authorize, or execute.

The demo must make that claim visible without requiring narration:

- **Bottom participant panels:** many distinct human and agent actors.
- **Center workspace:** one shared operational state.
- **Right journal/ledger:** durable causality and accountability.
- **Top control panel:** presenter control only; it is not another participant.

## 1. Audience takeaway and proof boundary

The audience should leave with one thought:

> **GIK makes a mixed team behave like one coherent, governed system without erasing who acted,
> what authority they had, or why the shared state changed.**

The demo must visibly prove:

- two humans and two agents are distinct actors with different responsibilities and authority;
- all four contribute through the same GIK event contract;
- their actions converge on one shared incident state rather than separate chats or fixtures;
- an action, its governed result, its state change, and its journal entry remain causally linked;
- governance constrains humans as well as agents;
- a consequential action requires the correct human role;
- the final state is reconstructable from the attributable ledger.

The current implementation proves deterministic, attributable, governed multi-actor orchestration.
It does **not yet** prove independently running remote clients, durable background agents, or
disconnect/reconnect continuity. Do not describe those as completed until they are literal. A
deterministic scenario remains acceptable for pitch reliability, but every visible participant
action must still be a real attributable GIK event.

## 2. Fixed interaction architecture

The next iteration uses one clear desktop composition:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Incident header · Stage · Pace · Next act countdown · Reset              │
├──────────────────────────────────────────────────────┬─────────────────────┤
│                                                      │ JOURNAL / LEDGER    │
│                 SHARED WORKSPACE                     │                     │
│                                                      │ attributable        │
│ Intent · constraints · evidence · hypothesis         │ causal history      │
│ proposal · authority · outcome                       │                     │
│                                                      │                     │
├────────────┬────────────┬────────────┬───────────────┤                     │
│ Morgan     │ Priya      │ Correlation│ Response      │                     │
│ Analyst    │ Commander  │ Agent      │ Agent         │                     │
│ actions    │ actions    │ activity   │ activity      │                     │
└────────────┴────────────┴────────────┴───────────────┴─────────────────────┘
```

### 2.1 Top control panel

The header is a compact presenter surface:

- incident identity, severity, status, and current scenario stage;
- Manual/Auto pace selector plus one mode-aware `Next act` timer button;
- visible act title, `Act n of 5`, and countdown on that button;
- reset;
- current governance state (`Open`, `Policy blocked`, `Awaiting commander`, `Executed`);
- optional shared-session health when transport-backed clients become real.

The one `Next act` button advances immediately when clicked or when its timer expires, then resets
for the following act after the current act settles. Manual pace uses a long delay (initially two
minutes) so the presenter normally clicks; Auto pace uses a short delay (initially two seconds).
The pace selector changes the duration rather than introducing a second advance button.

The header advances narrative acts, not raw domain steps. Each act still executes distinct real
actor-attributed events in a short deterministic sequence. Consequential human decisions remain
in the responsible participant panel, not in the header; the act timer pauses at those boundaries.

### 2.2 Shared workspace

The center is the visual and semantic center of gravity. It renders only shared operational state:

- investigation intent;
- active human-authored constraints;
- attributed evidence;
- current hypothesis and confidence;
- proposed response and affected target;
- inline policy, fallback, recommendation, confirmation, and execution receipts;
- final incident outcome.

Every participant action must visibly alter, annotate, or attempt to alter this workspace. It must
remain one coherent incident surface, not a collection of equally weighted dashboard cards.

### 2.3 Participant strip

The bottom strip contains exactly four participant panels:

1. **Morgan · SOC Analyst** — intent, investigation direction, review, recommendation.
2. **Priya · Incident Commander** — operational constraints and final authorization.
3. **Correlation Agent** — cross-source exploration, evidence joining, and hypothesis revision.
4. **Response Agent** — response planning, policy interaction, execution request.

Each panel uses the same participant shell: identity, actor kind, role, status, current objective or
responsibility, authority scope, latest action/result, and a short activity history. The common
shell proves one actor model; the different contents preserve the difference between human
judgment and agent work.

### 2.4 Right journal / ledger

The right pane is persistent on desktop and spans the workspace plus participant strip vertically.
It has two modes:

- **Journal (default):** readable entries answering who acted, what they did, what changed, and the
  governance result.
- **Ledger:** technical event details including actor ID/type, event/action, timestamp, revision,
  authority, changed paths or operations, policy/confirmation outcome, and correlation/causation
  identity.

Selecting an entry should highlight both the originating participant panel and the affected object
in the shared workspace. New actions should create a visible chain:

```text
participant → action → governed result → shared-state change → durable record
```

### 2.5 Responsive behavior

- The shared workspace remains primary.
- Participant panels become tabs or a horizontally scrollable strip.
- The journal becomes a right-side drawer.
- Do not stack four full participant panels and the entire ledger into one long mobile page.

## 3. Participant panel contract

Participant panels are activity and command surfaces, not four chat boxes. Chat may later become a
projection, but it is not the collaboration architecture.

### 3.1 Common participant shell

Every panel shows:

- name, role, and `HUMAN` or `AGENT` identity;
- connection/activity state (`active`, `working`, `waiting`, `blocked`, `needs approval`, `idle`);
- responsibility or current objective;
- authority in domain language;
- latest meaningful action and semantic result;
- compact chronological history;
- a transient highlight when that actor causes the current workspace or journal change.

### 3.2 Human panels: intent, judgment, and authority

Human panels contain contextual decisions rather than generic controls.

**Morgan · SOC Analyst**

- establishes incident intent;
- redirects or challenges investigation;
- accepts or amends agent-suggested explorations;
- reviews evidence;
- recommends containment;
- cannot authorize protected or consequential containment.

**Priya · Incident Commander**

- adds operational constraints;
- reviews blast radius and policy results;
- authorizes or rejects consequential action;
- may transfer or revoke authority;
- does not perform detailed evidence investigation.

Only the currently available domain action should be prominent. An incoming request from an agent
or another human appears in the responsible human's panel with its evidence and decision controls.

### 3.3 Agent panels: objective, work, and bounded capability

Agent panels show:

- assigned objective;
- current operation in readable language, with optional technical tool/capability detail;
- latest attempted contribution and result (`committed`, `rejected`, `superseded`, `awaiting
  validation`, `confirmation required`);
- capabilities and explicit boundaries in domain language;
- meaningful activity history.

The Correlation Agent may suggest an exploration rather than immediately executing one. The
suggestion must expose its question, sources, scope, method, expected value, and risk/cost so a
human can accept or amend it. When amended, the agent visibly replans against the revised shared
objective; it does not silently overwrite its previous suggestion.

Agent panels should not normally contain product action buttons. Pause/resume and technical
inspection may exist as secondary presenter or debugging affordances, visually separated from the
agent's product surface.

### 3.4 Cross-surface behavior

When a participant acts:

1. the participant panel shows the action or operation;
2. the shared workspace changes or displays the rejection;
3. the participant panel shows the semantic result;
4. the journal appends an attributable entry;
5. selecting any representation highlights the related participant, workspace object, and record.

## 4. Revised governed SOC scenario

The scenario remains one coherent incident, but now demonstrates mixed-team responsibility rather
than an analyst supervising an agent roster. The incident is a **privileged access anomaly during
an active payroll cutover**. `DC-01` is a protected domain controller supporting payroll;
`Host-A` is an administrator workstation that may be compromised. The team must identify the true
execution point and contain it without disrupting payroll.

Initial sources disagree just enough to require correlation:

- identity logs show impossible travel;
- privileged-access records show a new token issuance;
- endpoint telemetry shows a remote service created on Host-A;
- network flow makes the administrative connection appear to involve DC-01;
- asset inventory and the change calendar establish DC-01's payroll criticality and show no
  approved Host-A service change.

Use exactly two collaborative refinement loops. More would make the demo feel like a scripted
conversation rather than a legible operational proof.

### Act 1 — Human intent and constraint

Morgan establishes: **“Determine the execution origin, contain safely, preserve evidence.”** The
intent appears in shared state and Morgan's journal history.

Priya adds: **“DC-01 supports an active payroll cutover. Do not disrupt it without commander
authorization.”** The constraint appears in shared state and becomes part of subsequent authority
evaluation.

**Proof:** two distinct human actors contribute different semantic objects to one state.

### Act 2 — Suggested exploration and human reorientation

Correlation Agent examines the initial signals and suggests an exploration:

> Correlate privileged-token issuance with remote-service creation and network sessions involving
> DC-01 and Host-A.

The proposed exploration uses identity, privileged-access, endpoint, and network data over a
60-minute window, initially correlating by source IP and event time. It appears as a first-class
shared object with status `suggested`.

Morgan agrees with the direction but amends the method:

- narrow the window to 15 minutes around token issuance;
- correlate by token/session identity rather than source IP because DC-01 may broker
  authentication;
- use passive queries only;
- preserve Host-A volatile evidence before deeper inspection.

The original suggestion becomes `superseded`; the revised exploration becomes `accepted`.
Correlation Agent visibly replans and executes the amended exploration.

**Proof:** human direction and agent evidence share one event/state model; the human is an active
collaborator who can refine an agent's proposed work without taking it over.

### Act 3 — Cross-source result and governed overreach

The revised correlation first commits partial findings:

- the privileged token followed the impossible-travel sign-in;
- the network session appears to involve DC-01;
- a remote service appeared on Host-A with no corresponding approved change;
- the token/session origin is not yet resolved.

Response Agent prematurely proposes isolating DC-01 based on the apparent network source. Policy
rejects it because the evidence is incomplete, the
asset is protected by Priya's constraint, and the agent lacks the required authority. The safe
fallback increases DC-01 telemetry, restricts the compromised account, and preserves Host-A
evidence. These fallback effects visibly change shared state; the rejected proposal remains
visible.

Correlation Agent then completes Morgan's amended exploration using the fallback telemetry:

- the same token/session was replayed from Host-A;
- DC-01 brokered authentication but did not originate the remote service;
- DC-01 indicators clear after account restriction;
- Host-A continues beaconing;
- no approved change explains the Host-A service.

The shared workspace preserves the source relationships and revises the hypothesis: **Host-A is
the compromised execution point; DC-01 is a service dependency, not the containment target.**

**Proof:** governance is part of execution and can preserve useful work while refusing an action.

### Act 4 — Response suggestion and second human reorientation

Response Agent proposes: capture Host-A volatile state, restrict network access, then isolate it.
Morgan agrees with the target but amends the sequence:

> Preserve the forensic snapshot first and verify that payroll processing does not depend on
> Host-A before isolation.

Response Agent replans against asset inventory, payroll dependencies, active sessions, the change
calendar, and containment policy. It returns a bounded plan: Host-A is non-critical, has no active
payroll sessions, can be isolated reversibly, and has evidence preservation ready.

Morgan recommends the revised plan but cannot authorize execution. The normal path shows
`Commander authority required`; an optional technical proof may attempt Morgan authorization and
record its rejection without making that contrived failure part of the main pitch journey.

**Proof:** governance constrains humans and agents; participation does not imply authority.

### Act 5 — Correct authority and execution

Priya receives the evidence-backed request in her panel and authorizes Host-A isolation. Execution
occurs as a separate attributable event. The shared workspace changes to `Contained`, all panels
receive the outcome, and the journal records recommendation, authorization, and execution as
distinct causal steps.

**Proof:** mixed-team work converges on one governed decision with complete provenance.

## 5. GIK model and state shape

Every human and agent is an actor using the same transport-neutral emit contract. No actor receives
a privileged mutation path. Provenance travels as `actorId` on the event and through effect,
outcome, state, and trace.

Target shared-state shape:

- `incident`: identity, severity, status, stage, current governance state;
- `actors[]`: ID, kind (`human | agent`), role, status, responsibility/objective, authority;
- `intent`: human-authored objective and owner;
- `constraints[]`: author, rule, affected entities, active status;
- `dataSources[]`: source identity, freshness, scope, and contribution status;
- `explorations[]`: suggester, question, sources, scope, method, expected value, risk/cost, human
  amendment, status (`suggested | accepted | superseded | running | completed`), and findings;
- `evidence[]`: source actor, kind, summary, confidence, linked entities, timestamp;
- `correlations[]`: linked evidence/source identities, relationship, strength, and supported or
  weakened hypothesis;
- `entities[]`: host/account/service identity, risk state, protected classification;
- `hypothesis`: statement, confidence, supporting evidence;
- `proposal`: author, action, target, evidence, blast radius, authority result, reason/fallback;
- `recommendation`: recommending human and rationale;
- `authorization`: requested role, approving/rejecting human, result;
- `journal[]`: readable attributable causal entries;
- `trace[]`: technical event/effect/outcome/state-operation record.

The participant panels, shared workspace, journal, and technical ledger are projections of this one
state and causal history. Never maintain parallel human, agent, or presenter fixtures.

## 6. Implementation principles

1. **Real events, deterministic scenario.** Reliability may be scripted, but each visible actor
   action must dispatch a real attributable GIK event through authority, reducer, effects, and
   trace.
2. **Same participation path, different authority.** Humans and agents share the event model; role
   and policy determine allowed consequences.
3. **One state, several projections.** Participant panels, workspace, journal, and ledger must not
   carry independent copies of domain truth.
4. **Domain language first.** Show “Can recommend containment,” not internal verbs such as
   `invoke` or `confirm`; keep technical detail in Ledger mode.
5. **Governance attached to work.** Rejection, fallback, recommendation, confirmation, and
   execution receipts appear beside the affected proposal as well as in the ledger.
6. **Presenter controls are outside the domain.** Manual/Auto/Reset advance the reliable demo but
  do not impersonate Morgan, Priya, Correlation, or Response.
7. **Acts for presentation, steps for causality.** The visible presenter control advances one
  narrative act. Each act unfolds as a deterministic sequence of distinct actor-attributed steps,
  preserving the cause, authority decision, state change, and journal entry for each contribution.
8. **Honor host theming and shared primitives.** Use semantic host variables and existing `@gik/*`
   surfaces. Do not make agents visually futuristic or more important than humans.
9. **Preserve revision history.** Suggestions and plans become `superseded`, never silently
  overwritten. Suggestion, amendment, replanning, findings, recommendation, authorization, and
  execution remain distinct causal events.
10. **Bound the collaboration choreography.** Use exactly two visible refinement loops: one for
   investigation and one for response planning.
11. **Shared implementation, sequenced proof.** Beat 2 first demonstrates the running governed SOC
  workspace; Beat 3 later reveals the blueprint, tiers, lowering recipes, and projections behind
  it. Beat 3 concerns are a non-goal for declaring the Beat 2 demonstration ready, not an
  anti-goal while implementing it. Build shared artifacts once and preserve the natural
  compiler-to-runtime path where practical, but do not block the runtime proof on broad compiler
  generalization or authoring-plane completeness that the live demonstration does not require.

## 7. Gap from implemented baseline

The current `live-workspace-soc` baseline already provides:

- one shared incident state;
- attributable actor IDs through kernel events/effects/outcomes;
- real `invoke`, `route`, and `confirm` paths;
- rejection plus fallback, confirmation required, and executed outcomes;
- presenter-controlled progression and reusable countdown mechanics;
- a working forensic ledger and agent-oriented inspection;
- responsive host integration.

The next iteration must change or add:

- replace four-agent roster emphasis with two humans plus two agents;
- make Morgan and Priya first-class stateful actors with distinct authority;
- replace Identity Agent with a cross-source Correlation Agent;
- move domain actions into the responsible participant panels;
- add human-authored intent and operational constraints to shared state;
- add first-class exploration suggestions, amendments, replanning, and supersession;
- model data sources and evidence correlations explicitly in shared state;
- add the second response-plan refinement loop and blast-radius recalculation;
- split recommendation, authorization, and execution into distinct events;
- expose Morgan's recommendation-only boundary and optionally demonstrate an unauthorized human
  action being rejected in the technical proof path;
- replace the expandable ledger with a persistent right Journal/Ledger pane;
- cross-highlight participant, workspace object, and ledger entry;
- reshape the center into one coherent shared workspace;
- replace separate Manual-next and Auto-next actions with one mode-aware `ui:timer-button` that
  advances the next act on click or expiry and resets after either path;
- update scenario events, state, effects, narration, and tests accordingly.

Independent transport clients and disconnect/reconnect continuity are a later proof layer unless
explicitly pulled into this iteration. Do not imply that the deterministic in-process scenario has
already proven them.

## 8. Terminology-grounded implementation plan

T3 is not implemented as a custom React screen with a collection of scripted handlers. It is a
SOC semantic blueprint that compiles intent and participant context through explicit tiers into
the `live-workspace-soc` runnable bundle. The architecture is:

This is the preferred shared implementation path for Beats 2 and 3, not an additional proof the
Beat 2 presentation must expose or complete before it can be shown. Use it wherever the existing
authoring stack supports the SOC experience naturally. If a missing authoring-plane capability
would require broad platform work unrelated to the visible runtime proof, finish the runnable
bundle without introducing a contradictory architecture and carry that capability into Beat 3.

```text
SOC intent
  → semantic blueprint
    ├─ blueprint-template resources
    ├─ workflow tier
    ├─ workflow-to-interaction lowering recipe
    ├─ interaction tier
    ├─ interaction-to-presentation lowering recipe
    ├─ presentation tier
    └─ presentation-to-runtime lowering recipe
  → runnable bundle
    ├─ manifest.json
    ├─ document.json
    ├─ state.json
    ├─ effect_handlers/      narrow native runtime seam
    └─ projection_views/     narrow native rendering seam
  → kernel runtime
```

The governing relationship is:

> **A semantic blueprint compiles an intent into a bundle by lowering it tier-by-tier.**
>
> `blueprint : bundle :: source : binary`

### 8.1 Canonical terminology applied to T3

| Term | T3 meaning |
|---|---|
| **Intent** | Build a governed mixed-team investigation that identifies the true compromise source without disrupting payroll. |
| **Semantic blueprint** | Authored definition of the SOC interaction: tiers, lowering recipes, taxonomy, authority policy, context vocabulary, resources, and checks. |
| **Tier** | A representation of the SOC experience at one stage of compilation. |
| **Lowering recipe** | Data artifact that deterministically transforms one tier into the next. |
| **Blueprint template** | Explicitly referenced reusable schemas, taxonomy, checks, and inspector vocabulary shared by compatible blueprints. |
| **Bundle** | Runnable compiled incident room mounted by the generic host. |
| **Manifest** | Closed capability/action vocabulary, namespaces, and declared native dependencies. |
| **Document** | Runtime interaction tree, state reads, and event/action wiring. |
| **State** | Initial shared incident substrate from which every view is projected. |
| **Effect handlers** | Narrow native seams for external work and governed runtime outcomes. |
| **Projection views** | Narrow native seams for specialized SOC rendering capabilities. |
| **Floor primitives** | Generic reusable `ui:*` controls used wherever specialized SOC rendering is unnecessary. |

`effect_handlers` and `projection_views` are not tiers, lowering recipes, or alternate application
roots. They are declared native externals attached to the compiled JSON bundle.

### 8.2 Current repository naming bridge

Canonical product prose uses **blueprint**, **blueprint template**, and **tier**, while parts of the
current authoring implementation still use legacy names. Until that migration is deliberately
performed, use this mapping:

| Canonical concept | Current repository name |
|---|---|
| semantic blueprint | `profile.json` / profile envelope |
| blueprint sample | `samples/profiles/*` |
| blueprint template | `profile-templates/*` and `profile-template` reference |
| tiers | `layers` |
| blueprint schema | `schemas/profile.schema.json` |
| lowering recipe | `schemas/lowering-recipe.schema.json` and recipe JSON files |

Documentation and product UI should use the canonical terms. Implementation should continue to
satisfy the current schemas and folder conventions. Do not mix a broad profile-to-blueprint source
rename into the T3 implementation.

### 8.3 SOC intent and semantic blueprint

The authored intent is:

> Determine the execution origin, contain it safely, preserve evidence, and do not disrupt the
> protected payroll cutover without the incident commander's authorization.

The semantic blueprint owns:

- the workflow, interaction, presentation, and runtime-document tiers;
- references to every lowering recipe connecting adjacent tiers;
- actor, role, authority, evidence, exploration, proposal, and journal vocabulary;
- shared schemas and taxonomy referenced from a blueprint template;
- blueprint-local incident resources and presentation-context descriptors;
- authoring checks for authority, provenance, projection completeness, and valid lowering;
- metadata identifying the T3 pitch beat and the `live-workspace-soc` bundle target.

Use the existing generic GenUI blueprint template plus explicit blueprint-local SOC resources at
first. Promote SOC resources into a reusable template only when there is a second consumer or a
clear reusable contract. Template resources are referenced explicitly; there is no implicit
structural merge between template and blueprint.

### 8.4 Executable tier model

Use four executable tiers initially:

```text
Workflow
  ↓ workflow-to-interaction
Interaction
  ↓ interaction-to-presentation
Presentation
  ↓ presentation-to-runtime
Runtime document
```

The intent drives the Workflow tier. Do not add another tier merely to restate the same concepts.

#### Workflow tier

The Workflow tier describes the domain progression independently of UI:

- incident objective and protected operational constraint;
- Morgan, Priya, Correlation Agent, and Response Agent as participants;
- investigation and containment stages;
- exploration suggestion, human amendment, supersession, replanning, and findings;
- policy-blocked response proposal and safe fallback;
- revised response planning and blast-radius calculation;
- recommendation, authorization, and execution as distinct steps;
- five narrative acts containing explicit attributable domain steps.

Acts are presenter-facing narrative groupings. Steps are the actual actor-attributed transitions.
The visible presenter control advances one act. The act orchestrator then dispatches its steps in
order as separate real events with short, legible transitions; it must not collapse the act into
one batch state mutation. Step-level controls may exist for tests or developer inspection but are
not part of the pitch UI.

The fifth act advances only as far as `Awaiting commander`. Its timer then pauses and Priya's panel
owns the visible authorization action. Authorization and execution remain separate attributable
runtime events even if execution follows authorization without another presenter click.

#### Interaction tier

The Interaction tier expresses participant semantics without deciding final layout:

- `establish-intent`;
- `add-constraint`;
- `suggest-exploration`;
- `amend-exploration`;
- `replan`;
- `contribute-evidence`;
- `propose-response`;
- `reject-with-fallback`;
- `revise-response`;
- `recommend`;
- `authorize`;
- `execute`;
- `inspect-journal`;
- `change-presentation-context`.

It also defines semantic regions: presenter controls, shared substrate, participant strip,
Journal/Ledger, and contextual proposal or decision surfaces. Actor identity, authority
requirements, causation identity, affected objects, and expected semantic outcomes travel with
the interaction definitions.

#### Presentation tier

The Presentation tier determines arrangement, disclosure, emphasis, and presentation context. It
defines these initial contexts:

1. **Full substrate** — complete operational and causal state for technical inspection.
2. **War room** — shared incident command view emphasizing status, hypothesis, proposal, and
  authority.
3. **Priya mobile** — commander decisions, operational constraint, blast radius, and authorization.
4. **Priya laptop** — expanded command view with evidence summary and journal context.
5. **Morgan pager** — urgent findings, pending recommendation, and compact incident status.
6. **Morgan workstation** — investigation intent, exploration, evidence, and hypothesis detail.
7. **Correlation Agent** — assigned objective, source graph, exploration plan, and contribution
  status.
8. **Response Agent** — proposal, policy outcome, fallback, dependency analysis, and execution
  status.

Each context is a projection descriptor over one substrate:

```text
actor + role + device + task + disclosure + layout
```

The selector changes presentation context without mutating domain state or creating journal
entries. Do not create eight state fixtures or eight independently authored screens.

#### Runtime-document tier

The terminal tier emits the runtime document consumed by the kernel:

- capability nodes and their composition;
- state `read` bindings;
- event `on` edges and declarative actions;
- context-selector wiring;
- participant-originated domain actions;
- `invoke`, `route`, and `confirm` wiring where required;
- references to declared effect handlers and projection capabilities.

### 8.5 Lowering recipes

Author one explicit lowering recipe between every adjacent tier:

1. **`soc.workflow-to-interaction`** selects interaction semantics for each workflow stage and
  preserves actor, authority, provenance, and causal-step identity.
2. **`soc.interaction-to-presentation`** maps semantic regions and actions to layout, disclosure,
  emphasis, device, and participant context descriptors.
3. **`soc.presentation-to-runtime`** emits floor and SOC capability nodes, bindings, props, and
  event wiring in the terminal runtime vocabulary.

Recipes remain data-driven. The recipe programs should be independently validatable and should
not hide incident progression in an opaque TypeScript compiler step. Add contract fixtures that
lower representative inputs for all eight presentation contexts and every consequential action.

### 8.6 Compiled runnable bundle

The output remains the host-discoverable bundle:

```text
samples/bundles/live-workspace-soc/
├─ manifest.json
├─ document.json
├─ state.json
├─ effect_handlers/
│  └─ index.ts
└─ projection_views/
  └─ index.tsx
```

The generic host discovers these parts by bundle-folder convention. T3 must remain a JSON bundle,
not become a `native-root` application.

#### Manifest responsibilities

The manifest declares:

- the `soc` namespace;
- required floor capabilities and actions;
- specialized capabilities such as `soc:incident-room`, `soc:presenter-header`,
  `soc:context-workspace`, `soc:participant-panel`, and `soc:journal-ledger`;
- emitted domain events;
- the floor projection provider import;
- every required native effect-handler name;
- the bundle's specialized projection-view provider.

Every declared effect-handler external must be supplied at mount. Keep this contract narrow and
lintable.

#### Document responsibilities

The lowered document composes:

```text
incident-room
├─ presenter-header
├─ context-workspace
├─ participant-strip
│  ├─ Morgan
│  ├─ Priya
│  ├─ Correlation Agent
│  └─ Response Agent
└─ journal-ledger
```

It owns `read` bindings into the `soc` namespace, participant event origins and actor identity,
act orchestration, presentation-context selection, and `invoke`/`route`/`confirm` wiring. The
presenter event requests the next act; the orchestrator preserves the separate actor-attributed
steps within it. Consequential decisions originate from participant surfaces.

#### State responsibilities

`state.json` seeds one shared incident substrate containing:

- incident, stage, act, current step, and governance status;
- actors, roles, responsibilities, status, and authority;
- intent and constraints;
- data sources, explorations, revisions, and findings;
- evidence, correlations, entities, and hypothesis;
- response proposals, policy results, fallback, and blast-radius analysis;
- recommendation, authorization, execution, and outcome;
- readable journal and technical trace;
- available presentation descriptors and selected context.

Never introduce `priyaMobileState`, `warRoomState`, agent-local truth, or presenter-owned copies of
domain state. Every surface projects the same revisioned substrate.

### 8.7 Native effect-handler seam

Effect handlers perform only work that cannot be expressed through the closed declarative action
grammar or that represents an external/runtime operation:

- execute cross-source correlation;
- evaluate policy and apply a safe fallback;
- recalculate dependency and blast radius;
- execute containment;
- reset the deterministic scenario when reset cannot remain declarative.

Handlers return attributable semantic outcomes and state operations. Human intent, constraints,
amendments, recommendations, authorization decisions, and context selection remain declarative
events where practical. Do not implement one batch handler that advances a whole act and writes
several participants' contributions at once.

### 8.8 Native projection-view seam

Projection views render only the specialized SOC semantics not adequately represented by floor
primitives:

- incident-room composition;
- shared-substrate interpreter;
- common participant shell with human and agent variants;
- Journal/Ledger and causal highlighting;
- contextual presentation interpreter.

The context workspace is one interpreter receiving:

```text
shared substrate + selected projection descriptor
```

It filters, aggregates, prioritizes, or redacts content according to the descriptor. It is not
eight unrelated React components. Use floor primitives for buttons, tabs, badges, fields, timer
controls, and ordinary layout wherever possible.

Use one floor `ui:timer-button` for `Next act`. Its contract for T3 is:

- emit `press` immediately with `reason: "manual"` when clicked;
- emit `press` with `reason: "timeout"` when the configured duration expires;
- restart the countdown after either path and whenever the act identity or pace changes;
- use a long Manual duration (initially `120000` ms) and short Auto duration (initially `2000` ms);
- disable or disarm while an act sequence is running, after completion, and at a human decision
  boundary so click and timeout cannot dispatch the same act twice.

The existing primitive already implements manual press, timeout press, and countdown restart. T3
must bind its duration and reset identity to presenter state and add focused behavioral coverage
for manual advance, timeout advance, restart, mode change, and duplicate suppression.

### 8.9 Phased delivery

1. **Pin the blueprint contracts.** Define tier schemas, roles and authority, acts and steps,
  event names, semantic outcomes, projection descriptors, and exact state transitions.
2. **Author lowering recipes.** Add the three adjacent-tier recipes and representative contract
  fixtures, including all presentation contexts.
3. **Compile a static bundle.** Generate and validate manifest, document, and seed state; verify
  that the generic host mounts it before adding native behavior.
4. **Build projection views.** Implement the fixed shell, shared-substrate interpreter, four
  participant panels, context selector/interpreter, and persistent Journal/Ledger.
5. **Implement mixed-human steps.** Morgan establishes intent; Priya adds the payroll constraint;
  each action updates shared state and the journal through the same event model.
6. **Implement the exploration loop.** Correlation suggests; Morgan amends; the original becomes
  superseded; Correlation replans and commits incremental findings.
7. **Implement the governance loop.** Response proposes DC-01 isolation; policy rejects it;
  fallback changes shared state; improved telemetry resolves Host-A as the execution point.
8. **Implement the response loop.** Response suggests containment; Morgan revises its sequence;
  Response recalculates; Morgan recommends; Priya authorizes; execution occurs separately.
9. **Complete presentation contexts.** Verify all eight contexts read the same substrate revision
  and that switching context neither mutates domain state nor appends a journal entry.
10. **Complete presenter behavior.** Use one mode-aware `Next act` timer button. Click or timeout
  advances one narrative act, whose distinct attributable steps unfold in order. Reset the timer
  after the act settles, prevent duplicate dispatch while it runs, and pause at Priya's human
  authorization boundary.
11. **Add causal interaction.** Cross-highlight the originating participant, affected workspace
   object, and Journal/Ledger entry.
12. **Polish and validate.** Complete responsive participant tabs/strip, journal drawer, desktop
   proportions, scenario legibility, tests, builds, and desktop/mobile browser journeys.

### 8.10 Validation gates

Each phase ends with the narrowest executable check for the changed slice. Before completion,
validate all of the following:

- the blueprint satisfies the current profile schema and references explicit resources;
- every adjacent tier has exactly one selected lowering recipe;
- every recipe program validates and produces the expected next-tier contract;
- presentation-to-runtime output uses only declared terminal capabilities and actions;
- generated manifest, document, and state form a valid serializable bundle;
- every declared effect handler is supplied and no undeclared native dependency is required;
- all presentation contexts preserve required interaction facets and one substrate identity;
- actor, causation, authority, result, and changed paths remain attributable through the ledger;
- focused tests pass after each slice;
- `npm run test:react`, `npm run test:samples`, and `npm run build:host` pass as applicable;
- Playwright validates the full scenario at desktop and mobile viewports.

The Beat 2 demonstration is ready when the runnable bundle makes one governed shared substrate
credible across its human, agent, device, and operational projections without duplicating domain
truth. The same implementation should feed Beat 3's blueprint and lowering proof wherever
practical, but Beat 3 authoring completeness does not gate the Beat 2 presentation.

### 8.11 Implemented Beat 3 architecture (2026-07-15)

The broader architecture now runs through the repository's canonical `@gik/profile` mechanism:

- `samples/profiles/live-workspace-soc/profile.json` is the SOC semantic blueprint and owns the
  intent, actor/authority vocabulary, five acts, taxonomy, and eight presentation descriptors;
- three adjacent data recipes lower `workflow → interaction → presentation → runtime-doc` using
  the standard `select-interaction`, `plan-presentation`, and `lower-document` executors;
- the terminal war-room output is structurally identical to the checked-in
  `samples/bundles/live-workspace-soc/document.json` runtime document;
- all eight contexts execute the same tier chain over one source and one terminal capability
  contract; context selection remains projection metadata and does not append to the Journal;
- the runtime console now has `Runtime` and `Blueprint` planes. The Blueprint plane renders the
  actual `traceProfile` outputs, recipe IDs/executors, authored contexts, and blueprint-owned
  resources rather than maintaining explanatory shadow data;
- both planes and all eight presentation contexts are URL-addressable through `plane` and
  `context` query parameters; invalid values fall back safely, and selection remains projection
  state rather than incident state or journal activity;
- profile loading, recipe lint, all-context lowering, runtime-document equivalence, bundle
  behavior, React floor contracts, host typecheck, and production build are covered by executable
  validation.

The implementation does not claim remote multi-client continuity or independently durable agents.
Those remain later transport/runtime proof layers rather than hidden assumptions in Beat 3.

## 9. Acceptance criteria for the revised interaction

- [ ] The desktop first viewport clearly contains one header, one dominant shared workspace, four
  participant panels, and one persistent right Journal/Ledger pane.
- [ ] Morgan, Priya, Correlation Agent, and Response Agent are simultaneously visible and structurally
  recognizable as actors in one participant model.
- [ ] Human panels emphasize responsibility, contextual judgment, and authority; agent panels
  emphasize objective, current operation, contribution, capability, and boundary.
- [ ] Morgan authors intent and Priya authors an operational constraint as separate attributable
  events that update the same shared state.
- [ ] Correlation Agent suggests an exploration across identity, privileged-access, endpoint, and
  network data as a first-class shared object.
- [ ] Morgan accepts the direction while amending time window, correlation key, and safety scope;
  the original suggestion remains visible as superseded.
- [ ] Correlation Agent visibly replans, executes the amended exploration, commits incremental
  findings, and updates source relationships and the shared hypothesis.
- [ ] Response Agent's DC-01 proposal is rejected using Priya's active constraint, with a visible
  reason and fallback effects that visibly change shared state.
- [ ] Response Agent suggests Host-A containment; Morgan revises the operation sequence; Response
  recalculates payroll dependency, blast radius, reversibility, and evidence readiness.
- [ ] Morgan can recommend Host-A containment but cannot authorize it; optional technical proof can
  record an attempted authorization as rejected.
- [ ] Priya alone can authorize the pending consequential action.
- [ ] Suggestion, amendment, replanning, findings, response revision, recommendation,
  authorization, and execution are separate attributable ledger entries.
- [ ] Every scenario action visibly links participant, shared-state effect or rejection, and
  journal/ledger record.
- [ ] One `Next act` timer button serves both paces: click advances immediately, timeout advances
  at the configured duration, and either path resets the timer for the following act.
- [ ] Advancing an act produces separate actor-attributed step events and journal entries rather
  than one batch mutation; duplicate click/timeout dispatch is prevented while the act runs.
- [ ] Manual pace uses the long presenter delay, Auto pace uses the short delay, and the timer
  pauses at Priya's human authorization boundary.
- [ ] Mobile preserves the shared workspace, exposes participants as tabs/strip, and opens the
  journal as a drawer without horizontal page overflow.
- [ ] The old `workbench` remains untouched and independently routable.
- [ ] Focused tests, React tests, sample tests, host build, and Playwright desktop/mobile journey
  pass.

## 10. Deferred proof and cleanup

After the revised in-process interaction is convincing, decide whether the next proof must add:

- two separate human browser clients;
- independently running agent clients;
- server-backed shared session and live transport synchronization;
- disconnect/reconnect and replay continuity;
- durable autonomous work while no human client is connected.

Only claim these once they are literal. Separately, after Beats 1–4 are complete, assess whether
`workbench` should remain a developer sample, move out of the pitch catalog, be deprecated, or be
removed. T3 does not pre-commit to that cleanup.