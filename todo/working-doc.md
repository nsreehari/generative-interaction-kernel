Updated todo list

# Detour 4 — Declarative SOC projection composition (AGREED 2026-07-17)

## Governing boundary

**The document owns composition; the projector owns materialization.**

The current `soc:runtime-projection` document node composes two coarse context views while
`OperationalView.tsx` and `AgentEnvelope.tsx` recover presentation decisions during React
rendering. Detour 4 replaces those monoliths with document-composed semantic leaves. A leaf
reads only the shared state and lowered presentation facet it materializes, emits only its own
events, and never selects contexts, discovers siblings, calculates semantic order, or invokes
the Blueprint compiler.

Target runtime composition:

```
soc:runtime-projection
  soc:substrate-chrome [materializes summary/orientation and owns native scrolling]
    soc:presentation-layout
      soc:region-surface [brief]
        soc:intent-region
      soc:region-surface [brief]
        soc:constraints-region
      soc:region-surface [finding]
        soc:hypothesis-region
      soc:region-surface [collection]
        soc:exploration-region
      soc:region-surface [collection]
        soc:evidence-region
      soc:region-surface [agent-request]
        soc:agent-request-region
      soc:region-surface [decision]
        soc:response-region
      soc:region-surface [decision]
        soc:authorization-region
      soc:region-surface [audit]
        soc:causal-record-region
```

`RuntimeProjection` remains the presentation-frame boundary. `SubstrateChrome` materializes the
Interaction-owned summary and owns the native scroll viewport around `PresentationLayout`.
`PresentationLayout` materializes the lowered arrangement, while each `RegionSurface` materializes
archetype, priority, and disclosure around one body-only semantic leaf. The runtime document owns
the complete leaf set, visibility gates, state reads, event bindings, and stable node identities.

## Presentation contract

Interaction lowering owns the stable semantic parts and their meaning: identity, role,
semantic concern, data dependencies, participants, actions, authority, and causal targets.
Presentation lowering projects those parts for a context; it does not invent their domain
meaning. It owns selection, `rank`, `priority`, `disclosure`, presentation `group`, frame,
arrangement, and materializer variant. Runtime lowering owns concrete capabilities, gates,
reads, events, children, and stable identities.

Presentation lowering computes `rank`, `priority`, `disclosure`, `group`, `presentation`, and
`materialize`. Runtime state preserves one addressable facet for every region so document gates
and surfaces consume those lowered decisions directly; the migration-only ordered `regions` list
has been removed.

Each runtime facet owns:

- `visible`: document composition gate derived from disclosure/materialization
- `rank`: semantic and accessible reading order
- `priority`: critical / primary / supporting emphasis
- `disclosure`: normalized leaf density (status / summary / detail / omitted)
- `concern`: stable Interaction-owned semantic concern
- `group`: context-specific Presentation grouping, including agent
  envelope groups where the selected arrangement requires them
- `presentation`: leaf materializer variant selected by lowering

Frame and arrangement remain derived from the selected presentation context. Context switching
must recompute the complete presentation contract without changing operational or causal state.

## Visual grammar

All contexts project the same substrate through a stable operational narrative:

1. **Orientation** — incident posture, current hypothesis, confidence, latest meaningful change.
2. **Guardrails** — human intent, protected constraints, and authority boundaries.
3. **Investigation** — exploration history and evidence.
4. **Response** — proposed action, target, blast radius, reversibility, and readiness.
5. **Decision** — authorization state and consequential action.
6. **Provenance** — relevant causal record.

Arrangements weight that grammar rather than inventing unrelated screens:

- `war-room`: hypothesis and response dominate; constraint and authorization form a decision rail.
- `inspection`: complete grouped substrate with provenance.
- `decision`: commander decision object first, response second, rationale below.
- `command`: response and authorization primary, evidence and constraints supporting.
- `glanceable`: posture, hypothesis, and response status only.
- `investigation`: exploration and evidence dominate while the tested hypothesis remains visible.
- agent arrangements: context → shared state → request → contribution → governed result.

## Lowering responsibilities

The workflow-to-interaction lowering recipe owns the stable semantic parts. The
interaction-to-presentation lowering recipe owns frame, arrangement, visibility, rank,
priority, presentation grouping, disclosure, and presentation variant. The presentation-to-runtime lowering
recipe emits the static complete leaf tree with document gates and reads bound to addressable
facets. React translates those lowered semantics into layout, density, emphasis, and controls;
it does not reconstruct them from `selectedContext`.

## Implementation sequence

1. [x] Preserve lowered per-region facets in runtime presentation state and context switching.
2. [x] Normalize human-region groups and per-region disclosure in presentation lowering.
3. [x] Add `soc:presentation-layout` and the human semantic leaf capabilities.
4. [x] Compose human leaves, gates, reads, events, and identities in presentation-to-runtime lowering.
5. [x] Establish and visually validate war-room, decision, and investigation arrangements.
6. [x] Add inspection, command, glanceable, and agent arrangements.
7. [x] Delete `OperationalView` and `AgentEnvelope`, including render-time Blueprint tracing.
8. [x] Validate all nine contexts behaviorally and at desktop/mobile widths, with representative screenshots.
9. [x] Standardize semantic leaves through lowered `soc:region-surface` wrappers.
10. [x] Assign and materialize `brief`, `finding`, `collection`, `decision`, `audit`, and `agent-request` archetypes.
11. [x] Consolidate summary and native viewport ownership in `SubstrateChrome` and remove the duplicate runtime `regions` list.

