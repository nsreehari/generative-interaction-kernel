// The workbench profile's capability -> React component map (the "vocabulary side" of the chrome
// runtime). Each component is a thin, dumb view: it reads its bound props (populated by the node's
// `read` edges) and reports interaction back through `emit`, which the kernel routes to the node's
// `on` handlers. No component holds app state — state lives in the `workbench` namespace.

import React from "react";
import {
  createRegistry,
  readProps,
  type CapabilityViewProps,
  type ComponentRegistry,
} from "../../../../adapters/react/src/index";

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

function FallbackView({ node }: CapabilityViewProps) {
  return <div className="muted">Unsupported chrome capability: {node.capability}</div>;
}

/** The workbench chrome profile's capability -> component map. */
export const workbenchRegistry: ComponentRegistry = createRegistry(
  {
    panelGroup: PanelGroup,
    panel: Panel,
    select: Select,
    text: TextInput,
    facetList: FacetList,
    textarea: TextArea,
    button: Button,
    note: Note,
    tabBar: TabBar,
    regionTable: RegionTable,
    codeBlock: CodeBlock,
    traceList: TraceList,
  },
  FallbackView
);
