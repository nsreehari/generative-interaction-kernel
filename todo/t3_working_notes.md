# T3 — Live Workspace : SOC — working notes

> Scope: **Beat 2** of the 4-Beat pitch IA (see `working-doc.md` D3). Refocus the `workbench`
> bundle into **Live Workspace : SOC**, the runtime-plane hero. It must prove HX+AX symbiosis,
> continuous governance (inside/outside the loop), and trace forensics (including rejected
> hallucinations).
>
> Status: PLANNING (no bundle edits yet). This file details the architecture of the new bundle.

---

## 1. Job of this bundle

Be the irrefutable evidence of the product contract established in Beat 1.

It must prove the **Canonical Moat**: humans and agents share one evolving state under the same
governed authority. It does this by physically splitting the screen to show both faces of the
same running state:
- What the human sees (the rendered analyst UI)
- What the system knows (the semantic shadow tree and trace)

We are NOT building a real SOC tool. We are building a *governance simulation* that plays a
controlled scenario proving the physics.

## 2. Current state of `workbench` (to retire vs reuse)

- **Retire:** The entire "Studio" metaphor. Eliminate the layout/interaction kind form, the generic
  JSON document editor, the generic bundle selector, and the "Authored Session" concept. This is
  no longer an authoring tool.
- **Reuse:** The projection infra (`demo:workbench`), the 3-pane responsive layout shell, the
  underlying capability resolution loop.
- **Rename:** `workbench` becomes `live-workspace-soc`. (Requires changes to `registry.json` and
  references in `samples-overview` and `console`).

## 3. The 3-Pane Layout

The layout is a dashboard proving the dual-face architecture:

1. **Pane 1 (HX / Human Experience): The Guided UI**
   - The rendered view of the document.
   - Shows trusted evidence (the phishing alert details).
   - Shows an actionable button: "Isolate Host" (but disabled or hidden behind a confirmation).

2. **Pane 2 (AX / Agent Experience): The Semantic Shadow Graph**
   - A live, readable view of the state the agent sees.
   - Not raw JSON, but a visual representation of the graph (e.g., nodes for 'Alert', 'Host',
     'Finding', 'Capabilities').
   - Visualizes when the agent proposes a 'derive' or 'route' action against this graph.

3. **Pane 3: Trace / Forensics (The Moat)**
   - A scrolling, immutable log of the reducer's activity.
   - `[PROPOSED]` -> `[VALIDATED]` -> `[PATCHED]`
   - This must be the most prominent, convincing part of the screen.

## 4. The Governed SOC Scenario (The Script)

The bundle should auto-play or step-through this exact sequence to prove the claims:

**Step 1: Inside the loop (Shared Investigation)**
- *Context:* Initial intent loaded: "Investigate unusual lateral movement from Host-A."
- *Trace:* `[PROPOSED]` Agent queries SIEM. `[VALIDATED]` tool execution. `[PATCHED]` Graph updates
  with new evidence.
- *HX:* UI updates to show new log data in the context of the alert.
- *AX:* Shadow graph lights up a new 'Finding' node linked to 'Host-A'.

**Step 2: The Rejected Hallucination (Deterministic Fallback)**
- *Context:* The agent makes a bounded error.
- *Trace:* `[PROPOSED]` Agent attempts to isolate the core Domain Controller.
- *Trace:* `[REJECTED]` Policy engine blocks action (Domain Controller is in protected class).
  Fallback applied.
- *HX:* A safe, governed note appears: "Agent recommended isolation, but target is protected."
- *Proof:* The system, not the LLM, is the authority.

**Step 3: Outside the loop (Autonomous Continuation)**
- *Context:* The analyst explicitly transitions the task.
- *HX:* Analyst clicks "Continue investigation asynchronously." The UI minimizes.
- *Trace:* `[MODE SHIFT]` Agent transitions to autonomous monitoring.
- *Proof:* The trace continues to glow. The shadow graph continues to evolve. Governance holds.

**Step 4: The Governed Return (Confirmation)**
- *Context:* The agent finds conclusive evidence necessitating action.
- *Trace:* `[PROPOSED]` Execute 'Isolate Host-A'.
- *Trace:* `[CONFIRM]` Action blocked pending human approval.
- *HX:* The workspace alerts the analyst. A clear, bounded "Approve Isolation of Host-A"
  button appears, attached to the exact evidence chain.

## 5. Implementation Strategy (The "Simulated" Kernel)

We cannot wire up a real LLM or real SIEM. The scenario must be a **controlled simulation**
driven by a script, but it must pass through the *real* kernel mechanisms.

1. **State:** The bundle `document.json` pre-loads the initial state.
2. **Simulation Runner:** A timed or click-through step engine in the projection view.
3. **Faking the Agent:** The simulation runner dispatches real GIK intents/events (e.g., `derive`,
  `route`, `invoke`) as if an agent had emitted them.
4. **Real Validation:** The kernel's *actual* schemas and validation logic process the simulated
  events, proving the trace is real. We deliberately send a bad event to trigger the rejection.

## 6. Acceptance Criteria

- [ ] Bundle renamed from `workbench` to `live-workspace-soc` site-wide.
- [ ] 3-pane layout established (HX UI / AX Graph / Trace).
- [ ] Studio/authoring chrome completely removed.
- [ ] Simulation script accurately plays the 4-step SOC scenario.
- [ ] The "Rejected Hallucination" appears clearly as a red `[REJECTED]` block in the trace.
- [ ] The "Confirmation" boundary is visibly enforced before the final action.
- [ ] Back-navigation ("← Return to Overview") is present.