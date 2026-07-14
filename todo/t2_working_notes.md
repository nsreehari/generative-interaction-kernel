# T2 — Front Door / Platform Storyboard — working notes

> Scope: **Beat 1** of the 4-Beat pitch IA (see `working-doc.md` D3). Rewrite the
> `samples-overview` bundle from a *catalog of technical demos* into the **Platform Storyboard**:
> the exec/investor front door that frames the problem, the category, and the SOC wedge, then
> steers the viewer into the two heroes. Vocabulary is post-T1a (`blueprint` / `tier` /
> `lowering recipe` / `intent`).
>
> Status: IMPLEMENTED (v1, 2026-07-15). `samples-overview` now follows this IA. Host build passes;
> Runtime/Compiler routes work; desktop and 375px mobile layouts have no horizontal overflow.

---

## 1. Job of this screen

One sentence: **make an exec understand a painful consequence, see a credible new product
category, and want proof — with SOC as the first wedge.**

The category thesis is broader than "auditable generative UI":

> **A generative, collaborative workspace where humans and agents share one evolving state.
> Agents can collaborate inside the human interaction loop or operate autonomously outside it,
> while every consequential action passes through the same governed state authority.**

The memorable contract: **Agents can leave the screen. They cannot leave the governance
boundary.** Outside the interaction loop never means outside the governance loop.

It must make six moves, in order, with **zero builder jargon**:
1. **Pain:** AI has moved from answering questions to performing work, but human UI, agent
  runtime, and autonomous backend remain fragmented.
2. **Product contract:** humans and agents work in one governed collaborative workspace.
3. **Wedge:** SOC is the first high-stakes proving ground.
4. **Trust proof:** shared state, governed action, continuous authority, complete trace.
5. **Demonstrations:** fork to Runtime or Compiler only after the proof is understood.
6. **Expansion:** lightly signal that the substrate crosses domains and media; defer proof to
  the Domain + Deployment Atlas.

Audience served (D2): primarily **Observer (exec)**; it must route to the Runtime plane (HX/AX)
and Authoring plane (DX/ACX). Runtime acronyms are labels, not primary copy.

Non-goals: it does NOT teach the API, list every bundle, or explain repo wiring. It is a
storyboard, not a table of contents.

---

## 2. Current state (what exists / what to retire)

- Bundle: `samples/bundles/samples-overview/` — `document.json` shell wraps a single custom
  capability `demo:samplesOverview`, rendered by `projection_views/index.tsx`
  (`SamplesOverviewView: ProjectionView`, Fluent `makeStyles`).
- Navigation primitive to KEEP: `openBundle(bundleId)` — sets `?bundle=<id>` and reloads. This is
  how CTAs jump to heroes. Registry ids available: `console`, `workbench`, `reactive-demo`,
  `provider-authoring-demo`, `samples-overview`.
- RETIRE (stale "portfolio/catalog" framing):
  - `customerScript` prose ("GenUI is a declarative interaction platform… sample set…").
  - The 5-CTA button row (Start Here / Console / Workbench / Authoring / Reactive).
  - `browserBundles`, `browserLane`, `personas`, `hostShapes` tables framed as a sample tour.
  - Any "profile"/"recipe" wording (post-T1a → blueprint / lowering recipe).
- REUSE / repurpose: `outwardLane` (agent-host / control-host / backend-host) → feeds **Beat 4
  Deployment Atlas**, not the Front Door. Keep the data, move the framing.

---

## 3. Target IA — the Platform Storyboard (sections, in order)

The page is a **vertical scroll storyboard**, not a feature tour. There is ONE dominant navigation
fork, after the SOC journey and trust proof. The hero may have a single "See how it works" anchor,
but it does not offer early exits into the bundles.

```
┌─ HERO ───────────────────────────────────────────────┐
│ eyebrow: GOVERNED HUMAN–AGENT COLLABORATION            │
│ H1: Humans and agents need one governed place to work │
│ lead: pain + product contract in 2 sentences          │
│ [ See how it works ↓ ]                                │
└───────────────────────────────────────────────────────┘
1. Why Now            — AI performs work; today's systems fragment state + accountability
2. Product Contract   — one collaborative workspace; inside/outside loop, same authority
3. SOC Journey        — intent → evidence → evolving workspace → approved action
4. Trust Proof        — shared state | continuous governance | governed action | complete trace
5. Choose the Proof   — [ Experience the SOC Runtime ] [ Author Governed Experiences ]
6. Expansion Teaser   — consequential work across domains + media; Atlas owns the proof
```

