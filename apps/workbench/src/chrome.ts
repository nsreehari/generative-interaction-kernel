// The chrome runtime: the workbench's own panels as a declarative GUP document, plus the seed
// state they bind to and the bridge helpers that translate chrome state into guest inputs.
//
// Data flow:
//   user turns a knob  ->  select/text emits `change`/`input`  ->  on-handler `assignFrom` patches
//   the `workbench` namespace  ->  chrome re-resolves (control reflects new value)  ->  the bridge
//   (Workbench.tsx) reads the namespace, re-runs the pure pipeline, and drives the guest.

import {
  authorDocument,
  node,
  assign,
  assignFrom,
  InMemoryStateModel,
  type DocNode,
  type Json,
  type Patch,
  type ResolvedNode,
  type TraceEvent,
} from "../../../kernel/src/index";
import type { Bundle } from "../../../adapters/react/src/index";
import {
  interactionTaxonomy,
  resolveFacets,
  emptyEdits,
  type InteractionKind,
  type InteractionSpec,
  type PresentationContext,
  type PresentationEdits,
  type RegionDisclosure,
  type RegionPriority,
} from "../../../interaction/src/index";
import { WORKBENCH_MANIFEST } from "./profile/manifest";
import { workbenchComponents } from "./profile/registry";
import { exportBundle, type AuthoredSession } from "./export";
import { AGENT_PLAYLIST } from "./agent";
import type { Session } from "./session";

interface Option {
  value: string;
  label: string;
  [k: string]: string;
}

const KIND_OPTIONS: Option[] = (Object.keys(interactionTaxonomy) as InteractionKind[]).map((k) => ({
  value: k,
  label: k,
}));

/** A context-axis select: "(unset)" plus the axis values, bound to `workbench.<axis>`. */
function axisSelect(axis: string, label: string, values: string[]): DocNode {
  const options: Option[] = [{ value: "", label: "(unset)" }, ...values.map((v) => ({ value: v, label: v }))];
  return node("select", `ctx-${axis}`, {
    props: { label, options },
    read: { value: `workbench.${axis}` },
    on: { change: [assignFrom(`workbench.${axis}`, "$event.value")] },
  });
}