Completion follow-up (2026-07-18): the reusable control harness now consumes only the neutral
`control.inspection` contract; the SOC organism owns participant, presentation, Blueprint,
timeline, and status adaptation. Opt-in, null-safe initial reactions synchronize host-seeded
presentation and request mailboxes without changing default standing-reaction behavior. The
ninth `investigation-board` context has dedicated desktop/mobile parity coverage, including
responsive stage flow and narrow-viewport space for the fixed harness context strip.

Scope rule: preserve exact SOC operational behavior, attribution, authority, demo sequencing,
and causal focus while changing projection composition.

Let me gather the missing context: the samples-overview bundle, the workbench bundle, the apps/browser-host bundle structure, and the GIK public docs.

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles)

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/docs)

Searched for files matching `**/GIK-*.md`, 15 matches

Let me read the core essence doc, the public docs, and the samples-overview + workbench bundles.    

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/docs/hidden)

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles/samples-overview)

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles/workbench)

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/docs/hidden/GIK-Core-Essence.md)

Now let me read the samples-overview and workbench documents to see the stale claims, plus the registry.      

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles/samples-overview/document.json)

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles/registry.json)

The overview content lives in the `demo:samplesOverview` projection view. Let me read it and the workbench doc/projection to see the stale claims.      

Searched for files matching `**/samples-overview/projection_views/**`, 1 match

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles/workbench/document.json#1-1), lines 1 to 120

Let me read the samples-overview projection view to see the actual customer-facing claims, and the rest of workbench to understand its function.    

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles/samples-overview/projection_views/index.tsx#1-1), lines 1 to 250

I've now read the GIK Core Essence, the customer-facing overview script, the registry, and the workbench doc. That changes the picture substantially — the platform's real thesis is far bigger than "a GenUI console," and the current samples-overview undersells it while workbench genuinely overlaps Console's Preview. Here's the evolved architecture.

## First: the two words the whole pitch hinges on

The essence doc actually gives us crisp, exec-safe definitions. Right now neither the console nor the overview states them plainly. Pin these:

- **Bundle = the runnable thing.** It's the message contract at rest: a manifest (the capability vocabulary), a document (the tree of nodes + machines), seed state, and an `externals` contract (the effect handlers + projection views the host must supply). It's what you *mount and run*, and bundles compose (one can `embed` another). *Exec line: "A bundle is a packaged, runnable interaction surface — the app you press play on."*
- **Profile = the blueprint that produces a document.** It's an authoring-plane artifact: **N layers + N−1 lowering recipes** that describe how a goal lowers, stage by stage, into the kernel's runtime-document language. *Exec line: "A profile is the recipe that turns a goal into a UI — the thinking; the bundle is the finished thing you run."*

That single distinction — **profile = recipe, bundle = runnable package** — needs to be visible and demonstrated, not buried. It's the vocabulary every other screen leans on.

## The real thesis the samples must prove

The essence isn't "declarative GenUI." It's: **one medium-blind kernel runs the same closed grammar for UI, API, workflow, and backend; AI only ever proposes, the kernel decides; determinism is the correctness proof.** The samples today are scattered demos that don't ladder up to that. The IA's job is to make each screen prove one pillar:

