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
//
// The whole thing is exported as `WorkbenchRoot` — a native React root the generic host mounts by id
// (see samples/apps/host). The workbench is the platform's one irreducibly-native composition: it
// stands up the chrome + inspect leaf bundles and compiles a live guest at runtime, and the two
// cross-kernel bridges stay inside this component (ADR-0030/0032) — the wiring the closed action
// grammar can't express. There is no generic "composition bundle" type; this native seam is local to
// the workbench and mounted directly.

import "./styles.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GenUIRoot,
  buildBundleRegistry,
  liveCardsRegistry,
  loadBundleRuntime,
  seedState,
} from "../../../adapters/react/src/index";
import {
  Kernel,
  GenUIClient,
  KernelTransportHost,
  createInMemoryTransportPair,
} from "../../../kernel/src/index";
import { SseClientTransport } from "../../../transports/http-sse/src/client";
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
  inputsSignature,
  nodeIdsAsOptions,
  readEdits,
  readFireRequest,
  readInputs,
  type StateReader,
} from "./bundles/chrome/chrome";
import { inspectBundle, inspectSnapshot } from "./bundles/inspect/inspect";
import { startAgentLoop } from "./agent-loop";

interface HostedChromeRuntime {
  source: GenUIClient;
  seed: StateReader;
  agent?: GenUIClient;
  start(): Promise<void>;
  stop(): void;
}

function createLocalChromeRuntime(): HostedChromeRuntime {
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

function createRemoteChromeRuntime(baseUrl: string): HostedChromeRuntime {
  const source = new GenUIClient(new SseClientTransport(baseUrl));
  const seed = seedState(chromeBundle.manifest, chromeBundle.state);
  let started = false;

  return {
    source,
    seed,
    async start() {
      if (started) return;
      started = true;
      source.start();
    },
    stop() {
      source.stop();
      started = false;
    },
  };
}

function createChromeRuntime(): HostedChromeRuntime {
  const remoteBaseUrl = import.meta.env.VITE_GUP_BASE_URL as string | undefined;
  return remoteBaseUrl ? createRemoteChromeRuntime(remoteBaseUrl) : createLocalChromeRuntime();
}

export function WorkbenchRoot() {
  const chrome = useMemo(() => createChromeRuntime(), []);
  const inspect = useMemo(() => loadBundleRuntime(inspectBundle), []);
  // The chrome and inspect bundles are self-contained: each resolves every `alias:name` capability
  // through its own manifest `externals` — floor primitives under `ui`, the workbench's own
  // panelGroup/regionEditor views (attached as bundle components) under `wb` (from self).
  const chromeRegistry = useMemo(() => buildBundleRegistry(chromeBundle), []);
  const inspectRegistry = useMemo(() => buildBundleRegistry(inspectBundle), []);
  const [guest, setGuest] = useState<Session>(() => {
    const { spec, ctx, edits } = readInputs(chrome.seed);
    return buildSession(spec, ctx, liveCardsBinding, edits);
  });
  // The three cross-kernel seams the closed grammar can't express are each consolidated into a
  // named, self-contained native hook (ADR-0034) rather than smeared across this root as ad-hoc
  // effects + refs: chrome->guest compilation (A), guest->inspect reflection (B), and the external
  // agent actor (C). They are the platform's small, audited native escape hatch — not app behavior.
  useCompileBridge(chrome, guest, setGuest);
  useInspectBridge(chrome, guest, inspect);
  const agentView = useAgentBridge(chrome);

  return (
    <div className="workbench">
      <aside className="controls">
        <header className="brand">
          <h1>GenUI Workbench</h1>
          <span className="muted">declarative chrome · agent authoring</span>
        </header>
        <GenUIRoot source={chrome.source} registry={chromeRegistry} />
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
        <GenUIRoot source={inspect.controller} registry={inspectRegistry} />
      </section>
    </div>
  );
}

// Bridge A (chrome -> guest): rebuild the guest when chrome inputs change; forward event-bar fires
// and imports. Cross-kernel by nature (chrome may be a remote runtime), so it subscribes to the
// chrome client and runs the buildSession compiler natively — the irreducible author-intent ->
// interpreter-product seam the closed grammar cannot express (ADR-0034).
function useCompileBridge(
  chrome: HostedChromeRuntime,
  guest: Session,
  setGuest: (session: Session) => void
): void {
  // Subscribes to chrome only once, so it reads the live guest through a ref.
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const lastSig = useRef<string>(inputsSignature(readInputs(chrome.seed)));
  const lastFireSeq = useRef<number>(Number(chrome.seed.get("workbench.fireSeq")) || 0);
  const lastImportSeq = useRef<number>(Number(chrome.seed.get("workbench.importSeq")) || 0);

  useEffect(() => {
    const c = chrome.source;
    const onChange = () => {
      const inputs = readInputs(c);
      const sig = inputsSignature(inputs);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        setGuest(buildSession(inputs.spec, inputs.ctx, liveCardsBinding, inputs.edits));
        void c.emit("chrome-root", "facetsComputed", {
          facets: facetsAsItems(inputs.spec),
        });
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
}

// Bridge B (guest -> inspect): stream the guest's rendered artifacts into the inspect runtime on
// every guest render, and refresh chrome's node list + editable regions once per rebuild. This is
// render reflection (reading a runtime's resolved tree / last patch) — a native devtools concern the
// grammar intentionally keeps off the app surface (ADR-0034).
function useInspectBridge(
  chrome: HostedChromeRuntime,
  guest: Session,
  inspect: ReturnType<typeof loadBundleRuntime>
): void {
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
}

// Bridge C (agent -> chrome): the autonomous authoring writer, deliberately "just another client
// emitting events" — each beat emits the same importApply a human import fires, so the whole pipeline
// re-runs with zero special-casing. It stays an external actor (ADR-0034), never part of the
// document; this hook only mirrors its running/label state up for the playground chip.
function useAgentBridge(chrome: HostedChromeRuntime): { running: boolean; label: string } {
  const [agentView, setAgentView] = useState<{ running: boolean; label: string }>({
    running: false,
    label: "",
  });
  const agentRunning = useRef<boolean>(false);

  useEffect(() => {
    const stateSource = chrome.agent ?? chrome.source;
    const onChange = () => {
      agentRunning.current = Boolean(stateSource.get("workbench.agentRunning"));
      const running = agentRunning.current;
      const label = String(stateSource.get("workbench.agentLabel") ?? "");
      setAgentView((prev) => (prev.running === running && prev.label === label ? prev : { running, label }));
    };
    const unsubscribe = stateSource.subscribe(onChange);
    const stopAgentLoop = chrome.agent ? startAgentLoop(chrome.agent) : undefined;
    onChange();
    return () => {
      unsubscribe();
      stopAgentLoop?.();
    };
  }, [chrome]);

  return agentView;
}

