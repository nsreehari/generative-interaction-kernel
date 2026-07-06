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
import {
  GenUIRoot,
  liveCardsRegistry,
  loadBundleRuntime,
  overlayRegistry,
  primitiveRegistry,
  seedState,
} from "../../../adapters/react/src/index";
import {
  Kernel,
  GenUIClient,
  KernelTransportHost,
  createInMemoryTransportPair,
} from "../../../kernel/src/index";
import {
  liveCardsBinding,
  editableRegions,
  facetsAsItems,
  parseAuthoredSession,
} from "../../../interaction/src/index";
import { buildSession, type Session } from "./session";
import {
  authoredApplyPayload,
  chromeBundle,
  inspectBundle,
  inputsSignature,
  inspectSnapshot,
  nodeIdsAsOptions,
  readEdits,
  readFireRequest,
  readInputs,
  type StateReader,
} from "./chrome";
import { AGENT_PLAYLIST, isAgentTourComplete, nextAgentIndex } from "./agent";
import { workbenchComponents } from "./profile/registry";

interface HostedChromeRuntime {
  source: GenUIClient;
  agent: GenUIClient;
  seed: StateReader;
  start(): Promise<void>;
  stop(): void;
}

function createHostedChromeRuntime(): HostedChromeRuntime {
  const state = seedState(chromeBundle.manifest, chromeBundle.state);
  const kernel = new Kernel(chromeBundle.manifest, chromeBundle.document, { state });
  const host = new KernelTransportHost(chromeBundle.manifest, chromeBundle.document, kernel);
  const [renderHostTransport, renderClientTransport] = createInMemoryTransportPair();
  const [agentHostTransport, agentClientTransport] = createInMemoryTransportPair();
  const source = new GenUIClient(renderClientTransport);
  const agent = new GenUIClient(agentClientTransport);
  let started = false;

  return {
    source,
    agent,
    seed: state,
    async start() {
      if (started) return;
      started = true;
      source.start();
      agent.start();
      await host.attach(renderHostTransport);
      await host.attach(agentHostTransport);
    },
    stop() {
      agent.stop();
      source.stop();
      host.stop();
      started = false;
    },
  };
}