/** The chrome document: the left control column, authored declaratively. */
function chromeRoot(): DocNode {
  return node("panelGroup", "chrome-root", {
    on: {
      // The bridge pushes recomputed facets in through this event (see Workbench.tsx).
      facetsComputed: [assignFrom("workbench.facets", "$event.facets")],
      // The bridge pushes the editable region list (facets + their effective placement) in here.
      regionsComputed: [assignFrom("workbench.editRegions", "$event.regions")],
      // On a guest rebuild the bridge refreshes the fireable node list and clears the selection.
      guestChanged: [
        assignFrom("workbench.nodeIds", "$event.nodeIds"),
        assign("workbench.eventNode", ""),
      ],
      // The bridge reports the outcome of a fired event (parse error or "").
      fireResult: [assignFrom("workbench.eventError", "$event.error")],
      // Import (Slice 3): the bridge parsed a pasted artifact and pushes its axes back in here,
      // which re-runs the whole pipeline through the normal state->rebuild path.
      importApply: [
        assignFrom("workbench.interaction", "$event.interaction"),
        assignFrom("workbench.subject", "$event.subject"),
        assignFrom("workbench.surface", "$event.surface"),
        assignFrom("workbench.device", "$event.device"),
        assignFrom("workbench.space", "$event.space"),
        assignFrom("workbench.attention", "$event.attention"),
        assignFrom("workbench.expertise", "$event.expertise"),
        assignFrom("workbench.edits", "$event.edits"),
        assign("workbench.importError", ""),
      ],
      // On a bad paste the bridge reports the parse error instead.
      importResult: [assignFrom("workbench.importError", "$event.error")],
      // Agent (Slice 4): the bridge advances the authoring tour and reports the live step back here,
      // so the chrome narrates what the agent is doing while the guest re-renders.
      agentAdvance: [
        assignFrom("workbench.agentStep", "$event.step"),
        assignFrom("workbench.agentLabel", "$event.label"),
      ],
      // The tour is a bounded one-pass run: when the last beat has played the bridge fires `agentDone`,
      // which halts the run and shows a completion note. Pressing Play again replays from the top.
      agentDone: [
        assign("workbench.agentRunning", false),
        assign("workbench.agentLabel", "Tour complete \u00b7 press Play to replay"),
      ],
    },
    children: [
      node("panel", "interaction-panel", {
        props: { title: "Interaction" },
        children: [
          node("select", "interaction-kind", {
            props: { label: "Kind", options: KIND_OPTIONS },
            read: { value: "workbench.interaction" },
            on: { change: [assignFrom("workbench.interaction", "$event.value")] },
          }),
          node("text", "interaction-subject", {
            props: { label: "Subject" },
            read: { value: "workbench.subject" },
            on: { input: [assignFrom("workbench.subject", "$event.value")] },
          }),
          node("facetList", "interaction-facets", { read: { items: "workbench.facets" } }),
        ],
      }),
      node("panel", "context-panel", {
        props: { title: "Context" },
        children: [
          axisSelect("surface", "Surface", ["desktop", "web", "mobile", "copilot", "teams"]),
          axisSelect("device", "Device", ["pointer", "touch", "voice"]),
          axisSelect("space", "Space", ["compact", "regular", "expanded"]),
          axisSelect("attention", "Attention", ["focused", "glanceable"]),
          axisSelect("expertise", "Expertise", ["novice", "intermediate", "expert"]),
        ],
      }),
      node("panel", "regions-panel", {
        props: { title: "Regions" },
        children: [
          // The editing surface: toggling / re-prioritizing / disclosing / reordering a region emits
          // `edit` with the full override set, which the bridge feeds back into the pipeline.
          node("regionEditor", "region-editor", {
            read: { items: "workbench.editRegions", edits: "workbench.edits" },
            on: { edit: [assignFrom("workbench.edits", "$event.edits")] },
          }),
        ],
      }),
      node("panel", "event-panel", {
        props: { title: "Fire event" },
        children: [
          // Options come from state (the live guest node list), not static props.
          node("select", "event-node", {
            props: { label: "Node" },
            read: { value: "workbench.eventNode", options: "workbench.nodeIds" },
            on: { change: [assignFrom("workbench.eventNode", "$event.value")] },
          }),
          node("text", "event-name", {
            props: { label: "Event" },
            read: { value: "workbench.eventName" },
            on: { input: [assignFrom("workbench.eventName", "$event.value")] },
          }),
          node("textarea", "event-payload", {
            props: { label: "Payload (JSON)" },
            read: { value: "workbench.eventPayload" },
            on: { input: [assignFrom("workbench.eventPayload", "$event.value")] },
          }),
          // A press just bumps a sequence; the bridge watches it and forwards to the guest.
          node("button", "event-fire", {
            props: { label: "Emit" },
            on: { press: [assignFrom("workbench.fireSeq", "workbench.fireSeq + 1")] },
          }),
          node("note", "event-error", {
            props: { tone: "error" },
            read: { text: "workbench.eventError" },
            gate: "workbench.eventError != ''",
          }),
        ],
      }),
      node("panel", "agent-panel", {
        props: { title: "Agent" },
        children: [
          // The agent is just another client emitting events: Play/Pause flip a flag the bridge's
          // loop watches; Step advances one beat. The bridge emits the authoring events (importApply)
          // and narrates via `agentAdvance` -> the label below.
          node("button", "agent-play", {
            props: { label: "\u25B6 Play tour" },
            on: { press: [assign("workbench.agentRunning", true)] },
          }),
          node("button", "agent-pause", {
            props: { label: "\u23F8 Pause" },
            on: { press: [assign("workbench.agentRunning", false)] },
          }),
          node("button", "agent-step", {
            props: { label: "\u2192 Step" },
            on: { press: [assignFrom("workbench.agentStepSeq", "workbench.agentStepSeq + 1")] },
          }),
          node("note", "agent-label", { read: { text: "workbench.agentLabel" } }),
          // The tour as a numbered plan; the highlighted step is what the playground is showing now.
          node("stepList", "agent-steps", {
            read: {
              items: "workbench.agentPlan",
              active: "workbench.agentStep",
              running: "workbench.agentRunning",
            },
          }),
        ],
      }),
      node("panel", "session-panel", {
        props: { title: "Session" },
        children: [
          // Paste an exported artifact (from the Export tab) and replay it. A press bumps a
          // sequence the bridge watches; it parses the text and forwards the axes to `importApply`.
          node("textarea", "import-text", {
            props: { label: "Authored JSON" },
            read: { value: "workbench.importText" },
            on: { input: [assignFrom("workbench.importText", "$event.value")] },
          }),
          node("button", "import-load", {
            props: { label: "Load" },
            on: { press: [assignFrom("workbench.importSeq", "workbench.importSeq + 1")] },
          }),
          node("note", "import-error", {
            props: { tone: "error" },
            read: { text: "workbench.importError" },
            gate: "workbench.importError != ''",
          }),
        ],
      }),
    ],
  });
}

