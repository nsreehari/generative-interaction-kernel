# T3 — Live Workspace : SOC — working notes

> Scope: **Beat 2** of the 4-Beat pitch IA (see `working-doc.md` D3). Build the runtime-plane hero:
> a mixed human-agent incident room where distinct participants act through one governed event
> model, change one shared operational state, and leave one attributable causal record.
>
> Status: **INTERACTION PLAN REVISION (2026-07-15).** The first `live-workspace-soc` implementation
> remains a working baseline. The next iteration replaces its analyst-plus-agent-roster framing with
> the mixed-team composition and scenario defined here. The existing `workbench` remains unchanged
> and independently routable.

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
│ Incident header · Stage · Manual/Auto · Countdown · Reset                 │
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
- Manual next / Auto next with visible countdown;
- reset;
- current governance state (`Open`, `Policy blocked`, `Awaiting commander`, `Executed`);
- optional shared-session health when transport-backed clients become real.

It advances the demonstration. Domain actions must originate in the relevant participant panel,
not in the header.

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
   do not impersonate Morgan, Priya, Identity, or Response.
7. **Step-through first, autoplay second.** Cause, authority decision, and state change must remain
   legible at every step.
8. **Honor host theming and shared primitives.** Use semantic host variables and existing `@gik/*`
   surfaces. Do not make agents visually futuristic or more important than humans.
9. **Preserve revision history.** Suggestions and plans become `superseded`, never silently
  overwritten. Suggestion, amendment, replanning, findings, recommendation, authorization, and
  execution remain distinct causal events.
10. **Bound the collaboration choreography.** Use exactly two visible refinement loops: one for
   investigation and one for response planning.

## 7. Gap from implemented baseline

The current `live-workspace-soc` baseline already provides:

- one shared incident state;
- attributable actor IDs through kernel events/effects/outcomes;
- real `invoke`, `route`, and `confirm` paths;
- rejection plus fallback, confirmation required, and executed outcomes;
- presenter-controlled Manual/Auto progression with countdown;
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
- update scenario events, state, effects, narration, and tests accordingly.

Independent transport clients and disconnect/reconnect continuity are a later proof layer unless
explicitly pulled into this iteration. Do not imply that the deterministic in-process scenario has
already proven them.

## 8. Delivery plan

- **Phase 0 — Pin contracts:** define actor roles/authority, revised state shape, event names,
  semantic outcomes, and the exact five-act state transitions.
- **Phase 1 — Static composition:** implement header, shared workspace, four participant panels,
  and persistent Journal/Ledger pane from seeded state.
- **Phase 2 — Mixed-human events:** Morgan authors intent; Priya authors the protected-asset
  constraint; both appear in shared state and journal.
- **Phase 3 — Exploration loop:** Correlation Agent suggests a cross-source exploration; Morgan
  amends it; the original is superseded; the agent replans and executes the revision.
- **Phase 4 — Correlation and governance:** commit incremental source findings, update the shared
  hypothesis, reject Response's DC-01 proposal, and visibly apply safe fallback effects.
- **Phase 5 — Response loop and correct authority:** Response suggests containment; Morgan revises
  sequencing; Response recalculates blast radius; then separate recommendation, Priya
  authorization, and execution.
- **Phase 6 — Causal interaction:** link/highlight participant actions, affected workspace objects,
  and journal/ledger entries.
- **Phase 7 — Presenter and responsive polish:** retain Manual/Auto/Reset, validate countdown,
  desktop proportions, participant tabs/strip, journal drawer, and full scenario legibility.

Each phase ends green on focused tests, `npm run test:react`, `npm run test:samples`, and
`npm run build:host` as applicable.

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
- [ ] Manual next advances exactly one domain action; Auto next shows countdown and stops at the
  correct human decision boundary.
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