# T3 — Live Workspace : SOC — working notes

> Scope: **Beat 2** of the 4-Beat pitch IA (see `working-doc.md` D3). Build the runtime-plane hero:
> a live SOC workspace where an analyst and a visible team of agents investigate one incident,
> share one evolving state, cross policy boundaries, continue asynchronously, and return a
> consequential decision to the human.
>
> Status: PLANNING (no bundle edits yet). **Start from the pitch experience, not from the current
> `workbench`.** Reuse its proven kernel/transport pieces where they help; discard its shell and
> authoring chrome where they diminish the demo.

---

## 0. Product thesis

The hero is not a layout and it is not an inspector. It is a **live collaboration** the audience
can understand without knowing GIK:

> One incident. One evolving workspace. Several visible agents. One governed authority.

The audience must see agents as participants, not infer them from a trace or watch a generic
playlist advance. Each agent has an identity, role, current activity, contribution, and authority
boundary. Their work changes the same evidence, hypotheses, and response plan the analyst sees.
Governance appears at the moment it matters — attached to the proposal it validates, rejects, or
holds for confirmation — rather than living only in a permanent diagnostics pane.

## 1. Job of this bundle

Be the irrefutable, working proof of the product contract established in Beat 1:

- **Visible collaboration:** the analyst can see which agents are present, what each is doing,
  what evidence each contributes, and when they disagree or converge.
- **Shared state:** agent activity changes the operational workspace itself — evidence graph,
  hypotheses, timeline, and response plan — not a separate chat transcript.
- **Governed agency:** proposals carry visible authority receipts (`validated`, `rejected`,
  `confirmation required`) at the point of action.
- **Continuity:** the analyst can hand the investigation to the agent team, leave the active loop,
  and return to the same workspace with state, policy, authority, and provenance intact.

We are not building a full SOC product. We are building one unusually convincing incident journey
that exposes platform complexity through clear work, not through developer instrumentation.

## 2. Experience architecture (not a fixed 3-pane requirement)

The desktop composition should feel like an operational incident room, with responsive regions
chosen for legibility rather than symmetry:

1. **Incident command bar:** incident severity/status, current mode (`Collaborative` or
  `Autonomous`), participating humans/agents, and the next consequential decision.
2. **Shared investigation canvas (primary):** evidence, hypotheses, affected entities, and response
  plan evolve in place. Agent contributions land as attributed changes on this shared surface.
3. **Agent presence + activity:** a visible team roster and live activity stream. Named agents such
  as **Triage**, **Identity**, **Endpoint**, and **Response** expose `working / waiting / blocked /
  needs approval`, the capability or tool in use, and their latest contribution.
4. **Contextual authority receipts:** validation, rejection, fallback, and confirmation appear next
  to the affected proposal. A compact activity ledger or expandable forensic drawer preserves the
  complete trace without making diagnostics one-third of the product.
5. **Human command surface:** the analyst assigns/refines intent, inspects evidence, changes the
  collaboration mode, and approves or rejects consequential actions. Controls are contextual, not
  a generic form builder.

Desktop may use a main canvas plus one activity rail. Mobile should use a single primary workspace
with agent activity and forensics in tabs/drawers. The architecture must not require three panes.

**Reconciling with the D3 "dual-face (HX + AX)" promise:** the shared canvas is the *merged* face
of one state, not a rejection of the AX view. Keep AX provable via an explicit "agent's-eye view"
toggle/inspector over the *same* graph (entities, capabilities, proposals, trace) rather than a
permanent second column. The dual-face claim must be demonstrable on demand; it need not consume a
third of the screen at rest.

## 3. Build direction: new hero, workbench untouched

Create a purpose-built `live-workspace-soc` bundle and route the Runtime CTA to it. Register it in
`samples/bundles/registry.json` and repoint the `samples-overview` Runtime CTA (currently
`openBundle("workbench")`) at the new id; leave `default` = `samples-overview` unchanged. T3 is
strictly additive: do not rename, restyle, relocate, or remove anything under
`samples/bundles/workbench`.
Keep the existing bundle routable as a reference and regression baseline throughout the remaining
pitch implementation. Decide whether to retire/remove it only in a separate cleanup task after all
four beats are complete and validated.

The old bundle may inform the implementation, but the new bundle must not import its private
internals or make it a runtime dependency. Prefer existing shared packages; where no shared seam
exists, implement the narrow capability in the new bundle and defer any deduplication/extraction
until the cleanup phase.

