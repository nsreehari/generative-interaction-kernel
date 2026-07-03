// Default React components for the live-cards profile capabilities.
// These are the profile's vocabulary; the kernel and renderer stay generic.

import React from "react";
import { createRegistry, type CapabilityViewProps, type ComponentRegistry } from "./registry";

export function Board({ node, children }: CapabilityViewProps) {
  const title = String(node.props.title ?? "");
  return (
    <section data-cap="board">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

export function Metric({ node }: CapabilityViewProps) {
  const label = String(node.props.label ?? "");
  const value = node.props.value;
  return (
    <div data-cap="metric">
      <span data-metric-label>{label}</span>
      <strong data-metric-value>{value === null || value === undefined ? "" : String(value)}</strong>
    </div>
  );
}

interface Row {
  id?: string;
  [k: string]: unknown;
}

export function Table({ node, emit }: CapabilityViewProps) {
  const rows: Row[] = Array.isArray(node.props.rows) ? (node.props.rows as Row[]) : [];
  const columns: string[] = Array.isArray(node.props.columns)
    ? (node.props.columns as string[])
    : [];

  if (rows.length === 0) {
    return <div data-cap="table" data-empty>No rows</div>;
  }

  return (
    <table data-cap="table">
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
  const label = String(node.props.label ?? "");
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
    table: Table,
    actions: ActionButton,
  },
  FallbackView
);
