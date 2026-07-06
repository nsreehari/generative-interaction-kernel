// The PLATFORM FLOOR, part 4: the shared primitive React registry (the pixels).
//
// One registry, shared by every bundle — the GenUI equivalent of the frontend's Tier-1 leaves.
// Each primitive obeys the uniform capability contract ({ node, emit, children }) and reads its
// configuration + bound data from `node.props` (populated by the document's read edges). Most apps
// ship NO components and just compose these primitives; a bundle that needs specialized controls
// layers its own EXTRA capabilities over this floor via `overlayRegistry` (see bundle.components).

import React from "react";
import {
  createRegistry,
  overlayRegistry,
  type CapabilityViewProps,
  type ComponentRegistry,
} from "../registry";
import { readProps } from "../props";
import { GenUIRoot } from "../useGenUI";
import { loadBundle, bundleSignature, type Bundle, type SerializableBundle } from "./bundle";
import { useApp } from "./apps";

interface Option {
  value: string;
  label: string;
}
interface Column {
  key: string;
  label: string;
}

// Smooth-to-type input that still reflects EXTERNAL writes (e.g. loading a record sets the value).
function useSyncedValue(incoming: string): [string, (v: string) => void] {
  const [local, setLocal] = React.useState(incoming);
  const last = React.useRef(incoming);
  React.useEffect(() => {
    if (incoming !== last.current) {
      last.current = incoming;
      setLocal(incoming);
    }
  }, [incoming]);
  return [local, setLocal];
}

function toOptions(raw: unknown[]): Option[] {
  return raw.map((o) =>
    typeof o === "string" ? { value: o, label: o } : (o as Option)
  );
}
function toColumns(raw: unknown[]): Column[] {
  return raw.map((c) => (typeof c === "string" ? { key: c, label: c } : (c as Column)));
}

// --- Layout -------------------------------------------------------------------------

function Screen({ node, children }: CapabilityViewProps) {
  const p = readProps(node);
  return (
    <div className="gx-screen">
      <header className="gx-screen-head">
        <h1>{p.str("title")}</h1>
        {p.str("subtitle") ? <span className="gx-muted">{p.str("subtitle")}</span> : null}
      </header>
      <div className="gx-screen-body">{children}</div>
    </div>
  );
}

function Row({ node, children }: CapabilityViewProps) {
  const p = readProps(node);
  return (
    <div className={`gx-row gx-row-${p.str("variant", "default")}`} data-spacing={p.str("spacing")}>
      {children}
    </div>
  );
}

function Col({ node, children }: CapabilityViewProps) {
  const p = readProps(node);
  return (
    <div className={`gx-col gx-col-${p.str("variant", "default")}`} data-spacing={p.str("spacing")}>
      {children}
    </div>
  );
}

function Panel({ node, children }: CapabilityViewProps) {
  const p = readProps(node);
  const title = p.str("title");
  return (
    <section className={`gx-panel gx-panel-${p.str("variant", "default")}`}>
      {title ? <h2 className="gx-panel-title">{title}</h2> : null}
      {children}
    </section>
  );
}

// --- Text / status ------------------------------------------------------------------

function Text({ node }: CapabilityViewProps) {
  const p = readProps(node);
  return <span className={`gx-text gx-text-${p.str("variant", "body")}`}>{p.str("value")}</span>;
}

function Heading({ node }: CapabilityViewProps) {
  const p = readProps(node);
  const level = p.str("level", "2");
  const Tag = (`h${["1", "2", "3", "4"].includes(level) ? level : "2"}`) as "h1" | "h2" | "h3" | "h4";
  return <Tag className="gx-heading">{p.str("value")}</Tag>;
}

function Note({ node }: CapabilityViewProps) {
  const p = readProps(node);
  return <p className={`gx-note gx-note-${p.str("tone", "muted")}`}>{p.str("value")}</p>;
}

function Badge({ node }: CapabilityViewProps) {
  const p = readProps(node);
  const value = p.str("value");
  const tone = p.str("tone", value);
  return <span className={`gx-badge gx-badge-${tone}`}>{value}</span>;
}

function Metric({ node }: CapabilityViewProps) {
  const p = readProps(node);
  return (
    <div className="gx-metric">
      <span className="gx-metric-label">{p.str("label")}</span>
      <strong className="gx-metric-value">{p.str("value")}</strong>
    </div>
  );
}

// --- Data display -------------------------------------------------------------------

