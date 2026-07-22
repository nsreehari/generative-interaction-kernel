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

import { useEffect, useMemo, useRef, useState } from "react";
import { makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import {
  GenUIRoot,
  readProps,
  type ProjectionView,
  type ProjectionViewProps,
} from "@gik/react";
import { liveCardsRegistry } from "../../floor/projection_views/profile";
import { editableRegions, facetsAsItems } from "./libs/edits";
import { checkAuthoredProfile, parseAuthoredSession } from "./libs/authoring";
import type { Json } from "@gik/kernel";
import type { InteractionTaxonomy } from "@gik/profile";
import { buildSession, type Session } from "./runtime/session";
import {
  authoredApplyPayload,
  inputsSignature,
  inspectSnapshot,
  nodeIdsAsOptions,
  readEdits,
  readFireRequest,
  readInputs,
  type StateReader,
} from "./runtime/bridge";
import { startAgentLoop, type AgentLoopClient } from "./runtime/agent-loop";
import { workbenchComponents } from "./bundles/registry";
import { sampleBlueprintProfiles } from "../../../catalog/profile-catalog";

function selectedProfile(profileId: string) {
  return sampleBlueprintProfiles[profileId] ?? sampleBlueprintProfiles["live-cards"];
}

const useStyles = makeStyles({
  shell: {
    display: "grid",
    gridTemplateColumns: "300px 1fr 420px",
    minHeight: "100vh",
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    selectors: {
      "& label": {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXXS,
        marginBottom: tokens.spacingVerticalS,
        fontSize: tokens.fontSizeBase100,
      },
      "& select": {
        backgroundColor: "var(--field-bg)",
        color: "var(--text)",
        ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
        borderRadius: tokens.borderRadiusMedium,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalSNudge}`,
        font: "inherit",
      },
      "& input": {
        backgroundColor: "var(--field-bg)",
        color: "var(--text)",
        ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
        borderRadius: tokens.borderRadiusMedium,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalSNudge}`,
        font: "inherit",
      },
      "& textarea": {
        backgroundColor: "var(--field-bg)",
        color: "var(--text)",
        ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
        borderRadius: tokens.borderRadiusMedium,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalSNudge}`,
        font: "inherit",
        resize: "vertical",
        fontFamily: tokens.fontFamilyMonospace,
      },
      "& button": {
        backgroundColor: tokens.colorNeutralBackground3,
        color: "var(--text)",
        ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
        borderRadius: tokens.borderRadiusMedium,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
        cursor: "pointer",
        font: "inherit",
      },
      "& button:hover": { backgroundColor: tokens.colorNeutralBackground3Hover },
      "& button:disabled": { opacity: 0.5, cursor: "default" },
      "& .gx-panel": {
        borderTopWidth: tokens.strokeWidthThin,
        borderTopStyle: "solid",
        borderTopColor: "var(--line)",
        padding: `${tokens.spacingVerticalM} 0`,
      },
      "& .gx-panel-title": {
        fontSize: tokens.fontSizeBase100,
        textTransform: "uppercase",
        letterSpacing: ".5px",
        color: "var(--muted)",
        margin: `0 0 ${tokens.spacingVerticalS}`,
      },
      "& .gx-note": { margin: `${tokens.spacingVerticalXS} 0` },
      "& .gx-note-error": { color: "var(--bad)" },
      "& .error": { color: "var(--bad)" },
      "& .gx-note-muted": { color: "var(--muted)" },
      "& .muted": { color: "var(--muted)" },
      "& .gx-tabs": {
        display: "flex",
        gap: tokens.spacingHorizontalXXS,
        marginBottom: tokens.spacingVerticalS,
        flexWrap: "wrap",
      },
      "& .tabs": {
        display: "flex",
        gap: tokens.spacingHorizontalXXS,
        marginBottom: tokens.spacingVerticalS,
        flexWrap: "wrap",
      },
      "& .gx-tabs button": {
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
        fontSize: tokens.fontSizeBase100,
      },
      "& .tabs button": {
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
        fontSize: tokens.fontSizeBase100,
      },
      "& .gx-tabs button.active": {
        ...shorthands.borderColor("var(--accent)"),
        color: tokens.colorNeutralForegroundOnBrand,
        backgroundColor: tokens.colorBrandBackground,
      },
      "& .tabs button.active": {
        ...shorthands.borderColor("var(--accent)"),
        color: tokens.colorNeutralForegroundOnBrand,
        backgroundColor: tokens.colorBrandBackground,
      },
      "& ul.gx-list": { listStyle: "none", margin: `${tokens.spacingVerticalXS} 0 0`, padding: 0 },
      "& ol.gx-list": { margin: `${tokens.spacingVerticalXS} 0 0`, paddingLeft: tokens.spacingHorizontalXL },
      "& .gx-list": { fontSize: tokens.fontSizeBase100 },
      "& .gx-list li": { padding: `${tokens.spacingVerticalXXS} 0` },
      "& .gx-list li.selected": {
        backgroundColor: tokens.colorBrandBackground2,
        color: tokens.colorNeutralForegroundOnBrand,
        borderRadius: tokens.borderRadiusMedium,
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalSNudge}`,
      },
      "& .gx-list-row": {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalSNudge,
        width: "100%",
        textAlign: "left",
        backgroundColor: "transparent",
        border: "none",
        padding: 0,
        color: "inherit",
        font: "inherit",
      },
      "& .gx-list-secondary": { color: "var(--muted)" },
      "& .gx-list-value": { color: "var(--muted)" },
      "& .gx-badge": {
        fontSize: tokens.fontSizeBase100,
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalSNudge}`,
        borderRadius: tokens.borderRadiusCircular,
        backgroundColor: tokens.colorNeutralBackground3,
        color: "var(--muted)",
      },
      "& .tag": {
        fontSize: tokens.fontSizeBase100,
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalSNudge}`,
        borderRadius: tokens.borderRadiusCircular,
        backgroundColor: tokens.colorNeutralBackground3,
        color: "var(--muted)",
      },
      "& .gx-badge-required": { backgroundColor: tokens.colorPaletteGreenBackground1, color: tokens.colorPaletteGreenForeground1 },
      "& .tag.req": { backgroundColor: tokens.colorPaletteGreenBackground1, color: tokens.colorPaletteGreenForeground1 },
      "& .gx-badge-optional": { backgroundColor: tokens.colorPaletteDarkOrangeBackground1, color: tokens.colorPaletteDarkOrangeForeground1 },
      "& .tag.opt": { backgroundColor: tokens.colorPaletteDarkOrangeBackground1, color: tokens.colorPaletteDarkOrangeForeground1 },
      "& .gx-badge-action": { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground2 },
      "& .gx-badge-transition": { backgroundColor: tokens.colorPaletteBerryBackground2, color: tokens.colorPaletteBerryForeground2 },
      "& .gx-badge-effect": { backgroundColor: tokens.colorPaletteMarigoldBackground2, color: tokens.colorPaletteMarigoldForeground2 },
      "& .gx-badge-resolve": {
        backgroundColor: tokens.colorNeutralBackground3,
        color: "var(--muted)",
      },
      "& .gx-badge-fallback": {
        backgroundColor: tokens.colorNeutralBackground3,
        color: "var(--muted)",
      },
      "& .gx-badge-validate": {
        backgroundColor: tokens.colorNeutralBackground3,
        color: "var(--muted)",
      },
      "& .gx-table": { width: "100%", borderCollapse: "collapse", fontSize: tokens.fontSizeBase100 },
      "& .gx-table th": {
        textAlign: "left",
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalSNudge}`,
        borderBottomWidth: tokens.strokeWidthThin,
        borderBottomStyle: "solid",
        borderBottomColor: "var(--line)",
        verticalAlign: "top",
        color: "var(--muted)",
        fontWeight: tokens.fontWeightSemibold,
      },
      "& .gx-table td": {
        textAlign: "left",
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalSNudge}`,
        borderBottomWidth: tokens.strokeWidthThin,
        borderBottomStyle: "solid",
        borderBottomColor: "var(--line)",
        verticalAlign: "top",
      },
      "& .region-editor ul": { listStyle: "none", margin: `${tokens.spacingVerticalXS} 0 0`, padding: 0 },
      "& .region-editor li": {
        padding: `${tokens.spacingVerticalXS} 0`,
        borderBottomWidth: tokens.strokeWidthThin,
        borderBottomStyle: "solid",
        borderBottomColor: "var(--line)",
        borderTopWidth: tokens.strokeWidthThin,
        borderTopStyle: "solid",
        borderTopColor: "transparent",
      },
      "& .region-editor li.off": { opacity: 0.55 },
      "& .region-editor li.drop-target": { borderTopColor: "var(--accent)" },
      "& .region-toggle": { flexDirection: "row", alignItems: "center", gap: tokens.spacingHorizontalSNudge, margin: `0 0 ${tokens.spacingVerticalXS}` },
      "& .region-toggle input": { width: "auto" },
      "& .region-toggle code": { flex: 1 },
      "& .drag-grip": {
        cursor: "grab",
        color: "var(--muted)",
        fontSize: tokens.fontSizeBase200,
        lineHeight: 1,
        userSelect: "none",
        padding: `0 ${tokens.spacingHorizontalXXS}`,
      },
      "& .drag-grip:active": { cursor: "grabbing" },
      "& .region-controls": { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS },
      "& .region-controls select": { flex: 1, minWidth: 0, padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}` },
      "& .region-controls button": { padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`, lineHeight: 1 },
      "& .scroll": { overflow: "auto", flex: 1 },
      "& .gx-code": { overflow: "auto", flex: 1 },
      "& pre": {
        margin: 0,
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: tokens.fontSizeBase100,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      },
      "& .pri-primary": { color: "var(--good)" },
      "& .pri-secondary": { color: "var(--warn)" },
      "& .pri-tertiary": { color: "var(--muted)" },
      "& code": { fontFamily: tokens.fontFamilyMonospace, color: "var(--accent)" },
    },
  },
  sidePanel: {
    backgroundColor: "var(--panel)",
    overflowY: "auto",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
  },
  controls: {
    borderRightWidth: tokens.strokeWidthThin,
    borderRightStyle: "solid",
    borderRightColor: "var(--line)",
  },
  artifacts: {
    borderLeftWidth: tokens.strokeWidthThin,
    borderLeftStyle: "solid",
    borderLeftColor: "var(--line)",
    display: "flex",
    flexDirection: "column",
  },
  brand: { marginBottom: tokens.spacingVerticalS },
  brandTitle: { fontSize: tokens.fontSizeBase300, margin: 0 },
  playground: { display: "flex", flexDirection: "column", minWidth: 0 },
  playgroundHeader: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottomWidth: tokens.strokeWidthThin,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--line)",
    color: "var(--muted)",
    textTransform: "uppercase",
    fontSize: tokens.fontSizeBase100,
    letterSpacing: ".5px",
  },
  agentChip: {
    textTransform: "none",
    letterSpacing: 0,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundColor: tokens.colorBrandBackground,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusCircular,
    whiteSpace: "nowrap",
  },
  playgroundSurface: {
    flex: 1,
    overflow: "auto",
    padding: tokens.spacingHorizontalXL,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    selectors: {
      '& table[data-cap="table"]': { borderCollapse: "collapse", fontSize: tokens.fontSizeBase200, margin: `${tokens.spacingVerticalXS} 0` },
      '& table[data-cap="table"] th': {
        textAlign: "left",
        padding: `4px ${tokens.spacingHorizontalL} 4px 0`,
        borderBottomWidth: tokens.strokeWidthThin,
        borderBottomStyle: "solid",
        borderBottomColor: tokens.colorNeutralStroke2,
        color: tokens.colorNeutralForeground3,
        fontWeight: tokens.fontWeightSemibold,
      },
      '& table[data-cap="table"] td': {
        textAlign: "left",
        padding: `4px ${tokens.spacingHorizontalL} 4px 0`,
        borderBottomWidth: tokens.strokeWidthThin,
        borderBottomStyle: "solid",
        borderBottomColor: tokens.colorNeutralStroke2,
      },
    },
  },
});

