// Default React components for the live-cards profile capabilities.
// These are the profile's vocabulary; the kernel and renderer stay generic.

import React from "react";
import { createRegistry, type CapabilityViewProps, type ComponentRegistry } from "./registry";
import { readProps } from "./props";

export function Board({ node, children }: CapabilityViewProps) {
  const title = readProps(node).str("title");
  return (
    <section data-cap="board">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

export function Metric({ node }: CapabilityViewProps) {
  const p = readProps(node);
  const label = p.str("label");
  const value = p.str("value");
  return (
    <div data-cap="metric">
      <span data-metric-label>{label}</span>
      <strong data-metric-value>{value}</strong>
    </div>
  );
}

// Prose read surface: a card's narrative/summary/recommendation text (bound onto `text`).
export function Narrative({ node }: CapabilityViewProps) {
  const text = readProps(node).str("text");
  return <p data-cap="narrative">{text || "No narrative yet."}</p>;
}

// Status pill: a short status token (bound onto `value`) with an optional tone.
export function Badge({ node }: CapabilityViewProps) {
  const p = readProps(node);
  const value = p.str("value");
  const tone = p.str("tone", "secondary");
  return (
    <span data-cap="badge" data-tone={tone}>
      {value}
    </span>
  );
}

// Data-entry surface: a labelled set of fields whose submit round-trips through the node-bound emit.
export function Form({ node, emit }: CapabilityViewProps) {
  const p = readProps(node);
  const label = p.str("label");
  const fields = p.list<string>("fields");
  return (
    <form
      data-cap="form"
      onSubmit={(e) => {
        e.preventDefault();
        emit("submit");
      }}
    >
      {label ? <label data-form-label>{label}</label> : null}
      {fields.map((f) => (
        <input key={f} name={f} data-field={f} />
      ))}
      <button type="submit">Save</button>
    </form>
  );
}

interface Row {
  id?: string;
  [k: string]: unknown;
}

// Column derivation fallback: when a table's static `columns` spec is absent, union the keys of
// the bound rows (in first-seen order) so real cells render without any authoring.
function deriveColumns(rows: Row[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      Object.keys(row).forEach((key) => keys.add(key));
    }
  }
  return [...keys];
}

export function Table({ node, emit }: CapabilityViewProps) {
  const rows = readProps(node).list<Row>("rows");
  const authored = readProps(node).list<string>("columns");
  const columns = authored.length ? authored : deriveColumns(rows);

  if (rows.length === 0) {
    return <div data-cap="table" data-empty>No rows</div>;
  }

  return (
    <table data-cap="table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.id ?? i}
            data-row-id={row.id}
            onClick={() => emit("rowSelect", { id: row.id })}
          >
            {columns.map((col) => (
              <td key={col}>{String(row[col] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ActionButton({ node, emit }: CapabilityViewProps) {
  const label = readProps(node).str("label");
  return (
    <button data-cap="actions" type="button" onClick={() => emit("tap")}>
      {label}
    </button>
  );
}

export function FallbackView({ node }: CapabilityViewProps) {
  return (
    <div data-fallback data-cap={node.capability}>
      Unsupported capability: {node.capability}
    </div>
  );
}

/** The live-cards profile's capability -> component map. */
export const liveCardsRegistry: ComponentRegistry = createRegistry(
  {
    board: Board,
    metric: Metric,
    narrative: Narrative,
    badge: Badge,
    table: Table,
    form: Form,
    actions: ActionButton,
  },
  FallbackView
);