**Candidate mechanisms to reference and reimplement/reuse through existing shared APIs:**
- `AgentPort` and the controller/transport-neutral emit contract.
- Guest-kernel/session construction and capability registry pieces.
- Trace normalization/rendering logic, redesigned as receipts + a forensic drawer.
- Existing action grammar and reducer paths for `derive`, `invoke`, `route`, and `confirm`.

**Do not carry forward by default:**
- The fixed `300px | 1fr | 420px` shell.
- Generic interaction/layout forms, JSON/session editors, profile selectors, region/facet tables,
  and authoring-tour chrome.
- `workbench.*`, `inspect`, or `wb:` names merely because they exist.
- `agent-playlist.json` as the user-facing mental model. A deterministic scenario script may drive
  the demo, but the UI must render persistent agent actors and their actual participation.

## 4. The governed SOC scenario

The scenario is one coherent incident, not a feature tour:

**Act 1 — Assemble the team.** A suspicious identity event and lateral movement on Host-A open the
workspace. The analyst sets the intent: "Establish scope, contain safely, preserve evidence."
Triage, Identity, Endpoint, and Response agents visibly join with bounded roles and authority.

**Act 2 — Investigate in parallel.** Identity correlates impossible travel; Endpoint finds a new
remote service; Triage links both observations into a high-confidence hypothesis. Their activity,
tool calls, and attributed evidence appear live while the shared graph/timeline updates. The analyst
can inspect or redirect work without leaving the workspace.

**Act 3 — Hit a real boundary.** Response proposes isolating a protected domain controller based on
an incomplete correlation. Policy rejects the proposal and applies a safe fallback (increase
telemetry + preserve evidence). The rejected proposal remains visible with the evidence used, the
policy reason, and the fallback. Call this **policy-blocked overreach**, not a hallucination.

**Act 4 — Hand off without losing control.** The analyst selects **Continue autonomously**. Presence
changes from live collaboration to autonomous monitoring; simulated time advances; agents continue
to contribute to the same evidence and timeline. The workspace explicitly shows that authority and
trace remain active while the human is outside the interaction loop.

**Act 5 — Governed return.** Agents converge on Host-A as the correct containment target. Response
returns a confirmation-gated isolation proposal with its evidence chain and blast-radius summary.
The analyst approves it; Host-A status changes to contained; every contribution and decision remains
attributable.

Pitch takeaway: **Agents can leave the screen. They cannot leave the governance boundary.**

## 5. Multi-agent model & state shape

**Every agent is "just another client."** Preserve the core thesis: no agent has a privileged
mutation path. The four roles are distinct **actor identities** that emit through the same
transport-neutral port the platform exposes to any client. The deterministic scenario runner acts
as the orchestrator that advances each actor; it authors on their behalf but through the identical
event path, so provenance (`actorId`) rides the event, not a side channel. This keeps the demo
honest: swapping the runner for real over-the-wire agents changes nothing downstream.

**Minimum viable shared-state shape** (illustrative, not final — pin during the Phase 0 spike):

- `incident`: id, title, severity, status (`triage → investigating → contained`), mode
  (`collaborative | autonomous`).
- `actors[]`: id, role (`triage/identity/endpoint/response/analyst`), kind (`human | agent`),
  status (`working/waiting/blocked/needs-approval/idle`), currentActivity, authority scope.
- `evidence[]`: id, sourceActorId, kind, summary, confidence, linkedEntityIds, timestamp.
- `entities[]`: id, kind (`host/account/service`), label, riskState, protectedClass?.
- `hypotheses[]`: id, statement, confidence, supportingEvidenceIds.
- `proposals[]`: id, actorId, action verb + target, evidenceIds, authorityResult
  (`validated | rejected+fallback | confirmation-required | approved | executed`), reason.
- `timeline[]` / `trace[]`: append-only, attributable, the forensic spine.

HX projects `evidence/entities/hypotheses/proposals/timeline`; AX projects
`actors/entities/proposals/trace`. Both are views of this one graph — never parallel fixtures.

## 6. Implementation principles

1. **Real kernel events, deterministic scenario.** A scripted scenario is acceptable for demo
  reliability, but every visible contribution must dispatch a real GIK event through schema,
  authority, reducer, and trace. Do not paint fake success/rejection labels in the React view.
2. **Agents are stateful actors, not toast messages.** Model agent identity, role, mode, current
  activity, authority, and contributions in shared state. The scenario runner advances actors; it
  does not replace them.