export function Workbench() {
  const chrome = useMemo(() => createHostedChromeRuntime(), []);
  const inspect = useMemo(() => loadBundleRuntime(inspectBundle), []);
  // The floor primitives plus the workbench's own capability views — the chrome and inspect bundles
  // both render through this overlay (see ADR-0031).
  const workbenchRegistry = useMemo(
    () => overlayRegistry(primitiveRegistry, workbenchComponents),
    []
  );
  const [guest, setGuest] = useState<Session>(() => {
    const { spec, ctx, edits } = readInputs(chrome.seed);
    return buildSession(spec, ctx, liveCardsBinding, edits);
  });
  // What the agent is doing right now, surfaced over the playground so the cause of the live changes
  // is explicit (fed by bridge C from chrome state).
  const [agentView, setAgentView] = useState<{ running: boolean; label: string }>({
    running: false,
    label: "",
  });

  // The chrome bridge reads the live guest through a ref (it subscribes to chrome only once).
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const lastSig = useRef<string>(inputsSignature(readInputs(chrome.seed)));
  const lastFireSeq = useRef<number>(Number(chrome.seed.get("workbench.fireSeq")) || 0);
  const lastImportSeq = useRef<number>(Number(chrome.seed.get("workbench.importSeq")) || 0);
  // Agent tour state (Slice 4): the running flag + tour index + a step-button sequence guard.
  const agentRunning = useRef<boolean>(false);
  const agentIndex = useRef<number>(Number(chrome.seed.get("workbench.agentStep")) || 0);
  const lastAgentStepSeq = useRef<number>(Number(chrome.seed.get("workbench.agentStepSeq")) || 0);

  // Bridge A (chrome -> guest): rebuild the guest when inputs change; forward event-bar fires.
  useEffect(() => {
    const c = chrome.source;
    const onChange = () => {
      const inputs = readInputs(c);
      const sig = inputsSignature(inputs);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        setGuest(buildSession(inputs.spec, inputs.ctx, liveCardsBinding, inputs.edits));
        void c.emit("chrome-root", "facetsComputed", { facets: facetsAsItems(inputs.spec) });
      }
      const seq = Number(c.get("workbench.fireSeq")) || 0;
      if (seq !== lastFireSeq.current) {
        lastFireSeq.current = seq;
        const req = readFireRequest(c, guestRef.current.controller.getTree());
        if (!req.error && req.node) {
          void guestRef.current.controller.emit(req.node, req.name, req.payload);
        }
        void c.emit("chrome-root", "fireResult", { error: req.error });
      }
      // Import: on a Load press, parse the pasted artifact and push its axes back into chrome state
      // (importApply), which trips the signature check above on the next tick and rebuilds the guest.
      const iseq = Number(c.get("workbench.importSeq")) || 0;
      if (iseq !== lastImportSeq.current) {
        lastImportSeq.current = iseq;
        const parsed = parseAuthoredSession(String(c.get("workbench.importText") ?? ""));
        if (parsed.authored) {
          void c.emit("chrome-root", "importApply", authoredApplyPayload(parsed.authored));
        } else {
          void c.emit("chrome-root", "importResult", { error: parsed.error });
        }
      }
    };
    const unsubscribe = c.subscribe(onChange);
    void chrome.start();
    return () => {
      unsubscribe();
      chrome.stop();
    };
  }, [chrome]);

  // Bridge B (guest -> inspect): stream artifacts on every guest render; refresh the node list once.
  useEffect(() => {
    const c = guest.controller;
    const pushInspect = () => {
      void inspect.controller.emit(
        "inspect-root",
        "snapshot",
        inspectSnapshot(guest, c.getTree(), c.getLastPatch(), readEdits(chrome.source))
      );
    };
    const unsubscribe = c.subscribe(pushInspect);
    void c.start().then(() => {
      pushInspect();
      void chrome.source.emit("chrome-root", "guestChanged", {
        nodeIds: nodeIdsAsOptions(c.getTree()),
      });
      // Refresh the editing surface with this guest's effective regions (fires on first mount and
      // on every rebuild, so re-planning after any input/edit re-derives the editable list).
      void chrome.source.emit("chrome-root", "regionsComputed", {
        regions: editableRegions(guest.presentation, readEdits(chrome.source)),
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
    const c = chrome.agent;
    // Advance one beat. The tour is bounded: at the last beat `nextAgentIndex` returns null, so we
    // emit `agentDone` (which stops the run and shows a "complete" state) instead of wrapping.
    const advance = () => {
      const next = nextAgentIndex(agentIndex.current);
      if (next === null) {
        void c.emit("chrome-root", "agentDone", {});
        return;
      }
      agentIndex.current = next;
      const step = AGENT_PLAYLIST[next];
      void c.emit("chrome-root", "importApply", authoredApplyPayload(step.authored));
      void c.emit("chrome-root", "agentAdvance", { step: next, label: step.label });
    };
    const onChange = () => {
      const wasRunning = agentRunning.current;
      agentRunning.current = Boolean(c.get("workbench.agentRunning"));
      const running = agentRunning.current;
      // A fresh Play on a finished tour replays from the top (reset so the next advance yields beat 0).
      if (running && !wasRunning && isAgentTourComplete(agentIndex.current)) {
        agentIndex.current = -1;
      }
      const label = String(c.get("workbench.agentLabel") ?? "");
      setAgentView((prev) => (prev.running === running && prev.label === label ? prev : { running, label }));
      const seq = Number(c.get("workbench.agentStepSeq")) || 0;
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
        <GenUIRoot source={chrome.source} registry={workbenchRegistry} />
      </aside>

      <main className="playground">
        <header className="pg-head">
          <span>Playground</span>
          {agentView.running && agentView.label ? (
            <span className="agent-chip">{`\u{1F916} agent authoring \u00b7 ${agentView.label}`}</span>
          ) : null}
        </header>
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