// --- Layout wrappers --------------------------------------------------------------
// The three columns of the shell. Pure passthrough containers that carry the token-driven host
// theme classes; all content is their declarative children.

function Shell({ children }: ProjectionViewProps) {
  const styles = useStyles();
  return <div className={styles.shell}>{children}</div>;
}

function Controls({ children }: ProjectionViewProps) {
  const styles = useStyles();
  return (
    <aside className={mergeClasses(styles.sidePanel, styles.controls)}>
      <header className={styles.brand}>
        <h1 className={styles.brandTitle}>GenUI Workbench</h1>
        <span className="muted">declarative chrome · agent authoring</span>
      </header>
      {children}
    </aside>
  );
}

function Artifacts({ children }: ProjectionViewProps) {
  const styles = useStyles();
  return <section className={mergeClasses(styles.sidePanel, styles.artifacts)}>{children}</section>;
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
  const styles = useStyles();
  const p = readProps(node);
  // A read-only view of the `workbench` namespace, reconstructed from the props the node's `read`
  // edges bound, so the ported bridge helpers (which speak `workbench.<key>` paths) work unchanged.
  const state: StateReader = {
    get: (path) => node.props[path.startsWith("workbench.") ? path.slice("workbench.".length) : path] as Json | undefined,
  };

  const emitRef = useRef(emit);
  emitRef.current = emit;

  const [guest, setGuest] = useState<Session>(() => {
    const { spec, ctx, edits, profileId } = readInputs(state);
    return buildSession(spec, ctx, selectedProfile(profileId), edits);
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
    const profile = selectedProfile(inputs.profileId);
    const taxonomy = profile.resources.taxonomy as unknown as InteractionTaxonomy;
    setGuest(buildSession(inputs.spec, inputs.ctx, profile, inputs.edits));
    emitRef.current("facetsComputed", { facets: facetsAsItems(inputs.spec, taxonomy) });
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
    if (parsed.authored) {
      const profile = selectedProfile(readInputs(state).profileId);
      const mismatch = checkAuthoredProfile(
        parsed.authored,
        profile.artifact.payload.id,
        profile.artifact.payload.version
      );
      if (mismatch) emitRef.current("importResult", { error: mismatch });
      else emitRef.current("importApply", authoredApplyPayload(parsed.authored));
    } else emitRef.current("importResult", { error: parsed.error });
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
      const taxonomy = selectedProfile(readInputs(state).profileId).resources.taxonomy as unknown as InteractionTaxonomy;
      emitRef.current("regionsComputed", { regions: editableRegions(guest.presentation, readEdits(state), taxonomy) });
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
    <main className={styles.playground}>
      <header className={styles.playgroundHeader}>
        <span>Playground</span>
        {agentRunning && agentLabel ? (
          <span className={styles.agentChip}>{`\u{1F916} agent authoring \u00b7 ${agentLabel}`}</span>
        ) : null}
      </header>
      <div className={styles.playgroundSurface}>
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
