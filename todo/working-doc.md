Updated todo list

Let me gather the missing context: the samples-overview bundle, the workbench bundle, the apps/host bundle structure, and the GIK public docs.   

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles)

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/docs)

Searched for files matching `**/GIK-*.md`, 15 matches

Let me read the core essence doc, the public docs, and the samples-overview + workbench bundles.    

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/docs/public)

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles/samples-overview)

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/samples/bundles/workbench)

Read [](file:///c%3A/Users/sreenaga/ADO/ai-tool-evolver/generative-interaction-kernel/docs/public/GIK-Core-Essence.md)

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
> Source: `docs/public/GIK-Platform.html` and `docs/public/GIK-SOC.html`.

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
| **AI** | **ACX** — AI coding agent authors the same artifacts | **AX** — autonomous agent acts on shared state |

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
  validation. Constraint from ACX: artifacts must be **machine-authorable** — the closed
  grammar + schema validation is what lets an AI coder author safely.
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

---

## D3 — IA: "Two Heroes" + the 4-Beat pitch flow (AGREED)

The host/bundles ARE the pitch deck. The Console is *not* the ultimate hero — it is the
authoring-plane tool. People buy the **runtime magic** first, then the tooling behind it.

**Two heroes, one per plane:**
- **Runtime-plane hero — Live Workspace (SOC):** the refocused `workbench`. Proves HX+AX
  symbiosis, determinism, and trace forensics.
- **Authoring-plane hero — Console:** proves blueprints are bounded, testable, and
  machine-authorable (DX + ACX).

**The 4 beats (sequenced argument, not a feature tour):**

1. **Front Door — "Why now" + the wedge** (`samples-overview`, rewritten as the *Platform
  Storyboard*). Message: AI has moved from answering questions to participating in work, but
  today's human UI, agent runtime, and autonomous backend fragment state and accountability.
  GIK is the compiler + runtime for **governed human-agent collaboration**: one evolving
  workspace, shared authority, whether the agent is in the interaction loop or operating
  autonomously. First wedge = SOC. After the SOC proof spine, two dominant CTAs:
  **Experience the SOC Runtime** → Hero 1; **Author Governed Experiences** → Hero 2, with
  `DX + ACX · Powered by the GIK Compiler` as the mechanism label. Zero builder jargon.
2. **Runtime plane / the magic** (Hero 1 — Live Workspace : SOC). 3-pane: **HX** (rendered
  analyst UI, `confirm`-gated "Isolate Host"), **AX** (live semantic shadow tree; agent proposes
  `derive`/`route` against the graph, not pixels), **Trace/forensics** (every action hits the
  governed authority: `[Proposed by AI] → [Validated] → [Patched]`; show a hallucinated proposal
  *rejected* by fallback). The scenario must also show continuity: the agent continues an
  investigation asynchronously after the analyst leaves, then returns findings and a
  confirmation-gated action to the same workspace. Takeaway: "Agents can leave the screen.
  They cannot leave the governance boundary."
3. **Authoring plane / the moat** (Hero 2 — Console). Tabs: **Blueprint Overview** (intent →
   [tiers] → bundle), **Lowering Recipes** (bounded taxonomy → layout mapping), **Surface
   Preview** (small-multiples: desktop war-room / mobile alert / copilot panel). Takeaway:
  "Blueprints are closed declarative graphs, so humans and AI coding agents can author new
  governed domains as bounded, testable artifacts."
4. **Transversality / scale** (Deployment Atlas). Prove that inside-loop and outside-loop work
  retain the same state authority via **kernel → face → projection → transport**: `agent-host`
  (MCP tools), `control-host` (SSE live runtime), `backend-host` (headless orchestration).
  Takeaway: "The agent can continue beyond the screen without creating a shadow process — same
  state, policy, authority, and trace everywhere."

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
- **T2 — DONE (2026-07-15) — Rewrote `samples-overview` as the pitch storyboard:** pain → product contract → SOC
  journey → trust proof → two demonstrations → expansion teaser. Lead with the governed
  collaborative-workspace thesis and the inside/outside-interaction-loop continuity; then two
  dominant CTAs (**Experience the SOC Runtime** → Live Workspace; **Author Governed Experiences**
  → Console, powered by the GIK Compiler). Retired the stale sample catalog/customer script. Uses the host `HostThemeProvider`
  semantic roles; host build passes, both routes work, and 375px mobile has no overflow.

## Beat 2 — Runtime-plane hero (Live Workspace : SOC) — was the "Workbench fork"
- **T3 — Refocus `workbench` into Live Workspace : SOC** (fork RESOLVED = refocus, not retire).
  3-pane: **HX** rendered analyst UI (`confirm`-gated action) · **AX** live semantic shadow tree
  (agent proposes `derive`/`route` against the graph) · **Trace** forensics showing
  `[Proposed] → [Validated] → [Patched]` incl. a *rejected* hallucinated proposal. Add an
  asynchronous continuation: the agent leaves the active human loop, continues under the same
  authority, then returns governed findings/actions to the same workspace.

## Beat 3 — Authoring-plane hero (Console)
- **T4 — Blueprint Overview tab:** lead with `intent → [tiers] → bundle` + rendered thumbnail +
  deterministic-fallback promise; demote id/version to a strip.
- **T5 — Lowering Recipes tab:** the tier-by-tier lowering (bounded taxonomy → layout mapping)
  as the defensibility story.
- **T6 — Surface Preview tab (the aha):** small-multiples (desktop war-room / mobile alert /
  copilot panel) + visible validate-or-fallback + trace.

## Beat 4 — Domain + Deployment Atlas (transversality)
- **T7 — Represent `kernel → face → projection → transport`** as a **Deployment Atlas** (medium
  transversality): `agent-host` (MCP tools), `control-host` (SSE live runtime), `backend-host`
  (headless). Prove the core runs detached from the UI shell — "same blueprint, headless."
- **T7a — Domain Atlas (domain transversality, per D3a):** a light *flash* of a second domain
  = **tax preparation** (multi-doc synthesis, current policy, optimization decisions) running on
  the same kernel/verbs/trace. Reuse SOC's forensics framing (validate-or-fallback, `confirm`-
  gate, source+policy traceability). Flash, not a hero — do NOT build a full tax product.

## Supporting
- **T8 — Reframe sample blueprints by tier entry point** (briefing=interaction,
  live-cards=+presentation, 4layers=from workflow) with a one-line "what this teaches"; collapse
  duplicate genui/genui1 templates. Consider a SOC-flavored hero blueprint feeding T3.
