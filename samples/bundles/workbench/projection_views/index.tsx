// The workbench bundle's projection views — its `wb:` provider (self). The workbench is now a NORMAL
// json bundle (manifest/document/state authored on disk); its only native code is right here.
//
// Most views are dumb (panelGroup/regionEditor + the floor primitives the document uses). The one
// irreducibly-native view is `guestSurface`: the middle "playground" column. The Interaction ->
// Presentation -> UI pipeline is a compiler and a fired event has to cross into the live guest kernel
// — neither is expressible in the kernel's closed action grammar — so the guest is built and driven
// natively here, and the view SELF-EMITS its results (facets/regions/nodeIds/snapshot/fire/import/
// agent beats) to its own `guest-root` node, whose declarative `on` handlers fan them back into the
// `workbench`/`inspect` state the chrome + inspector subtrees read. There is no cross-kernel bridge
// and no native root anymore: one shell kernel, one native leaf view.

import "../styles.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GenUIRoot,
  liveCardsRegistry,
  readProps,
  type ProjectionView,
  type ProjectionViewProps,
} from "../../../../adapters/react/src/index";
import {
  editableRegions,
  facetsAsItems,
  liveCardsBinding,
  parseAuthoredSession,
} from "../../../../interaction/src/index";
import type { Json } from "../../../../kernel/src/index";
import { buildSession, type Session } from "../session";
import {
  authoredApplyPayload,
  inputsSignature,
  inspectSnapshot,
  nodeIdsAsOptions,
  readEdits,
  readFireRequest,
  readInputs,
  type StateReader,
} from "../bridge";
import { startAgentLoop, type AgentLoopClient } from "../agent-loop";
import { workbenchComponents } from "../bundles/shared/registry";

// --- Layout wrappers --------------------------------------------------------------
// The three columns of the shell. Pure passthrough containers that carry the classNames styles.css
// targets; all content is their declarative children.

function Shell({ children }: ProjectionViewProps) {
  return <div className="workbench">{children}</div>;
}

function Controls({ children }: ProjectionViewProps) {
  return (
    <aside className="controls">
      <header className="brand">
        <h1>GenUI Workbench</h1>
        <span className="muted">declarative chrome · agent authoring</span>
      </header>
      {children}
    </aside>
  );
}

function Artifacts({ children }: ProjectionViewProps) {
  return <section className="artifacts">{children}</section>;
}

// --- The guest surface (the one native seam) --------------------------------------

/**
 * The playground column: builds a live guest from the `workbench` inputs bound onto this node, renders
 * it, and self-emits its derived artifacts back to `guest-root`'s handlers. All three seams the closed
 * grammar can't express live here as effects over the node's bound props:
 *   A (compile): rebuild the guest when inputs change; forward event-bar fires and imports.
 *   B (reflect): stream the guest's presentation/document/tree/traces to the inspector on every render.
 *   C (agent):   run the bounded authoring tour as an ordinary client that self-emits importApply beats.
 */
function GuestSurface({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  // A read-only view of the `workbench` namespace, reconstructed from the props the node's `read`
  // edges bound, so the ported bridge helpers (which speak `workbench.<key>` paths) work unchanged.
  const state: StateReader = {
    get: (path) => node.props[path.startsWith("workbench.") ? path.slice("workbench.".length) : path] as Json | undefined,
  };

  const emitRef = useRef(emit);
  emitRef.current = emit;

  const [guest, setGuest] = useState<Session>(() => {
    const { spec, ctx, edits } = readInputs(state);
    return buildSession(spec, ctx, liveCardsBinding, edits);
  });
  const guestRef = useRef(guest);
  guestRef.current = guest;

  // Bridge A — recompile the guest whenever the input signature changes.
  const inputs = readInputs(state);
  const sig = inputsSignature(inputs);
  const lastSig = useRef(sig);
  useEffect(() => {
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    setGuest(buildSession(inputs.spec, inputs.ctx, liveCardsBinding, inputs.edits));
    emitRef.current("facetsComputed", { facets: facetsAsItems(inputs.spec) });
    // inputs/sig are recomputed each render; sig is the stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Bridge A — forward an event-bar fire onto the live guest.
  const fireSeq = Number(p.str("fireSeq")) || 0;
  const lastFire = useRef(fireSeq);
  useEffect(() => {
    if (fireSeq === lastFire.current) return;
    lastFire.current = fireSeq;
    const req = readFireRequest(state, guestRef.current.controller.getTree());
    if (!req.error && req.node) void guestRef.current.controller.emit(req.node, req.name, req.payload);
    emitRef.current("fireResult", { error: req.error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireSeq]);

  // Bridge A — parse a pasted artifact on a Load press and push its axes back as importApply.
  const importSeq = Number(p.str("importSeq")) || 0;
  const lastImport = useRef(importSeq);
  useEffect(() => {
    if (importSeq === lastImport.current) return;
    lastImport.current = importSeq;
    const parsed = parseAuthoredSession(p.str("importText"));
    if (parsed.authored) emitRef.current("importApply", authoredApplyPayload(parsed.authored));
    else emitRef.current("importResult", { error: parsed.error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importSeq]);

  // Bridge B — stream the guest's artifacts to the inspector, and refresh the node list + editable
  // regions, on first mount and every rebuild.
  useEffect(() => {
    const c = guest.controller;
    const pushInspect = () =>
      emitRef.current("snapshot", inspectSnapshot(guest, c.getTree(), c.getLastPatch(), readEdits(state)));
    const unsubscribe = c.subscribe(pushInspect);
    void c.start().then(() => {
      pushInspect();
      emitRef.current("guestChanged", { nodeIds: nodeIdsAsOptions(c.getTree()) });
      emitRef.current("regionsComputed", { regions: editableRegions(guest.presentation, readEdits(state)) });
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest]);

  // Bridge C — the autonomous authoring writer. A plain client whose `get` reads the live bound props
  // (via a ref updated each render), whose `subscribe` fires on every render (prop change), and whose
  // `emit` self-targets this node. It emits the same importApply a human import fires, so the whole
  // pipeline re-runs with zero special-casing.
  const propsRef = useRef<Record<string, Json>>(node.props);
  propsRef.current = node.props;
  const listeners = useRef(new Set<() => void>());
  const client = useMemo<AgentLoopClient>(
    () => ({
      get: (path) => propsRef.current[path.startsWith("workbench.") ? path.slice("workbench.".length) : path],
      subscribe: (l) => {
        listeners.current.add(l);
        return () => {
          listeners.current.delete(l);
        };
      },
      emit: (_node, name, payload) => emitRef.current(name, payload),
    }),
    []
  );
  useEffect(() => {
    for (const l of listeners.current) l();
  });
  useEffect(() => startAgentLoop(client), [client]);

  const agentRunning = p.bool("agentRunning");
  const agentLabel = p.str("agentLabel");
  return (
    <main className="playground">
      <header className="pg-head">
        <span>Playground</span>
        {agentRunning && agentLabel ? (
          <span className="agent-chip">{`\u{1F916} agent authoring \u00b7 ${agentLabel}`}</span>
        ) : null}
      </header>
      <div className="pg-surface">
        <GenUIRoot source={guest.controller} registry={liveCardsRegistry} />
      </div>
    </main>
  );
}

/** The workbench bundle's `wb:` provider: the custom controls plus the layout wrappers and the one
 *  native guest surface. Everything else the document uses resolves through the `ui` (floor) provider. */
const views: Record<string, ProjectionView> = {
  ...workbenchComponents,
  shell: Shell,
  controls: Controls,
  artifacts: Artifacts,
  guestSurface: GuestSurface,
};

export default views;
