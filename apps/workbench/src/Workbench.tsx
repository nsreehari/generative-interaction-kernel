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
  buildChromeRuntime,
  buildInspectRuntime,
  facetsAsItems,
  inputsSignature,
  inspectSnapshot,
  nodeIdsAsOptions,
  readFireRequest,
  readInputs,
} from "./chrome";
import { workbenchRegistry } from "./profile/registry";

export function Workbench() {
  const chrome = useMemo(() => buildChromeRuntime(), []);
  const inspect = useMemo(() => buildInspectRuntime(), []);
  const [guest, setGuest] = useState<Session>(() => {
    const { spec, ctx } = readInputs(chrome.state);
    return buildSession(spec, ctx, liveCardsBinding);
  });

  // The chrome bridge reads the live guest through a ref (it subscribes to chrome only once).
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const lastSig = useRef<string>(inputsSignature(readInputs(chrome.state)));
  const lastFireSeq = useRef<number>(Number(chrome.state.get("workbench.fireSeq")) || 0);

  // Bridge A (chrome -> guest): rebuild the guest when inputs change; forward event-bar fires.
  useEffect(() => {
    const c = chrome.controller;
    const onChange = () => {
      const inputs = readInputs(chrome.state);
      const sig = inputsSignature(inputs);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        setGuest(buildSession(inputs.spec, inputs.ctx, liveCardsBinding));
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
        inspectSnapshot(guest, c.getTree(), c.getLastPatch())
      );
    };
    const unsubscribe = c.subscribe(pushInspect);
    void c.start().then(() => {
      pushInspect();
      void chrome.controller.emit("chrome-root", "guestChanged", {
        nodeIds: nodeIdsAsOptions(c.getTree()),
      });
    });
    return unsubscribe;
  }, [guest, inspect, chrome]);

  return (
    <div className="workbench">
      <aside className="controls">
        <header className="brand">
          <h1>GenUI Workbench</h1>
          <span className="muted">declarative chrome · slice 3</span>
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