Beat 4 (Deployment/Domain Atlas) is a SEPARATE surface (own task T7/T7a), reachable but NOT part
of the Front Door scroll — a small "Under the hood → Deployment Atlas" link at most.

---

## 4. Section-by-section outline + copy direction

> Copy is direction, not final. Keep sentences short. No "profile", "component", "renderer",
> "hook", "reducer", "medium-blind", or runtime acronyms in primary exec-facing copy. Allowed
> nouns: collaborative workspace, shared state, governed action, intent, agent, analyst,
> authority, policy, trace/audit. `Blueprint` appears only in the Compiler card.

### HERO — pain + product contract
- **Eyebrow:** `GOVERNED HUMAN–AGENT COLLABORATION`
- **H1:** "Humans and agents need one governed place to work."
- **Lead:** "AI now investigates, recommends, and acts. GIK gives humans and agents one evolving
  workspace where they can work together or continue autonomously — without fragmenting state,
  authority, or accountability."
- **Support line:** "Agents can leave the screen. They cannot leave the governance boundary."
- **CTA:** one anchor only: **"See how it works"** → SOC Journey.
- Replace sample-count stat cards with three contract badges: **Shared state · Governed action ·
  Complete trace**. `Medium-blind` belongs to Beat 4, not the hero.

### 1. Why Now — the operational fracture
- AI has moved from answering questions to participating in consequential work.
- Today's human interface, agent runtime, and autonomous backend use separate state and mutation
  paths. That creates parity drift, invisible actions, and broken accountability.
- Villain line: "A hallucinated answer is inconvenient. A hallucinated action is an incident."

### 2. Product Contract — one workspace, two participation modes
- **Inside the interaction loop:** human and agent collaborate synchronously through the same
  evolving workspace.
- **Outside the interaction loop:** the agent continues asynchronously/headlessly — monitoring,
  invoking tools, deriving findings, and preparing decisions.
- **Invariant:** both modes use the same state authority, capabilities, policy, and trace. The
  agent returns consequential decisions to the workspace for governed approval/action.
- Exec phrasing: "The AI may adapt the experience and continue the work. It never becomes the
  authority."

### 3. SOC Journey — the wedge as a visible story
- Why SOC: high stakes, compliance-bound, audit non-negotiable, and static dashboards cannot keep
  pace with a changing investigation.
- Show a compact journey, not a feature list:
  `Investigate phishing intent → trusted evidence assembled → analyst + agent collaborate →
  analyst leaves → agent continues investigation → findings return → Isolate Host requires
  confirmation → action + rationale remain in the trace`.
- This journey must make the inside/outside-loop continuity visible before the viewer clicks.

### 4. Trust Proof — why this is governable
- **One shared workspace** — human and agent surfaces derive from the same evolving state; no
  shadow source of truth.
- **Continuous governance** — the agent may leave the interaction loop, never the state/policy/
  authority/trace boundary.
- **Governed action** — the model proposes; the state authority validates, rejects, or requires
  confirmation.
- **Complete trace** — every proposal, rejection, patch, approval, and autonomous continuation is
  attributable.

### 5. Choose the Proof — the ONE dominant fork
- Two large cards, each declaring its D2 cells as small labels rather than CTA jargon:
  - **Experience the SOC Runtime** · `HX + AX`. "Watch an analyst and agent share one workspace,
    continue across interactive and autonomous work, and return consequential actions through
    the same governance boundary." → `openBundle("workbench")`
  - **Author Governed Experiences** · `DX + ACX · Powered by the GIK Compiler`. "See humans and
    AI coding agents define governed domains as bounded, testable blueprints: intent → tiers →
    bundle." → `openBundle("console")`

### 6. Expansion Teaser — breadth without losing the wedge
- One sentence only: "SOC is the first high-stakes domain; the same governed substrate extends
  to document-heavy, policy-bound work and from interactive surfaces to headless execution."