function List({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const items = p.list<unknown>("items");
  const idKey = p.str("idKey", "id");
  const primaryKey = p.str("primaryKey", "label");
  const secondaryKey = p.str("secondaryKey");
  const badgeKey = p.str("badgeKey");
  const valueKey = p.str("valueKey");
  const selectedId = p.str("selectedId");
  const empty = p.str("emptyText", "Nothing here yet.");
  if (items.length === 0) return <p className="gx-muted">{empty}</p>;
  return (
    <ul className="gx-list">
      {items.map((raw, i) => {
        const isStr = typeof raw === "string";
        const item = (isStr ? {} : (raw as Record<string, unknown>)) as Record<string, unknown>;
        const id = String(isStr ? (raw as string) : (item[idKey] ?? i));
        const primary = isStr ? (raw as string) : String(item[primaryKey] ?? "");
        return (
          <li key={id}>
            <button
              className={`gx-list-row${id === selectedId ? " selected" : ""}`}
              onClick={() => emit("select", { id })}
            >
              <span className="gx-list-primary">{primary}</span>
              {!isStr && badgeKey && item[badgeKey] != null ? (
                <span className={`gx-badge gx-badge-${String(item[badgeKey])}`}>
                  {String(item[badgeKey])}
                </span>
              ) : null}
              {!isStr && secondaryKey && item[secondaryKey] != null ? (
                <span className="gx-list-secondary gx-muted">{String(item[secondaryKey])}</span>
              ) : null}
              {!isStr && valueKey && item[valueKey] != null ? (
                <span className="gx-list-value gx-muted">{String(item[valueKey])}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Table({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const rows = p.list<Record<string, unknown>>("rows");
  const columns = toColumns(p.list<unknown>("columns"));
  const idKey = p.str("idKey", "id");
  const empty = p.str("emptyText", "No rows.");
  if (rows.length === 0) return <p className="gx-muted">{empty}</p>;
  return (
    <table className="gx-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={String(row[idKey] ?? i)}
            onClick={() => emit("rowSelect", { id: String(row[idKey] ?? i) })}
          >
            {columns.map((c) => (
              <td key={c.key}>{String(row[c.key] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- Inputs -------------------------------------------------------------------------

function Field({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const [value, setValue] = useSyncedValue(p.str("value"));
  return (
    <label className="gx-field">
      {p.str("label") ? <span className="gx-field-label">{p.str("label")}</span> : null}
      <input
        value={value}
        placeholder={p.str("placeholder")}
        onChange={(e) => {
          setValue(e.target.value);
          emit("input", { value: e.target.value });
        }}
      />
    </label>
  );
}

function TextArea({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const [value, setValue] = useSyncedValue(p.str("value"));
  return (
    <label className="gx-field">
      {p.str("label") ? <span className="gx-field-label">{p.str("label")}</span> : null}
      <textarea
        rows={3}
        value={value}
        placeholder={p.str("placeholder")}
        onChange={(e) => {
          setValue(e.target.value);
          emit("input", { value: e.target.value });
        }}
      />
    </label>
  );
}

function Select({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const options = toOptions(p.list<unknown>("options"));
  const value = p.str("value");
  return (
    <label className="gx-field">
      {p.str("label") ? <span className="gx-field-label">{p.str("label")}</span> : null}
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

function Button({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  return (
    <button
      className={`gx-btn gx-btn-${p.str("tone", "default")}`}
      disabled={p.bool("disabled")}
      onClick={() => emit("press", {})}
    >
      {p.str("label")}
    </button>
  );
}

function TabBar({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const active = p.str("active");
  const options = toOptions(p.list<unknown>("options"));
  return (
    <nav className="gx-tabs">
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

function Chips({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const items = toOptions(p.list<unknown>("items"));
  const empty = p.str("emptyText", "None yet.");
  if (items.length === 0) return <p className="gx-muted">{empty}</p>;
  return (
    <ul className="gx-chips">
      {items.map((it) => (
        <li key={it.value} className="gx-chip">
          <code>{it.label}</code>
          <button
            className="gx-chip-remove"
            aria-label={`remove ${it.label}`}
            onClick={() => emit("remove", { value: it.value })}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

// --- Composition: embed a whole bundle/app -----------------------------------------

function Embed({ node }: CapabilityViewProps) {
  const p = readProps(node);
  // Two ways to host a whole bundle in a leaf:
  //   props.app     -> a KNOWN app resolved by name from the registry (carries native effects)
  //   props.bundle  -> an INLINE JSON bundle from state (runtime-built, e.g. preview/playground)
  const appName = p.str("app", "");
  const appBundle = useApp(appName || null);
  const inline = p.obj<SerializableBundle | null>("bundle", null);
  const bundle: SerializableBundle | Bundle | null = appBundle ?? inline;
  const sig = appName ? `app:${appName}` : bundleSignature(inline);
  const controller = React.useMemo(
    () => (bundle ? loadBundle(bundle) : null),
    [sig] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // A named app may ship EXTRA capabilities; the nested runtime renders on floor + those extras.
  // Inline bundles (from JSON state) can only use the floor, so they always render on the base.
  const registry = React.useMemo(
    () =>
      appBundle?.components ? overlayRegistry(primitiveRegistry, appBundle.components) : primitiveRegistry,
    [sig] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!controller) return <p className="gx-muted">{p.str("emptyText", "Nothing to preview.")}</p>;
  return (
    <div className="gx-bundle">
      <GenUIRoot source={controller} registry={registry} />
    </div>
  );
}

function Fallback({ node }: CapabilityViewProps) {
  return <div className="gx-muted">Unsupported primitive: {node.capability}</div>;
}

/** The one shared primitive registry every bundle renders from. */
export const primitiveRegistry: ComponentRegistry = createRegistry(
  {
    screen: Screen,
    row: Row,
    col: Col,
    panel: Panel,
    text: Text,
    heading: Heading,
    note: Note,
    badge: Badge,
    metric: Metric,
    list: List,
    table: Table,
    field: Field,
    textarea: TextArea,
    select: Select,
    button: Button,
    tabBar: TabBar,
    chips: Chips,
    embed: Embed,
  },
  Fallback
);