| Essence pillar | Which screen should prove it |
|---|---|
| Stable semantics, adaptive projection (#9) | **Console Preview** — same goal, many surfaces |
| AI proposes / validate-or-fallback (#7) | Provider-authoring demo + a visible validation badge |
| Dataflow graph *is* interaction graph (#5) | Reactive demo |
| Same state for human + agent (#4), dual-loop (#10), forensics (#11) | A **live-session / trace** surface (today: missing — workbench's real opportunity) |
| Medium-blind: same kernel behind a transport (#1) | The outward hosts (agent/control/backend) — represented, not hidden |

## Evolved information architecture

I'm evolving last turn's model (3-altitude Console, 2→3→4 profile curriculum, surface small-multiples, genui/genui1 dedupe) with the essence and the bundle/host findings.

**Tier 0 — The Front Door (samples-overview, rewritten as the pitch, not a catalog).**
Today it's a stale "here are five sample bundles" list. Reframe it as the **live pitch narrative**:
1. The problem (probabilistic agentic UI = unsafe/unauditable; every medium re-wires the same logic).
2. The wedge, in one sentence, with the **profile vs bundle** micro-demo inline (goal → recipe → runnable surface).
3. One primary CTA: **Open the Console** (the hero). Everything else is "further proof," visually subordinate.
4. A "Beyond the browser" strip that *represents* agent-host / control-host / backend-host as the medium-blind proof — even though they aren't browser bundles, the pitch dies if the story looks like "just a UI."

**Tier 1 — Console, the hero (three altitudes, now essence-grounded).**
- **Overview (exec):** lead with the goal→UI pipeline + a rendered thumbnail and the deterministic-fallback promise. Demote id/version to a strip. Answers "what is this profile, and why does it adapt safely?"
- **Layers (designer/senior dev):** the taxonomy → roles → arrangement lowering chain; this is the "bounded, testable mapping" defensibility story (#9).
- **Preview (everyone — the money demo):** real rendered output, and the next build is **surface small-multiples** (desktop / mobile / copilot side-by-side) so adaptation is *seen*, plus a visible **validate-or-fallback** indicator and, ideally, the **trace** it emitted. This absorbs everything Workbench's "run it" did, better.

**Tier 2 — Supporting proofs (kept, deduplicated to one pillar each).**
- **Reactive Demo** → "interaction is emergent from dataflow" (#5). Keep.
- **Provider Authoring Demo** → "AI proposes, planner is swappable" (#7). Keep.
- **Workbench → retire or refocus (my recommendation below).**

**Tier 3 — Beyond the browser (represented in the front door + a diagram).**
agent-host / control-host / backend-host as the three adoption boundaries proving the same kernel runs headless. Not runnable in the browser shell, but essential pitch evidence.

## The Workbench verdict

You're right that Preview now overlaps it. Two honest options:

- **(A) Retire it.** Its only unique input was "pick an interaction kind + profile" — Preview's source-layer form already does that. Fold any missing knob into Preview and drop the bundle. Lowest cost, removes a confusing duplicate.
- **(B) Refocus it as the missing "Live Session / Runtime plane" surface.** Console is entirely *authoring plane* (lower a profile, preview output). Nothing today shows the **runtime plane**: emit events into a live session, watch state patches settle on the deterministic loop while the semantic loop re-plans, see the **trace stream**, and have an agent + human act on the *same* state. That's pillars #4, #10, #11 — and it's the single most differentiated thing in the pitch (auditable, dual-loop, human+agent symbiosis).

My lean: **(B) if you want the pitch to be undeniable**, because "AI proposes, kernel decides, here's the trace" is the moat slide and nothing currently renders it. If you don't want to invest now, **(A)** and log the live-session surface as the next hero feature. Either way, Workbench stops being a second, weaker preview.

## What the startup pitch needs to do — and which screens carry it

A pitch has to move an exec through five beats. Map each to a screen so the IA *is* the deck:

1. **Problem** → Front Door hero copy. ("Agentic UIs are probabilistic and unauditable; every medium reinvents the wiring.")
2. **Insight/wedge** → Front Door profile-vs-bundle micro-demo. (One medium-blind kernel; AI proposes, kernel decides.)
3. **The aha** → **Console Preview** with surface small-multiples. (Same goal → adaptive, validated UI across surfaces, live.) *This is the demo that closes the room.*
4. **Defensibility / diligence** → Console Layers (bounded, testable taxonomy) + Reactive/Authoring demos + the **trace/live-session** surface. (Determinism as a compliance artifact; semantic telemetry as a compounding moat.)
5. **Adoption / market** → "Beyond the browser" hosts. (Drop-in at browser, agent, control, or backend edge — same runtime.)

So the IA should **elevate toward the pitch** by three concrete moves: (1) make the Front Door a narrative with one hero CTA and the profile/bundle definition demonstrated, not listed; (2) make Console Preview produce the adaptive multi-surface *aha* with a visible validate-or-fallback + trace; (3) surface a **trace/forensics** view somewhere (today entirely absent) because "AI proposes, kernel decides, here's the log" is your strongest and least-copyable claim.

## Decisions I need from you

1. **Front Door**: rewrite samples-overview as the pitch narrative (problem → wedge → Console CTA → beyond-the-browser), with profile-vs-bundle demonstrated inline? Yes/no.
2. **Profile vs bundle**: adopt the two one-liners above as the canonical wording across overview + console? Any wording changes?
3. **Workbench**: **(A) retire** or **(B) refocus into a Live Session / trace surface**? This is the biggest fork.
4. **Console Preview**: commit to surface small-multiples + a visible validate-or-fallback (and trace, if we do 3B) as the hero demo?
5. **Beyond-the-browser**: represent agent/control/backend hosts in the IA (diagram + copy), even though they're not browser bundles? Yes/no.
6. **Profiles as curriculum** (from last turn, still stands): reorder briefing→live-cards→4layers with "what this teaches," and collapse the duplicate genui/genui1 templates? Still want this?

My recommended sequence once you pick: lock the **profile/bundle wording (#2)** and **Workbench fork (#3)** first, because they determine how many surfaces exist; then rewrite the **Front Door (#1)**; then build the **Preview aha (#4)**. I'd hold implementation until you call #3 — retire vs refocus changes everything downstream.

---

# GIK-Platform / SOC refinement (2026-07-15)

> This section is the current canonical framing. Where it conflicts with the earlier
> profile/bundle wording above (e.g. "profile = the recipe"), **this section wins.**
> Source: `docs/hidden/GIK-Platform.html` and `docs/hidden/GIK-SOC.html`.

## The canonical graph stack (layers are not arbitrary)

Every profile "layer" is one of a fixed set of named **graph tiers**, split by the kernel boundary:

```
Intent Graph        (WHY)            ┐
Activity Graph      (WHAT)           │  upstream domains
Workflow Graph      (HOW)            ┘
───────── KERNEL / ORCHESTRATION BOUNDARY ─────────
Interaction Graph   (ENGAGEMENT)     ┐
Presentation Graph  (ORGANIZATION)   │  authored platform
Render Tree         (MATERIALIZATION)┘
```

- Our 4-layer profile literally traverses workflow → interaction → presentation → render.
- So `layer` is well-founded — it is a **graph tier**, not a loose word.
- Reframes the profile "curriculum": briefing/live-cards/4layers differ by **how far up the
  WHY→…→MATERIALIZATION stack they enter**, not merely "2 vs 3 vs 4 layers."
- The compiler metaphor is already in the docs verbatim — GIK-Platform §10 *"A Terminally
  Validated Pipeline"*: "a pipeline of graph transformations from Intent down to Reactor…
  testable in isolation… composable… terminally validated."

## Refined terminology (supersedes earlier profile/bundle wording)

Reading the papers reversed the earlier `profile → pipeline` collapse (the docs treat them as
distinct nouns). On further pressure — and because "profile" collides badly with threat/risk/
user profiles in the SOC domain — we instead **rename `profile → blueprint`** and **demote
`pipeline` to a descriptor** (a blueprint *runs as* a pipeline; it is not separately authored).

| Concept | Term | Definition |
|---|---|---|
| Engine / VM | **kernel** | pure `(state,event)→state` runtime |
| Input | **intent** | the goal (also the top tier: "Intent Graph") — *standardize on this* |
| A stage's representation | **tier** (say "graph tier" only to disambiguate) | one of Intent/Activity/Workflow/Interaction/Presentation/Render |
| Transform between two tiers | **lowering** (act) / **lowering recipe** (artifact) | never bare "recipe" for the whole blueprint |
| The authored definition (named, swappable domain package: tiers + recipes + taxonomy + policy) | **blueprint** (positioned as *semantic blueprint*) | the *source program*; replaces "profile" |
| The runnable output | **bundle** | compiled artifact you mount on the kernel |
| Capability vocabulary | **manifest** | closed set of nodes |
| Runtime edge (keep all four) | **kernel · face · projection · transport** | engine → callable surface → policy-filtered view → wire carrier |

Cleanups: **`profile` → `blueprint`** (collision-free in security; reinforces the compiler
metaphor), positioned on first use as a **semantic blueprint** (the meaning-level definition,
not the pixels — `blueprint` is the everyday identifier, "semantic" is the positioning phrase).
**`recipe` → always `lowering recipe`.** **`layer` → `tier`** ("graph tier" only to disambiguate).
**`pipeline` is demoted to a descriptor** — a blueprint runs as a validated pipeline of
lowerings; it is not a separate authored artifact.

## Exec vs builder vocabulary

- **Exec surfaces speak: `intent → governed experience`** (in SOC: *intent → analyst workspace*).
  From the SOC paper: *"Declare the security intent; the platform shapes the workspace."*
- **Builder surfaces** use the full set (blueprint / lowering recipe / bundle / tier).
- This resolves the original "profile is a weak exec word" complaint — it was never meant to be the exec word.

Anchor metaphor: *a semantic blueprint compiles an intent into a bundle by lowering it
tier-by-tier; blueprint : bundle :: source : binary.*

## Narrative spine: horizontal moat + vertical wedge

- **Horizontal moat (the platform):** *the compiler and runtime for governed generative
  interaction* — one medium-blind kernel, closed grammar, AI proposes / kernel decides,
  determinism + trace as the audit artifact.
- **Vertical wedge (the beachhead):** **governed generative security experiences for the SOC.**
  "A phishing alert fires → one governed investigation workspace: evidence gathered, entities
  correlated, next steps proposed behind explicit approval gates." Sold on **MTTR, analyst
  time, auditability.** Paper's line: *"No incumbent owns 'governed generative security
  experiences.' First credible mover with a real SOC reference defines it."*
- **The moat, stated plainly (both papers agree):** the **interaction taxonomy + usage
  telemetry** — "competitors can copy a taxonomy; they cannot copy the tuned mapping without
  the data." Plus determinism as the compliance artifact.

Every console screen should ladder up to this; a SOC investigation workspace becomes the
ultimate Preview/demo target (far more compelling than abstract sample profiles).

## Net effect on the IA work

1. **Profiles-as-curriculum** becomes *"where do you enter the graph stack?"* — briefing
   (interaction) → live-cards (interaction+presentation) → 4layers (from workflow). Consider a
   SOC-flavored profile as the hero demo.
2. **"Beyond the browser"** is really *"same kernel, different **projection + transport**"* — use
   the doc's kernel/face/projection/transport language, not ad-hoc "hosts."
3. **The exec front door** speaks **intent → governed experience**, with an explicit SOC "aha",
   keeping blueprint / lowering recipe / bundle / tier as builder-tier vocabulary.

---

# Decisions

## D1 — Terminology (AGREED)

kernel · **intent** (standardized input) · **tier** ("graph tier" only to disambiguate) ·
**lowering** (act) + **lowering recipe** (artifact; never bare "recipe") · **blueprint** (the
authored, named, swappable domain package — tiers + lowering recipes + taxonomy + policy;
positioned as a *semantic blueprint*; replaces "profile") · **bundle** (compiled runnable) ·
manifest · runtime edge **kernel → face → projection → transport**. `pipeline` is a descriptor
(a blueprint runs as a validated pipeline of lowerings), not a first-class authored noun.
Exec surfaces speak **intent → governed experience**; builder surfaces use the full set.
Anchor metaphor: *a semantic blueprint compiles an intent into a bundle by lowering it
tier-by-tier; blueprint : bundle :: source : binary.*
Category: *the compiler & runtime for governed generative interaction*; first wedge:
*governed generative security experiences (SOC).*

**Agreed:** `tier` (everyday) / "graph tier" (disambiguate); `profile → blueprint` (semantic
blueprint); `recipe → lowering recipe`; `pipeline` demoted to descriptor; input noun = `intent`.
**Fully AGREED** — narrative spine confirmed: horizontal moat (the platform) + SOC vertical
wedge. See D2 (audience model) and D3 (IA / pitch flow).

---

## D2 — Audience model (AGREED)

The real axis is **two planes × two actor types** (essence §2; Platform §11), plus an outside
observer. "Exec vs builder" was too coarse and omitted the runtime row entirely.

|  | **Authoring plane** (fixes the physics) | **Runtime plane** (moves within it) |
|---|---|---|
| **Human** | **DX** — developer authors manifests + blueprints | **HX/UX** — operator/analyst uses the rendered experience |
| **AI** | **ACX** — authoring agent defines, tests, and proves governed artifacts | **AX** — autonomous agent acts on shared state |

- **Observer (exec)** stands *outside* the grid and must be shown *both* planes to believe the claims.
- **Canonical moat:** a generative, collaborative workspace where humans and agents share one
  evolving state. Agents may collaborate **inside the human interaction loop** or continue
  autonomously **outside the interaction loop**, but every consequential action passes through
  the same governed state authority. **Outside the interaction loop never means outside the
  governance loop.**
- **Crown-jewel claims are cross-cell (runtime row):** one shared state / no privileged mutation
  channel; continuity of authority, policy, and trace as agents move inside/outside the interaction
  loop; dual-loop operation (HX deterministic + AX semantic re-plan, validate-or-fallback); no
  parity drift between the human and agent surfaces.

**Vocabulary by register:**
- **Authoring plane (DX + ACX):** manifest, blueprint, tier, lowering recipe, bundle, kernel,
  validation, simulation, execution, and materialization for authoring verification. **ACX means
  Agent Authoring Experience**; it is not a synonym for AI coding, static generation, pure tooling,
  or a lightweight design-time phase. Artifacts must be **machine-authorable**, and an authoring
  agent may exercise the full live AX execution, service, effect, and materialization paths to prove
  its work. DX and ACX identify the authoring actor and purpose; pure/live and immediate/queued are
  independent implementation choices.
- **Runtime HX/UX:** the *rendered experience*; speaks `intent` + the domain (evidence,
  timeline, approve). Never sees "blueprint."
- **Runtime AX:** the *shared state graph / shadow tree*, capabilities, the six action verbs
  (`assign/derive/emit/invoke/route/confirm`), `trace`. Operates the bundle; never authors it.
  May collaborate synchronously in the workspace or continue asynchronously/headlessly, always
  under the same authority and returning consequential decisions through governed state.
- **Observer (exec):** humans + agents in one governed collaborative workspace; agents can leave
  the screen, but cannot leave the governance boundary.

"Governed experience" is the **HX face** of a *dual* runtime surface; its other face is a
**governed agent surface (AX)** over the *same* state. Together they form a persistent
**governed collaborative workspace**, not merely an auditable generative UI.

### D2a — External services and QueueFace (AGREED 2026-07-19)

External services use one pluggable adapter contract across their complete ACX and AX lifecycle.
An adapter may contribute one operation or a federated catalog (for example an MCP server whose
tools have independent schemas), and may support discovery, inspection, validation, simulation,
probe, execution, status, and cancellation. ACX may use the complete live AX execution and
materialization path when an authoring agent needs behavioral proof; lifecycle labels do not imply
that ACX is pure, static, immediate, or lightweight.

#### Final ownership model

The host registers only trusted **service kinds** and the factories capable of executing them, for
example `copilot-agent`, `foundry-agent`, `deterministic-agent`, and `mcp`. It does not maintain an
application-level catalog of every model, workspace, endpoint, agent, or configured service
instance. A host manifest says which kinds it supports and supplies runtime policy, credential
resolution, process/network sandboxing, queue infrastructure, resource limits, cancellation, and
secret redaction.

The Blueprint brings the concrete service configuration required by its behavior. A named service
declaration contains a kind, supported operations, and kind-specific data such as a Copilot model,
packaged workspace resource, Foundry endpoint, Foundry agent id/name, session/thread scope, tool
restrictions, timeout, and fallback policy. A single cell may instead carry the same declaration
inline; named declarations exist only to remove repetition when multiple cells or substrate agents
share one configuration. Profiles lower these declarations into the Bundle manifest unchanged.

Blueprints may carry endpoints and credential *references*, but never literal keys, tokens, or
passwords. A `credentialRef` is authorized and resolved by the host at execution time and is never
copied into Bundle state, queue messages, browser JavaScript, logs, catalog snapshots, or
provenance. Endpoint/audience restrictions prevent a Blueprint from combining an arbitrary
endpoint with a privileged credential reference. Managed identity is preferred for Foundry.

#### Compact contracts

- `ServiceKindFactory`: trusted host implementation with a kind id, configuration schema,
  validation, discovery/probe, and lazy `create` support.
- `ServiceDeclaration`: Blueprint-owned `{ kind, config, operations }`, either named or inline.
- `ServiceUse`: `{ service | inline, operation, contract }` attached to a cell or substrate-agent
  operation.
- `ServiceSubject`: identifies `cell`, `substrate-agent`, `chat`, or `task` scope without creating
  separate service runtimes for those lanes.
- `ServiceRequestRecord`: stable request/correlation/idempotency identity, Blueprint and state
  revisions, attempts, timestamps, resolved kind, provider-native session/thread provenance, and
  terminal result/error state.

QueueFace normally registers kinds, loads Blueprint declarations, validates them, and lazily
materializes scoped adapters. Direct adapter registration remains only as a low-level test or
integration seam. Cache scope (`per-invocation`, `per-cell`, `per-blueprint`, or `per-session`)
controls provider-native continuity; it is not host service-instance registration.

#### Lanes, services, and execution

Copilot Agent and Foundry Agent are peer services. Chat, task execution, substrate-agent work, and
inline-cell work are execution lanes/scopes. Portfolio analysis, strategy generation, SOC
correlation, and response planning are domain operations. A physical target is a Copilot
workspace/model/session, Foundry endpoint/agent/thread, or MCP server/tool. These identities remain
separate in configuration and provenance.

An `ExecutionRef` or queue lane controls where/how a worker runs; the Blueprint service declaration
selects Copilot versus Foundry inside that worker. Queue messages carry stable Blueprint id and
revision, service reference, operation, subject, input, and correlation metadata. Workers resolve
the declaration from that Blueprint revision; provider endpoints and credentials are not copied
into queue messages. Immediate and queued execution use the same request and settlement contracts.

Provider output is untrusted data. Contracts perform strict structural and semantic validation,
known-reference checks, and an explicitly bounded correction policy before settlement. External
agents cannot return arbitrary GIK patches, events, authorization, or execution. Domain-owned
settlement preserves local policy and human gates. Deterministic execution may be selected as an
offline service or used as an explicit, visible fallback; live-to-deterministic fallback is never
silent.

#### Implementation plan

1. Replace the ambiguous operation-only `ServiceRequirement` model with `ServiceKindFactory`,
   `ServiceDeclaration`, `ServiceUse`, and `ServiceSubject`; update Profile/Manifest schemas and
   lowering while preserving the existing Kernel `invoke` vocabulary.
2. Evolve QueueFace from normal instance-first registration to host kind registration, Blueprint
   declaration loading, configuration/policy validation, lazy materialization, scoped caching, and
   Blueprint-revision-aware immediate/queued requests. Keep direct adapter registration only as a
   low-level compatibility seam.
3. Extend `CellDefinition` with optional named or inline service use. Extend substrate-agent
   operations with the same service-use shape. Both feed one QueueFace lifecycle and differ only in
   subject, continuity, input snapshot, and settlement target.
4. Implement a reusable `foundry-agent` kind over the existing Foundry proxy/client behavior:
   discovery, probe, managed identity or host credential resolution, agent/thread execution, tool
   loop, cancellation, conversation/response provenance, strict validation, and bounded repair.
5. Implement a reusable `copilot-agent` kind with Blueprint-selected model, packaged workspace
   resources, native session policy, timeout/tool policy, streaming callbacks, and cancellation.
   Browser hosts advertise it only when an injected server/worker executor is available; they do
   not spawn Copilot locally or pretend to support it.
6. Correct portfolio migration: remove `VITE_PORTFOLIO_INTELLIGENCE_ENDPOINT`, the invented generic
   portfolio HTTP protocol, portfolio-specific host routing, and manual instance bindings. Keep the
   portfolio contracts and human gate; declare analysis/strategy services in the Blueprint and
   attach uses to their cells. Use declarative deterministic simulation for offline tests.
7. Migrate SOC's seven app-local live wrappers to QueueFace service uses while preserving exact
   operation contracts, one repair attempt, known-reference validation, canonical deterministic
   settlement, visible fallback, policy enforcement, human authorization, and journal provenance.
   Remove credential material from `soc.foundry.key`; agent participants may select different
   service declarations independently.
8. Migrate the standalone `foundry-agent` sample to the same service kind for discovery, probe,
   chat, continuity, and normalized receipts instead of calling the proxy directly from product
   effect handlers.
9. Project supported kinds, kind configuration schemas, Blueprint declarations, validation/probe
   results, assurance, request status, and redacted provenance through ACX, ControlFace, and
   AgentFace. ACX and AX use the same declarations and factories.
10. Add coverage for named/inline services, per-cell model differences, Blueprint-specific Foundry
    endpoints, unsupported kinds, configuration validation, credential-reference policy, lazy
    scopes, cell/substrate subjects, Blueprint-revision queue resolution, Copilot/Foundry
    substitution, SOC policy preservation, portfolio human gating, and absence of secrets from
    state/queues/provenance.

#### Sample service-kind plugins

The sample host discovers reusable service-kind plugins under `samples/services/<kind>/`, initially
`deterministic-agent`, `foundry-agent`, `copilot-agent`, `mcp`, and `http-service`. Each folder owns a
portable `manifest.json` (kind id/version, config schema, supported subjects and execution modes,
lifecycle capabilities, and required host capabilities), an `index.ts` exporting the trusted
`ServiceKindFactory`, and focused tests. Domain prompts, contracts, settlement, and policy stay with
their Blueprint/Profile; do not create domain-specific kinds such as `portfolio-foundry-agent`.

`samples/services/registry.json` explicitly admits the kinds enabled by the sample host. A build-time
module glob supplies implementations, but file presence alone never authorizes executable code.
Registration populates one shared `ServiceKindRegistry`: QueueFace consumes it for validation,
materialization, execution, and cancellation; ControlFace projects the same registry for supported
kinds, config schemas, host capability gaps, Blueprint declaration status, probe results, queue
state, assurance, and redacted provenance. AgentFace receives only the policy-approved operational
subset. There is no parallel ControlFace registry.

A registered kind may be unavailable in a particular deployment when required host capabilities
are absent. For example, a static browser host can understand `copilot-agent` while reporting that
execution requires an injected `process-executor` and `workspace-resolver`; a queue worker can make
the same declaration executable. The kind registry therefore distinguishes understood from
currently executable without inventing configured host service instances.

Use `http-service`, not `url-service`: it models a policy-controlled HTTP/OpenAPI execution contract,
not merely an address. It remains suitable for ordinary external APIs but is not a lowest-common-
denominator replacement for richer Copilot, Foundry, or MCP lifecycle semantics. Mature reusable
plugins may later move to `@gik/service-*` packages while these sample folders become thin
registrations; that package split is not required for the initial implementation.

#### Explicit non-goals

Do not add a host service-instance registry, one host entry per model/agent, provider SDK details in
cells, literal Blueprint credentials, new Kernel action verbs, separate QueueFace implementations
for cells and substrate agents, or another portfolio-specific HTTP protocol. Do not force Copilot
and Foundry to have identical internals: they share the lifecycle contract while retaining native
workspace/session versus endpoint/agent/thread behavior.

---

## D3 — IA: one canonical proof + the 4-Beat pitch flow (EVOLVED 2026-07-15)

The host/bundles ARE the pitch deck. The canonical SOC artifact now carries both the running
experience and the executable semantic source that produces it. People see the **runtime magic**
first, then reveal the Blueprint plane inside the same developer-console shell.

**One canonical proof, two planes:**
- **Runtime plane — Live Workspace (SOC):** a purpose-built operational workspace proving two
  humans and two agents participating through one state, explicit authority, and attributable
  causality.
- **Blueprint plane — the same `live-workspace-soc` artifact:** reveals the real intent, four
  tiers, three lowering recipes, eight projection contexts, blueprint resources, and terminal
  runtime document. It proves bounded, testable compilation without maintaining explanatory
  shadow data.

`manage-blueprints` and `manage-bundles` are supporting engineering tools, not separate pitch
heroes. The Blueprint plane is inspection, not a claim that the SOC runtime shell is a complete
editing environment.

**Governing implementation principle — shared implementation, sequenced proof:** the beat boundary
is a presentation and completion boundary, not an artificial architecture boundary. Beat 2 first
demonstrates the running governed SOC workspace; Beat 3 later reveals the blueprint, tiers,
lowering recipes, and projections behind that experience. Beat 3 concerns are a **non-goal** for
declaring the Beat 2 demonstration ready, but they are not an **anti-goal** while implementing it.
Build shared artifacts once and preserve the natural compiler-to-runtime path wherever practical;
do not bypass or contradict that path merely to keep the beats separate. Equally, do not block the
Beat 2 runtime proof on broad compiler generalization, repository-wide terminology migration, or
other authoring-plane completeness that the live demonstration does not require.

**The 4 beats (sequenced argument, not a feature tour):**

1. **Front Door — "Why now" + the wedge** (`samples-overview`, the Platform Storyboard). Message:
  mixed human-agent work fragments state, authority, and accountability. Preview the canonical
  payroll-cutover SOC journey, then open two dominant destinations into one artifact:
  **Experience the SOC Runtime** and **Inspect the Executable Blueprint**. End with a light
  SOC-versus-Tax expansion flash; do not imply that the SOC bundle proves remote continuity.
2. **Runtime plane / the magic** (`live-workspace-soc&plane=runtime`). Morgan, Priya, Correlation
  Agent, and Response Agent contribute through one operational state. Human amendment, policy
  rejection with fallback, recommendation-only authority, commander authorization, execution,
  and journal causality are literal events. Takeaway: "Participation does not imply authority."
3. **Blueprint plane / the machinery** (`live-workspace-soc&plane=blueprint`). Reveal the actual
  semantic blueprint and `traceProfile` outputs behind Beat 2: workflow → interaction →
  presentation → runtime document, with one selected lowering recipe per adjacent tier and eight
  contexts over one substrate. Takeaway: "The running experience is a compiled projection of a
  bounded, testable semantic source."
4. **Domain + Deployment Atlas / transversality.** Domain breadth uses Tax Prep as a light second
  proof: multi-document synthesis, current policy, invalidated optimization, deterministic
  recompute, agent replanning, and confirmation before filing. Medium breadth proves
  **kernel → face → projection → transport** through MCP, SSE, and headless orchestration.
  Takeaway: "Agents can leave the screen. They cannot leave the governance boundary."

**IA principle:** every hero screen declares which cell(s) of D2 it serves; the pitch must
cover the right column + bottom row, not just DX.

---

## D3a — Second domain / transversality proof (AGREED)

Beat 4 carries a **second domain** whose *only* job is to prove the horizontal moat — NOT a
second hero. Decided (a): keep it a **light flash**, folded into Beat 4, renamed **Domain
Atlas** (domain transversality) alongside the Deployment Atlas (medium transversality).

**Second domain = tax preparation** (multi-document synthesis, current tax policy, multiple
optimization decisions). Rationale — it proves horizontality on the *same value axis* as SOC:

- **Same crown jewels, different world.** High-stakes + compliance-bound: a hallucinated
  deduction is *rejected by the rule engine* (validate-or-fallback); every number is *traceable
  to a source doc + policy* (trace/forensics); nothing files without a `confirm`-gate. SOC's
  moat, verbatim, in finance.
- **Different domain AND different runtime shape** (security→finance; real-time monitoring→
  long-running document workflow) while holding the value axis constant → the moat reads as the
  *invariant across domains*. Sameness of value-axis is the feature, not a bug.
- **Sharp dual-loop illustration:** a policy change invalidates a prior optimization →
  deterministic recompute (HX) while the AX agent re-plans strategy against the new rules.
- **Framing win:** SOC = *protect*, Tax = *optimize + comply* — the two archetypes of
  consequential enterprise AI, both governed. Broad but disciplined.
- Stresses the **workflow tier** (top of stack / `4layers`), like the runtime hero.

**Guardrail:** a flash, not a hero — we *borrow* tax's stakes to prove generality, we are NOT
building TurboTax. Frame strictly as "same kernel, headless, a tax journey."

> Rejected alt: university admissions journey — proves horizontality but on a *weaker* value
> axis (convenience/assistance, consumer, low stakes), which muddies "why the moat matters."

---

# TODOs

> Ordered by the 4-Beat pitch flow (D3), not priority-locked. Terminology (D1), audience
> model (D2), and IA (D3) are AGREED, so the rename sweep and IA work are unblocked.

## Terminology rollout
> Scope check (2026-07-15): `profile` ~399 hits/32 files (incl. package/dir names, type names,
> `profile.schema.json`, JSON `"type"` tags, effect/tool ids); `recipe`/`layer` ~297 hits/28
> files, but `layer` is heavily overloaded (generic "render/translation/orchestration layer" ≠
> graph-tier). A blind sweep is WRONG. Split into surface vs deep:
- **T1a — Surface vocabulary (DONE 2026-07-15, console bundle):** renamed only audience-
  visible display strings in `console/document.json`, `console/store.ts`, and
  `console/projection_views/index.tsx` — `profile→blueprint`, graph-tier `layer→tier`,
  `recipe→lowering recipe`, `input→intent`. State keys / element ids / tool + capability names /
  type names left for T1b. `registry.json` has no prose; `samples-overview` pitch copy folds
  into T2. Verified: `store.test.ts` 10/10 green.
- **T1b — Deep rename (deferred, high risk):** internal type names, `@gik/profile` package +
  dir renames, `profile.schema.json` + JSON wire `"type"` tags, effect/tool ids. API + data
  migration; not pitch-critical. Do after the IA lands.
- **ADRs are NOT rewritten** (they are historical). Add ONE short superseding note recording the
  vocabulary change (`profile→blueprint`, `layer→tier`, `recipe→lowering recipe`, input=`intent`,
  pipeline demoted) and leave ADR-0001/0007/0013/0038 intact.

## Beat 1 — Front Door (Platform Storyboard)
- **T2 — DONE v2 (2026-07-15) — Canonical Platform Storyboard:** pain → mixed-team invariant →
  canonical five-act SOC preview → trust proof → Runtime/Blueprint planes of one artifact →
  SOC-versus-Tax expansion flash. Story data lives in bundle state. Remote/headless continuity is
  explicitly assigned to Beat 4 rather than claimed by the SOC runtime.

## Beat 2 — Runtime-plane hero (Live Workspace : SOC)
- **T3 Runtime — DONE (2026-07-15):** two humans and two agents share one governed incident state.
  The canonical payroll-cutover journey includes intent, constraint, exploration amendment,
  policy-blocked DC-01 overreach with fallback, Host-A resolution, recommendation, commander
  authorization, and separate execution. It proves deterministic in-process orchestration, not
  remote clients or durable background agents. `workbench` remains unchanged and routable.

## Beat 3 — Blueprint plane (same SOC artifact)
- **T3 Blueprint — DONE (2026-07-15):** the Runtime/Blueprint switch exposes the real SOC profile
  load, three recipe executors, four tiers, eight presentation contexts, blueprint-owned resources,
  and terminal-document equivalence. URL-addressable `plane` and `context` select projection only.
- **Supporting tools:** `manage-blueprints` and `manage-bundles` remain engineering surfaces for
  catalog/edit/validation workflows. Their product work is tracked separately from the pitch beat.

## Beat 4 — Domain + Deployment Atlas (transversality)
- **T7 phase 1 — DONE (2026-07-15):** the `control-host` continuity mode and transport-only
  background worker prove `kernel → face → projection → transport` across MCP and SSE. MCP queues
  work, the renderer disconnects, the headless worker observes and completes through HTTP MCP, and
  SSE resume replays the two missed revisions from the same authority. Requester/completer
  attribution remains in shared state. This proves transport-isolated continuation, not durable
  recovery after the authority process restarts. It remains a protocol fixture, not the target app.
- **T7 migration — PLANNED (2026-07-16):** migrate `demo-boards-ns-code` and
  `demo-boards-frontend` to consume public GIK packages as a real application migration. Reuse the
  existing hosted runtime, persistence, queue runner, MCP, SSE, and domain processing where mature;
  replace the bespoke interaction authority incrementally without permanent dual truth. Beat 4
  continuity is acceptance evidence from the functioning migrated application, not a separate demo.
- **T7a — Domain Atlas (domain transversality, per D3a):** a light *flash* of a second domain
  = **tax preparation** (multi-doc synthesis, current policy, optimization decisions) running on
  the same kernel/verbs/trace. Reuse SOC's forensics framing (validate-or-fallback, `confirm`-
  gate, source+policy traceability). The minimum executable artifact should show a policy change
  invalidating an optimization, deterministic recompute, agent replanning, and confirmation before
  filing. Flash, not a hero — do NOT build a full tax product.

## Supporting
- **T8 — Reframe sample blueprints by tier entry point** (briefing=interaction,
  live-cards=+presentation, 4layers=from workflow) with a one-line "what this teaches"; collapse
  duplicate genui/genui1 templates. Consider a SOC-flavored hero blueprint feeding T3.