- Do NOT name or demo tax here. Domain Atlas (T7a) reveals tax; Deployment Atlas (T7) proves the
  browser/MCP/SSE/headless boundary.
- Footer may repeat the two destinations as compact text links, not another pair of hero cards.

---

## 5. Navigation / wiring

- Keep `openBundle(id)`; wire the single late-page fork to `workbench` (Runtime) and `console`
  (Compiler). Hero `See how it works` scrolls to the SOC Journey.
- The `samples-overview` bundle stays `default` in `registry.json` (front door is the landing).
- Heroes must have a visible "← Back to Overview" affordance (add to `workbench`/`console` in their
  own tasks, or a shared host chrome). Track as a cross-cutting note, not part of T2 copy.

---

## 6. Copy guardrails (post-T1a vocabulary)

| Say (exec register) | Don't say (builder register) |
|---|---|
| governed collaborative workspace | auditable generative UI |
| inside/outside interaction loop; always inside governance | human-in-the-loop only |
| one evolving state + shared authority | separate UI and agent state |
| intent → governed experience | goal → document/profile |
| blueprint (only in Compiler card) | profile / template |
| lowering recipe, tier (only in Compiler card) | layer / recipe / reducer |
| the kernel decides; the model proposes | dispatch / effect handler |
| trace / audit | event log / op stream |

---

## 7. Technical notes

- Single-file change surface: `samples-overview/projection_views/index.tsx` (the storyboard is one
  custom view). `document.json` shell likely stays; retitle root `title`/`subtitle` and drop the
  "How to read this" rail, or fold the rail into the hero.
- Styling: reuse existing Fluent `makeStyles` tokens (hero, section, card, ctaRow). The current
  5-button row becomes one hero anchor plus one two-card navigation fork after the trust proof.
- Theme authority: the host already wraps bundles in `HostThemeProvider → FluentProvider` and
  exposes semantic roles (`--bg`, `--panel`, `--panel-2`, `--text`, `--muted`, `--line`,
  `--accent`). The storyboard consumes those roles; direct decorative palette backgrounds are
  prohibited. Semantic success/error tokens are reserved for trace status only.
- No kernel/adapter changes; no new capability needed (reuse `demo:samplesOverview`).
- Dev host: `npm run dev:host`, then `http://localhost:5175/?bundle=samples-overview`.

---

## 8. Acceptance checklist

- [ ] Hero states pain + product contract in ≤ 3 sentences, zero builder jargon.
- [ ] Hero explicitly frames a collaborative workspace for humans + agents, not merely UI safety.
- [ ] "Agents can leave the screen; they cannot leave the governance boundary" is visible.
- [ ] Exactly ONE dominant two-card fork, after the SOC journey + trust proof; old 5-button row gone.
- [ ] SOC journey shows the agent inside the interaction loop, continuing outside it, and returning
  a confirmation-gated action to the same workspace.
- [ ] Trust proof covers shared workspace, continuous governance, governed action, complete trace.
- [ ] Two proof cards declare their D2 cells as secondary labels (HX/AX vs DX/ACX).
- [ ] No "profile"/"recipe"/"layer" wording; blueprint/tier/lowering-recipe only where needed.
- [ ] `outwardLane`/host tables removed from the front door (moved to Beat 4 backlog).
- [ ] Expansion teaser is one sentence; tax and medium details remain deferred to T7a/T7.
- [ ] Loads clean at `?bundle=samples-overview`; both CTAs navigate correctly.

---

## 9. Open questions / decisions to confirm before build

1. **H1 wording** — current recommendation: "Humans and agents need one governed place to work."
  Validate against the actual layout; shorten only if it wraps poorly.
2. **Contract badges** — current recommendation: `Shared state / Governed action / Complete trace`.
  Keep only if they support, rather than duplicate, the lead.
3. **Back-navigation** — shared host chrome vs per-hero back button. Needs a cross-cutting call
   (affects workbench + console tasks too).
4. **Deployment Atlas link** — surface a tertiary link now, or hold until T7/T7a exists? Lean hold
   to avoid a dead link.
5. Does the Front Door need a 20–30s **auto-demo loop** showing the analyst leave, the agent
  continue, and a governed finding return? High-value stretch, not required for v1.
