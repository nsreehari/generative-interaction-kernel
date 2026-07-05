// The chrome runtime: the workbench's own panels as a declarative GUP document, plus the seed
// state they bind to and the bridge helpers that translate chrome state into guest inputs.
//
// Data flow:
//   user turns a knob  ->  select/text emits `change`/`input`  ->  on-handler `assignFrom` patches
//   the `workbench` namespace  ->  chrome re-resolves (control reflects new value)  ->  the bridge
//   (Workbench.tsx) reads the namespace, re-runs the pure pipeline, and drives the guest.

import {
  Kernel,
  authorDocument,
  bufferSink,
  node,
  assign,
  assignFrom,
  InMemoryStateModel,
  type DocNode,
  type Patch,
  type ResolvedNode,
  type TraceEvent,
} from "../../../kernel/src/index";
import { GenUIController } from "../../../adapters/react/src/index";
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
    ],
  });
}

/** The facet descriptors the FacetList capability renders, for the current interaction. */
export function facetsAsItems(spec: InteractionSpec): { name: string; role: string; required: boolean }[] {
  return resolveFacets(spec).map((f) => ({ name: f.name, role: f.role, required: f.required }));
}

const DEFAULTS = { interaction: "investigate" as InteractionKind, subject: "incident", surface: "desktop" };

/** Fresh chrome state, seeded so the panels render populated on first paint. */
export function seedChromeState(): InMemoryStateModel {
  const state = new InMemoryStateModel(["workbench"]);
  state.apply([
    { op: "set", path: "workbench.interaction", value: DEFAULTS.interaction },
    { op: "set", path: "workbench.subject", value: DEFAULTS.subject },
    { op: "set", path: "workbench.surface", value: DEFAULTS.surface },
    { op: "set", path: "workbench.device", value: "" },
    { op: "set", path: "workbench.space", value: "" },
    { op: "set", path: "workbench.attention", value: "" },
    { op: "set", path: "workbench.expertise", value: "" },
    {
      op: "set",
      path: "workbench.facets",
      value: facetsAsItems({ interaction: DEFAULTS.interaction, subject: DEFAULTS.subject }),
    },
    // Editing surface (Slice 2): the override set + the derived editable region list.
    { op: "set", path: "workbench.edits", value: { disabled: [], priority: {}, disclosure: {}, order: [] } },
    { op: "set", path: "workbench.editRegions", value: [] },
    // Event-bar fields (Increment C).
    { op: "set", path: "workbench.nodeIds", value: [] },
    { op: "set", path: "workbench.eventNode", value: "" },
    { op: "set", path: "workbench.eventName", value: "rowSelect" },
    { op: "set", path: "workbench.eventPayload", value: '{ "id": "order-42" }' },
    { op: "set", path: "workbench.fireSeq", value: 0 },
    { op: "set", path: "workbench.eventError", value: "" },
  ]);
  return state;
}

export interface ChromeRuntime {
  controller: GenUIController;
  state: InMemoryStateModel;
}

/** Stand up the declarative chrome runtime (kernel + controller over the seeded state). */
export function buildChromeRuntime(): ChromeRuntime {
  const state = seedChromeState();
  const message = authorDocument(chromeRoot());
  const kernel = new Kernel(WORKBENCH_MANIFEST, message, { state, sink: bufferSink().sink });
  return { controller: new GenUIController(kernel), state };
}

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
    ],
  });
}

/** Fresh inspector state (empty artifacts; the bridge fills them on the first guest render). */
export function seedInspectState(): InMemoryStateModel {
  const state = new InMemoryStateModel(["inspect"]);
  state.apply([
    { op: "set", path: "inspect.activeTab", value: "presentation" },
    { op: "set", path: "inspect.presentationHead", value: "" },
    { op: "set", path: "inspect.regions", value: [] },
    { op: "set", path: "inspect.documentJson", value: "" },
    { op: "set", path: "inspect.treeJson", value: "" },
    { op: "set", path: "inspect.traces", value: [] },
    { op: "set", path: "inspect.patchLabel", value: "" },
  ]);
  return state;
}

export interface InspectRuntime {
  controller: GenUIController;
  state: InMemoryStateModel;
}

/** Stand up the declarative inspector runtime (right column). */
export function buildInspectRuntime(): InspectRuntime {
  const state = seedInspectState();
  const message = authorDocument(inspectRoot());
  const kernel = new Kernel(WORKBENCH_MANIFEST, message, { state, sink: bufferSink().sink });
  return { controller: new GenUIController(kernel), state };
}

/** The `snapshot` payload the bridge feeds the inspector for the current guest state. */
export function inspectSnapshot(
  session: Session,
  tree: ResolvedNode | null,
  patch: Patch | null
): Record<string, unknown> {
  const p = session.presentation;
  return {
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