/** Flatten an imported artifact into the `importApply` event payload (every axis defaulted). */
export function authoredApplyPayload(a: AuthoredSession): Record<string, unknown> {
  const ctx = a.context ?? { surface: "desktop" };
  return {
    interaction: a.interaction.interaction,
    subject: a.interaction.subject ?? "",
    surface: ctx.surface ?? "desktop",
    device: (ctx as Record<string, unknown>).device ?? "",
    space: (ctx as Record<string, unknown>).space ?? "",
    attention: (ctx as Record<string, unknown>).attention ?? "",
    expertise: (ctx as Record<string, unknown>).expertise ?? "",
    edits: a.edits,
  };
}

/** The facet descriptors the FacetList capability renders, for the current interaction. */
export function facetsAsItems(spec: InteractionSpec): { name: string; role: string; required: boolean }[] {
  return resolveFacets(spec).map((f) => ({ name: f.name, role: f.role, required: f.required }));
}

const DEFAULTS = { interaction: "investigate" as InteractionKind, subject: "incident", surface: "desktop" };

/** The chrome namespace's seed, so the panels render populated on first paint. */
function chromeSeed(): Json {
  return {
    interaction: DEFAULTS.interaction,
    subject: DEFAULTS.subject,
    surface: DEFAULTS.surface,
    device: "",
    space: "",
    attention: "",
    expertise: "",
    facets: facetsAsItems({ interaction: DEFAULTS.interaction, subject: DEFAULTS.subject }) as unknown as Json,
    // Editing surface (Slice 2): the override set + the derived editable region list.
    edits: { disabled: [], priority: {}, disclosure: {}, order: [] },
    editRegions: [],
    // Event-bar fields (Increment C).
    nodeIds: [],
    eventNode: "",
    eventName: "rowSelect",
    eventPayload: '{ "id": "order-42" }',
    fireSeq: 0,
    eventError: "",
    // Session import (Slice 3).
    importText: "",
    importSeq: 0,
    importError: "",
    // Agent authoring tour (Slice 4).
    agentRunning: false,
    agentStep: 0,
    agentStepSeq: 0,
    agentLabel: "Idle \u2014 press Play to watch the agent author live.",
    agentPlan: AGENT_PLAYLIST.map((s, i) => ({ index: i, label: s.label })),
  };
}

/**
 * The chrome BUNDLE: the left control column as a self-contained app — manifest + document + seed
 * state + its custom capability views. Loaded by the shared floor host (see Workbench.tsx), exactly
 * like the console; the workbench dogfoods the platform down to its own chrome. The `workbench`->
 * guest bridge (also in Workbench.tsx) is the native seam that carries fired events across kernels.
 */
export const chromeBundle: Bundle = {
  manifest: WORKBENCH_MANIFEST,
  document: authorDocument(chromeRoot()),
  state: { workbench: chromeSeed() },
  components: workbenchComponents,
};