3. **Two representations, one state.** HX presents operational evidence; AX presents agent-readable
  entities/capabilities. They must derive from one state graph, not parallel demo fixtures.
4. **Progressive disclosure for platform proof.** Show compact authority receipts inline; expose
  full event payloads/state diffs in the forensic drawer for technical audiences.
5. **Step-through first, autoplay second.** Let the presenter advance acts deliberately, with an
  optional autoplay mode. Cause, authority decision, and state change must remain legible.
6. **Honor host theming + reuse conventions.** Consume `HostThemeProvider` semantic variables
  (`var(--bg)`, `var(--panel)`, `var(--accent)`, `var(--line)`, …); no hard-coded Fluent palette
  colors (the T2 lesson). Prefer shared `@gik/*` packages over bundle-local reimplementation.

## 7. Risks to resolve before committing the UI architecture

- **Rejection semantics:** verify whether the kernel can represent a policy rejection + fallback as
  a first-class trace result. If not, add the smallest real kernel/trace capability needed.
- **Confirmation lifecycle:** verify `confirm` supports pending → approved/rejected → executed, not
  merely a static trace label.
- **Multi-agent attribution:** determine whether actor identity/provenance already flows through
  events. If absent, define it at the event/trace contract, not only in presentation state.
- **Autonomous continuity:** prove the same state authority can be driven through the transport-
  neutral agent port while no human action is occurring. The UI mode switch alone is insufficient.
- **Scenario density:** four agents and five acts are enough complexity. Keep one incident and one
  final decision so the audience sees orchestration rather than dashboard noise.

## 8. Phased delivery (discovery first)

Sequence the build so the riskiest platform claims are proven before any UI polish:

- **Phase 0 — Capability spike (resolves Section 7 risks):** in a throwaway harness, prove the
  kernel can (a) carry `actorId` provenance on events, (b) represent a policy `rejected + fallback`
  result as first-class trace, and (c) run the `confirm` lifecycle `pending → approved → executed`.
  Where a primitive is missing, decide *build-the-smallest-real-thing* vs *narrow the scenario*
  before committing the UI. No UI investment until these are answered.
- **Phase 1 — Static incident room:** layout, actor roster, and shared canvas rendering seeded
  state (no motion). Establishes legibility and theming.
- **Phase 2 — One real agent event:** a single actor emits a real event that mutates shared state
  and appears attributed in the timeline. Proves the wiring end-to-end.
- **Phase 3 — Parallel multi-agent (Acts 1–2):** all four actors contribute concurrently.
- **Phase 4 — Governance boundary (Act 3):** the policy-blocked overreach + fallback receipt.
- **Phase 5 — Continuity + return (Acts 4–5):** autonomous handoff and the confirmation-gated
  containment.
- **Phase 6 — Presenter controls + polish:** stepping, autoplay/reset, forensic drawer, mobile.

Each phase should end green on `build:host` + Vitest so the hero is always demoable.

## 9. Acceptance criteria

- [ ] A new `live-workspace-soc` bundle opens from the Runtime CTA; the old `workbench` remains
  unchanged and independently routable throughout T3 and the remaining pitch implementation.
- [ ] The analyst and at least four named agent roles are simultaneously visible with live status,
  current activity, authority, and attributed contributions.
- [ ] Agent contributions mutate the same evidence/timeline/response state the analyst sees.
- [ ] A policy-blocked overreach produces a real rejection + fallback receipt beside the proposal
  and in the full forensic ledger.
- [ ] Autonomous continuation visibly changes participation mode while preserving state authority,
  provenance, and trace.
- [ ] The final containment action cannot execute until the analyst confirms it.
- [ ] The five-act scenario supports presenter-controlled stepping and optional autoplay/reset.
- [ ] Full trace/state detail is available on demand without dominating the default experience.
- [ ] Back-navigation returns to `samples-overview`.
- [ ] `npm run build:host` + Vitest pass; Playwright validates desktop/mobile layout, readable actor
  activity, no horizontal overflow, and the complete scenario path.

## 10. Deferred cleanup (not part of T3)

After Beats 1–4 are complete, assess whether `workbench` still serves a useful developer/sample
purpose. Only then choose explicitly to keep it, move it out of the pitch catalog, deprecate it, or
remove it. That decision must include reference checks and regression validation; T3 does not
pre-commit to retirement.
