// The workbench host. The chrome is now fully declarative — every column is a GenUI app rendered
// by the same kernel + React adapter, with the workbench dogfooding the platform:
//
//   chrome runtime (controls + event bar, `workbench` state)
//         │  bridge A: read state -> run the pure pipeline -> build a guest document; forward fires
//         ▼
//   guest runtime (the playground)
//         │  bridge B: stream the guest's artifacts (presentation/document/tree/traces) as events
//         ▼
//   inspect runtime (the artifact tabs, `inspect` state)
//
// The two bridges are the only imperative seams, and they must be: the Interaction->Presentation->UI
// pipeline is a compiler, and a fired event has to cross from the chrome kernel to the guest kernel —
// neither is expressible in the kernel's closed action grammar.

import { useEffect, useMemo, useRef, useState } from "react";
import { GenUIRoot, liveCardsRegistry } from "../../../adapters/react/src/index";
import { liveCardsBinding } from "../../../interaction/src/index";
import { buildSession, type Session } from "./session";
import {
  authoredApplyPayload,
  buildChromeRuntime,
  buildInspectRuntime,
  editableRegions,
  facetsAsItems,
  inputsSignature,
  inspectSnapshot,
  nodeIdsAsOptions,
  readEdits,
  readFireRequest,
  readInputs,
} from "./chrome";
import { parseAuthoredSession } from "./export";
import { AGENT_PLAYLIST, nextAgentIndex } from "./agent";
import { workbenchRegistry } from "./profile/registry";

export function Workbench() {
  const chrome = useMemo(() => buildChromeRuntime(), []);
  const inspect = useMemo(() => buildInspectRuntime(), []);
  const [guest, setGuest] = useState<Session>(() => {
    const { spec, ctx, edits } = readInputs(chrome.state);
    return buildSession(spec, ctx, liveCardsBinding, edits);
  });

  // The chrome bridge reads the live guest through a ref (it subscribes to chrome only once).
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const lastSig = useRef<string>(inputsSignature(readInputs(chrome.state)));
  const lastFireSeq = useRef<number>(Number(chrome.state.get("workbench.fireSeq")) || 0);
  const lastImportSeq = useRef<number>(Number(chrome.state.get("workbench.importSeq")) || 0);
  // Agent tour state (Slice 4): the running flag + tour index + a step-button sequence guard.
  const agentRunning = useRef<boolean>(false);
  const agentIndex = useRef<number>(Number(chrome.state.get("workbench.agentStep")) || 0);
  const lastAgentStepSeq = useRef<number>(Number(chrome.state.get("workbench.agentStepSeq")) || 0);

  // Bridge A (chrome -> guest): rebuild the guest when inputs change; forward event-bar fires.
  useEffect(() => {
    const c = chrome.controller;
    const onChange = () => {
      const inputs = readInputs(chrome.state);
      const sig = inputsSignature(inputs);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        setGuest(buildSession(inputs.spec, inputs.ctx, liveCardsBinding, inputs.edits));
        void c.emit("chrome-root", "facetsComputed", { facets: facetsAsItems(inputs.spec) });
      }
      const seq = Number(chrome.state.get("workbench.fireSeq")) || 0;
      if (seq !== lastFireSeq.current) {
        lastFireSeq.current = seq;
        const req = readFireRequest(chrome.state, guestRef.current.controller.getTree());
        if (!req.error && req.node) {
          void guestRef.current.controller.emit(req.node, req.name, req.payload);
        }
        void c.emit("chrome-root", "fireResult", { error: req.error });
      }
      // Import: on a Load press, parse the pasted artifact and push its axes back into chrome state
      // (importApply), which trips the signature check above on the next tick and rebuilds the guest.
      const iseq = Number(chrome.state.get("workbench.importSeq")) || 0;
      if (iseq !== lastImportSeq.current) {
        lastImportSeq.current = iseq;
        const parsed = parseAuthoredSession(String(chrome.state.get("workbench.importText") ?? ""));
        if (parsed.authored) {
          void c.emit("chrome-root", "importApply", authoredApplyPayload(parsed.authored));
        } else {
          void c.emit("chrome-root", "importResult", { error: parsed.error });
        }
      }
    };
    const unsubscribe = c.subscribe(onChange);
    void c.start();
    return unsubscribe;
  }, [chrome]);

  // Bridge B (guest -> inspect): stream artifacts on every guest render; refresh the node list once.
  useEffect(() => {
    const c = guest.controller;
    const pushInspect = () => {
      void inspect.controller.emit(
        "inspect-root",
        "snapshot",
        inspectSnapshot(guest, c.getTree(), c.getLastPatch(), readEdits(chrome.state))
      );
    };
    const unsubscribe = c.subscribe(pushInspect);
    void c.start().then(() => {
      pushInspect();
      void chrome.controller.emit("chrome-root", "guestChanged", {
        nodeIds: nodeIdsAsOptions(c.getTree()),
      });
      // Refresh the editing surface with this guest's effective regions (fires on first mount and
      // on every rebuild, so re-planning after any input/edit re-derives the editable list).
      void chrome.controller.emit("chrome-root", "regionsComputed", {
        regions: editableRegions(guest, readEdits(chrome.state)),
      });
    });
    return unsubscribe;
  }, [guest, inspect, chrome]);

  // Bridge C (agent -> chrome): the autonomous authoring writer. It is deliberately "just another
  // client emitting events" — each beat emits the same `importApply` a human import fires, so the
  // whole pipeline re-runs and the guest re-renders with zero special-casing. Play/Pause flip a flag
  // this loop watches; Step advances one beat on demand. The identical loop could target a
  // GenUIClient over a transport instead of the in-process controller (same `emit` surface).
  useEffect(() => {
    const c = chrome.controller;
    const advance = () => {
      const next = nextAgentIndex(agentIndex.current);
      agentIndex.current = next;
      const step = AGENT_PLAYLIST[next];
      void c.emit("chrome-root", "importApply", authoredApplyPayload(step.authored));
      void c.emit("chrome-root", "agentAdvance", { step: next, label: step.label });
    };
    const onChange = () => {
      agentRunning.current = Boolean(chrome.state.get("workbench.agentRunning"));
      const seq = Number(chrome.state.get("workbench.agentStepSeq")) || 0;
      if (seq !== lastAgentStepSeq.current) {
        lastAgentStepSeq.current = seq;
        advance();
      }
    };
    const unsubscribe = c.subscribe(onChange);
    const timer = window.setInterval(() => {
      if (agentRunning.current) advance();
    }, 1800);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [chrome]);

  return (
    <div className="workbench">
      <aside className="controls">
        <header className="brand">
          <h1>GenUI Workbench</h1>
          <span className="muted">declarative chrome · agent authoring</span>
        </header>
        <GenUIRoot source={chrome.controller} registry={workbenchRegistry} />
      </aside>

      <main className="playground">
        <header className="pg-head">Playground</header>
        <div className="pg-surface">
          <GenUIRoot source={guest.controller} registry={liveCardsRegistry} />
        </div>
      </main>

      <section className="artifacts">
        <GenUIRoot source={inspect.controller} registry={workbenchRegistry} />
      </section>
    </div>
  );
}
