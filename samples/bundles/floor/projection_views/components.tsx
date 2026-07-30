import React from "react";
import {
  buildRegistryFromImports,
  readProps,
  type ProjectionViewProps,
  type ComponentRegistry,
  type ProviderMap,
} from "@gik/react";
import { FLOOR_COMPONENTS } from "./floorLeaves";

export function Board({ node, children }: ProjectionViewProps) {
  const title = readProps(node).str("title");
  return (
    <section data-cap="board">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

export function Metric({ node }: ProjectionViewProps) {
  const props = readProps(node);
  const label = props.str("label");
  const value = props.str("value");
  return (
    <div data-cap="metric">
      <span data-metric-label>{label}</span>
      <strong data-metric-value>{value}</strong>
    </div>
  );
}

interface Row {
  id?: string;
  [key: string]: unknown;
}

function deriveColumns(rows: Row[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      Object.keys(row).forEach((key) => keys.add(key));
    }
  }
  return [...keys];
}

export function Table({ node, emit }: ProjectionViewProps) {
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
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.id ?? index}
            data-row-id={row.id}
            onClick={() => emit("rowSelect", { id: row.id })}
          >
            {columns.map((column) => (
              <td key={column}>{String(row[column] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ActionButton({ node, emit }: ProjectionViewProps) {
  const label = readProps(node).str("label");
  return (
    <button data-cap="actions" type="button" onClick={() => emit("tap")}>
      {label}
    </button>
  );
}

export function FallbackView({ node }: ProjectionViewProps) {
  return (
    <div data-fallback data-cap={node.capability}>
      Unsupported capability: {node.capability}
    </div>
  );
}

export const floorComponents: ProviderMap = {
  board: Board,
  metric: Metric,
  table: Table,
  chart: FLOOR_COMPONENTS.chart,
  markdown: FLOOR_COMPONENTS.markdown,
  markup: FLOOR_COMPONENTS.markup,
  todo: FLOOR_COMPONENTS.todo,
  actions: ActionButton,
};

export const floorRegistry: ComponentRegistry = buildRegistryFromImports(
  { ui: { from: "floor" } },
  (from) => (from === "floor" ? floorComponents : undefined),
  FallbackView
);
