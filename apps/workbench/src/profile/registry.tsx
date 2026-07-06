// The workbench profile's capability -> React component map (the "vocabulary side" of the chrome
// runtime). Each component is a thin, dumb view: it reads its bound props (populated by the node's
// `read` edges) and reports interaction back through `emit`, which the kernel routes to the node's
// `on` handlers. No component holds app state — state lives in the `workbench` namespace.

import React from "react";
import {
  readProps,
  type CapabilityView,
  type CapabilityViewProps,
} from "../../../../adapters/react/src/index";
import {
  emptyEdits,
  type PresentationEdits,
  type RegionDisclosure,
  type RegionPriority,
} from "../../../../interaction/src/index";

interface Option {
  value: string;
  label: string;
}

function PanelGroup({ children }: CapabilityViewProps) {
  return <>{children}</>;
}

function Panel({ node, children }: CapabilityViewProps) {
  const title = readProps(node).str("title");
  return (
    <section className="panel-section">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

function Select({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const label = p.str("label");
  const value = p.str("value");
  const options = p.list<Option>("options");
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => emit("change", { value: e.target.value })}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextInput({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const label = p.str("label");
  // Uncontrolled: keep the caret smooth while still reporting every keystroke into kernel state
  // (nothing else writes this field, so defaultValue is sufficient).
  const initial = p.str("value");
  return (
    <label>
      {label}
      <input defaultValue={initial} onChange={(e) => emit("input", { value: e.target.value })} />
    </label>
  );
}

interface FacetItem {
  name: string;
  role: string;
  required: boolean;
}

function FacetList({ node }: CapabilityViewProps) {
  const items = readProps(node).list<FacetItem>("items");
  return (
    <div className="facet-list">
      <span className="muted">facets</span>
      <ul>
        {items.map((f) => (
          <li key={f.name}>
            <code>{f.name}</code>
            <span>{f.role}</span>
            <span>{f.required ? "required" : "optional"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Editing surface (Slice 2) ----------------------------------------------------

interface EditRegionItem {
  name: string;
  role: string;
  required: boolean;
  enabled: boolean;
  priority: RegionPriority;
  disclosure: RegionDisclosure;
}

const PRIORITY_OPTS: Option[] = [
  { value: "primary", label: "primary" },
  { value: "secondary", label: "secondary" },
  { value: "tertiary", label: "tertiary" },
];
const DISCLOSURE_OPTS: Option[] = [
  { value: "always", label: "always" },
  { value: "collapsed", label: "collapsed" },
  { value: "on-demand", label: "on-demand" },
];

/**
 * The editing surface: a controlled view over the region list + the current override set. Every
 * control computes the *next* override set from the current one (preserving only what the user has
 * deliberately set) and emits it whole as `edit` — the on-handler stores it and the bridge re-plans.
 */
function RegionEditor({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const items = p.list<EditRegionItem>("items");
  const edits = p.obj<PresentationEdits>("edits", emptyEdits);
  const order = items.map((r) => r.name);
  const push = (next: PresentationEdits) => emit("edit", { edits: next });

  // Drag-reorder state. The dragged name lives in a ref so `onDrop` reads it synchronously (a state
  // value could still be stale in the drop closure if React hasn't re-rendered since dragstart); the
  // hovered name is state because the drop-target highlight needs a re-render. The authoritative order
  // is the pushed `edits.order`, so the list re-renders from state after a drop.
  const dragName = React.useRef<string | null>(null);
  const [overName, setOverName] = React.useState<string | null>(null);

  const toggle = (name: string) =>
    push({
      ...edits,
      disabled: edits.disabled.includes(name)
        ? edits.disabled.filter((n) => n !== name)
        : [...edits.disabled, name],
    });
  const setPriority = (name: string, value: string) =>
    push({ ...edits, priority: { ...edits.priority, [name]: value as RegionPriority } });
  const setDisclosure = (name: string, value: string) =>
    push({ ...edits, disclosure: { ...edits.disclosure, [name]: value as RegionDisclosure } });
  // Shared reorder primitive: move `dragged` to `target`'s slot. Both the drag handle and the
  // ↑/↓ buttons funnel through the same `edit` event, so the pipeline sees one reorder shape.
  const reorder = (dragged: string, target: string) => {
    if (dragged === target) return;
    const from = order.indexOf(dragged);
    const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, dragged);
    push({ ...edits, order: next });
  };
  const move = (name: string, dir: -1 | 1) => {
    const i = order.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    push({ ...edits, order: next });
  };
  const endDrag = () => {
    dragName.current = null;
    setOverName(null);
  };

  return (
    <div className="region-editor">
      <span className="muted">regions</span>
      <ul>
        {items.map((r, i) => (
          <li
            key={r.name}
            className={[r.enabled ? "" : "off", overName === r.name && dragName.current !== r.name ? "drop-target" : ""]
              .filter(Boolean)
              .join(" ")}
            onDragOver={(e) => {
              if (!dragName.current) return;
              e.preventDefault();
              if (overName !== r.name) setOverName(r.name);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragName.current) reorder(dragName.current, r.name);
              endDrag();
            }}
          >
            <label className="region-toggle">
              <span
                className="drag-grip"
                draggable
                onDragStart={(e) => {
                  dragName.current = r.name;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={endDrag}
                aria-label="drag to reorder"
                title="Drag to reorder"
              >
                ⠿
              </span>
              <input
                type="checkbox"
                checked={r.enabled}
                disabled={r.required}
                onChange={() => toggle(r.name)}
              />
              <code>{r.name}</code>
              <span className="muted">{r.role}</span>
            </label>
            <div className="region-controls">
              <select
                value={r.priority}
                disabled={!r.enabled}
                onChange={(e) => setPriority(r.name, e.target.value)}
              >
                {PRIORITY_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={r.disclosure}
                disabled={!r.enabled}
                onChange={(e) => setDisclosure(r.name, e.target.value)}
              >
                {DISCLOSURE_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button disabled={i === 0} onClick={() => move(r.name, -1)} aria-label="move up">
                ↑
              </button>
              <button disabled={i === items.length - 1} onClick={() => move(r.name, 1)} aria-label="move down">
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Event bar (Increment C) ------------------------------------------------------

function TextArea({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const label = p.str("label");
  const initial = p.str("value");
  return (
    <label>
      {label}
      <textarea rows={2} defaultValue={initial} onChange={(e) => emit("input", { value: e.target.value })} />
    </label>
  );
}

function Button({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const label = p.str("label");
  const disabled = p.bool("disabled");
  return (
    <button disabled={disabled} onClick={() => emit("press", {})}>
      {label}
    </button>
  );
}

function Note({ node }: CapabilityViewProps) {
  const p = readProps(node);
  const text = p.str("text");
  const tone = p.str("tone", "muted");
  return <p className={tone === "error" ? "error" : "muted"}>{text}</p>;
}

interface StepItem {
  index: number;
  label: string;
}

/** The agent's authoring tour: a numbered plan with the current step (what the playground shows) marked. */
function StepList({ node }: CapabilityViewProps) {
  const p = readProps(node);
  const items = p.list<StepItem>("items");
  const active = Number(p.str("active", "0"));
  const running = p.bool("running");
  return (
    <div className="step-list">
      <span className="muted">tour</span>
      <ol>
        {items.map((s) => (
          <li key={s.index} className={s.index === active ? "active" : ""}>
            <span className="step-n">{s.index + 1}</span>
            <span className="step-label">{s.label}</span>
            {s.index === active ? (
              <span className="step-now">{running ? "\u25B6 playing" : "\u23F8 here"}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

// --- Inspector (Increment B) ------------------------------------------------------

function TabBar({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const active = p.str("active");
  const options = p.list<Option>("options");
  return (
    <nav className="tabs">
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === active ? "active" : ""}
          onClick={() => emit("select", { value: o.value })}
        >
          {o.label}
        </button>
      ))}
    </nav>
  );
}

interface RegionRow {
  name: string;
  role: string;
  priority: string;
  disclosure: string;
  presentation?: string | null;
  rationale?: string | null;
}

function RegionTable({ node }: CapabilityViewProps) {
  const p = readProps(node);
  const head = p.str("head");
  const items = p.list<RegionRow>("items");
  return (
    <div className="scroll">
      {head ? <p className="muted">{head}</p> : null}
      <table className="regions">
        <thead>
          <tr>
            <th>region</th>
            <th>role</th>
            <th>priority</th>
            <th>disclosure</th>
            <th>presentation</th>
            <th>rationale</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.name}>
              <td>
                <code>{r.name}</code>
              </td>
              <td>{r.role}</td>
              <td className={`pri-${r.priority}`}>{r.priority}</td>
              <td>{r.disclosure}</td>
              <td>{r.presentation ?? "—"}</td>
              <td className="muted">{r.rationale ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ node }: CapabilityViewProps) {
  const code = readProps(node).str("code");
  return (
    <div className="scroll">
      <pre>{code}</pre>
    </div>
  );
}

interface TraceRow {
  event: string;
  node: string;
  detail: string;
}

function TraceList({ node }: CapabilityViewProps) {
  const p = readProps(node);
  const label = p.str("label");
  const items = p.list<TraceRow>("items");
  return (
    <div className="scroll">
      <p className="muted">{label}</p>
      <ul className="traces">
        {items.length === 0 && <li className="muted">no traces yet — fire an event</li>}
        {items.map((t, i) => (
          <li key={i}>
            <span className={`tag trace-${t.event}`}>{t.event}</span>
            {t.node ? <code>{t.node}</code> : null}
            {t.detail ? <span className="muted"> {t.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The workbench chrome profile's EXTRA capability -> component map. These are layered over the shared
 * floor via `overlayRegistry` when the chrome/inspect bundles render (see Workbench.tsx): the custom
 * controls (facetList, regionEditor, regionTable, …) and the workbench's own takes on the shared
 * primitives (panel, select, text, …) win over the floor, which fills in anything not listed here
 * (including the fallback for a genuinely unknown capability).
 */
export const workbenchComponents: Record<string, CapabilityView> = {
  panelGroup: PanelGroup,
  panel: Panel,
  select: Select,
  text: TextInput,
  facetList: FacetList,
  regionEditor: RegionEditor,
  textarea: TextArea,
  button: Button,
  note: Note,
  stepList: StepList,
  tabBar: TabBar,
  regionTable: RegionTable,
  codeBlock: CodeBlock,
  traceList: TraceList,
};