/** Read the current guest inputs (interaction spec + presentation context + edits) out of state. */
export function readInputs(state: InMemoryStateModel): {
  spec: InteractionSpec;
  ctx: PresentationContext;
  edits: PresentationEdits;
} {
  const interaction = (String(state.get("workbench.interaction") || "investigate") as InteractionKind);
  const subject = String(state.get("workbench.subject") ?? "");
  const ctx: PresentationContext = {
    surface: (String(state.get("workbench.surface") || "desktop") as PresentationContext["surface"]),
  };
  for (const axis of ["device", "space", "attention", "expertise"] as const) {
    const v = state.get(`workbench.${axis}`);
    if (v) (ctx as Record<string, unknown>)[axis] = v;
  }
  return { spec: { interaction, subject }, ctx, edits: readEdits(state) };
}

/** The authoring session's presentation overrides, read from state (seeded, so always present). */
export function readEdits(state: InMemoryStateModel): PresentationEdits {
  const raw = state.get("workbench.edits");
  return raw ? (raw as unknown as PresentationEdits) : emptyEdits;
}

/** A stable signature of the guest inputs, so the bridge only rebuilds when they actually change. */
export function inputsSignature(inputs: {
  spec: InteractionSpec;
  ctx: PresentationContext;
  edits: PresentationEdits;
}): string {
  return JSON.stringify(inputs);
}

/** One row of the editing surface: a facet plus its current enabled/priority/disclosure placement. */
export interface EditRegion {
  name: string;
  role: string;
  required: boolean;
  enabled: boolean;
  priority: RegionPriority;
  disclosure: RegionDisclosure;
}

/**
 * The editable region list the RegionEditor renders: every facet of the interaction (so hidden ones
 * can be re-enabled), in the guest's effective order, each carrying its current placement. Regions
 * present in the guest use the planned+edited placement; hidden ones fall back to any override or the
 * neutral default. The list order drives the up/down reorder controls.
 */
export function editableRegions(session: Session, edits: PresentationEdits): EditRegion[] {
  const facets = resolveFacets(session.spec);
  const present = new Map(session.presentation.regions.map((r) => [r.name, r]));
  const disabled = new Set(edits.disabled);
  const order = [
    ...session.presentation.regions.map((r) => r.name),
    ...facets.map((f) => f.name).filter((n) => !present.has(n)),
  ];
  const byName = new Map(facets.map((f) => [f.name, f]));
  return order.map((name) => {
    const f = byName.get(name)!;
    const r = present.get(name);
    return {
      name,
      role: f.role,
      required: f.required,
      enabled: !disabled.has(name),
      priority: r?.priority ?? edits.priority[name] ?? "secondary",
      disclosure: r?.disclosure ?? edits.disclosure[name] ?? "always",
    };
  });
}

// --- Event bar (Increment C) ------------------------------------------------------

/** Every resolved node id, depth-first — the set the event bar can target. */
function collectIds(tree: ResolvedNode | null): string[] {
  if (!tree) return [];
  const ids = [tree.id];
  for (const child of tree.children) ids.push(...collectIds(child));
  return ids;
}

/** The guest's node ids as `{ value, label }` options for the (state-bound) node select. */
export function nodeIdsAsOptions(tree: ResolvedNode | null): Option[] {
  return collectIds(tree).map((id) => ({ value: id, label: id }));
}

/** A fired event resolved from chrome state: the target/name/payload plus any parse error. */
export interface FireRequest {
  node: string;
  name: string;
  payload: Record<string, unknown>;
  error: string;
}

/** Read + validate the event-bar fields; falls back to the first node when none is selected. */
export function readFireRequest(state: InMemoryStateModel, tree: ResolvedNode | null): FireRequest {
  const target = String(state.get("workbench.eventNode") || collectIds(tree)[0] || "");
  const name = String(state.get("workbench.eventName") ?? "");
  const raw = String(state.get("workbench.eventPayload") ?? "").trim();
  let payload: Record<string, unknown> = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      return { node: target, name, payload: {}, error: "payload is not valid JSON" };
    }
  }
  return { node: target, name, payload, error: "" };
}

// --- Inspector runtime (Increment B) ----------------------------------------------

const INSPECT_TABS: Option[] = [
  { value: "presentation", label: "Presentation DSL" },
  { value: "document", label: "UI DSL" },
  { value: "tree", label: "Resolved tree" },
  { value: "traces", label: "Traces" },
  { value: "export", label: "Export" },
];

/** The inspector document: a tab bar plus one gated panel per artifact view. */
function inspectRoot(): DocNode {
  const tabPanel = (id: string, child: DocNode): DocNode =>
    node("panelGroup", `tab-${id}`, { gate: `inspect.activeTab = '${id}'`, children: [child] });

  return node("panelGroup", "inspect-root", {
    // The bridge streams the guest's artifacts in through this single event.
    on: {
      snapshot: [
        assignFrom("inspect.presentationHead", "$event.presentationHead"),
        assignFrom("inspect.regions", "$event.regions"),
        assignFrom("inspect.documentJson", "$event.documentJson"),
        assignFrom("inspect.treeJson", "$event.treeJson"),
        assignFrom("inspect.traces", "$event.traces"),
        assignFrom("inspect.patchLabel", "$event.patchLabel"),
        assignFrom("inspect.exportJson", "$event.exportJson"),
      ],
    },
    children: [
      node("tabBar", "inspect-tabs", {
        props: { options: INSPECT_TABS },
        read: { active: "inspect.activeTab" },
        on: { select: [assignFrom("inspect.activeTab", "$event.value")] },
      }),
      tabPanel(
        "presentation",
        node("regionTable", "inspect-regions", {
          read: { head: "inspect.presentationHead", items: "inspect.regions" },
        })
      ),
      tabPanel("document", node("codeBlock", "inspect-document", { read: { code: "inspect.documentJson" } })),
      tabPanel("tree", node("codeBlock", "inspect-tree", { read: { code: "inspect.treeJson" } })),
      tabPanel(
        "traces",
        node("traceList", "inspect-traces", {
          read: { label: "inspect.patchLabel", items: "inspect.traces" },
        })
      ),
      tabPanel("export", node("codeBlock", "inspect-export", { read: { code: "inspect.exportJson" } })),
    ],
  });
}

/** The inspector namespace's seed (empty artifacts; the bridge fills them on the first guest render). */
function inspectSeed(): Json {
  return {
    activeTab: "presentation",
    presentationHead: "",
    regions: [],
    documentJson: "",
    treeJson: "",
    traces: [],
    patchLabel: "",
    exportJson: "",
  };
}

/**
 * The inspector BUNDLE: the right artifact column as a self-contained app. Loaded by the shared floor
 * host like the chrome bundle; the guest->inspect bridge (Workbench.tsx) streams the live guest's
 * artifacts into its `inspect` state — the second native cross-kernel seam.
 */
export const inspectBundle: Bundle = {
  manifest: WORKBENCH_MANIFEST,
  document: authorDocument(inspectRoot()),
  state: { inspect: inspectSeed() },
  components: workbenchComponents,
};

/** The `snapshot` payload the bridge feeds the inspector for the current guest state. */
export function inspectSnapshot(
  session: Session,
  tree: ResolvedNode | null,
  patch: Patch | null,
  edits: PresentationEdits
): Record<string, unknown> {
  const p = session.presentation;
  const bundle = exportBundle(session, edits);
  return {
    exportJson: JSON.stringify({ authored: bundle.authored, manifest: bundle.manifest }, null, 2),
    presentationHead: `${p.layout} · ${p.arrangement}`,
    regions: p.regions.map((r) => ({
      name: r.name,
      role: r.role,
      priority: r.priority,
      disclosure: r.disclosure,
      presentation: r.presentation ?? null,
      rationale: r.rationale ?? null,
    })),
    documentJson: JSON.stringify(session.document, null, 2),
    treeJson: JSON.stringify(tree, null, 2),
    traces: session.traces.map((t: TraceEvent) => ({
      event: t.event,
      node: t.node ?? "",
      detail: t.detail && Object.keys(t.detail).length > 0 ? JSON.stringify(t.detail) : "",
    })),
    patchLabel: `last patch: rev ${patch?.rev ?? "—"} · ${patch?.ops.length ?? 0} op(s)`,
  };
}
