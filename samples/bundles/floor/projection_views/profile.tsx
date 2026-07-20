// Default React components for the live-cards profile capabilities.
// These are the profile's vocabulary; the kernel and renderer stay generic.

import React from "react";
import {
  buildRegistryFromImports,
  readProps,
  type ProjectionViewProps,
  type ComponentRegistry,
  type ProviderMap,
} from "@gik/react";
import { FLOOR_COMPONENTS } from "./index";

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

/** Shared `ui:*` components for the sample-authored profiles rendered by the host. */
export const sampleProfileComponents: ProviderMap = {
  board: Board,
  metric: Metric,
  table: Table,
  chart: FLOOR_COMPONENTS.chart,
  markdown: FLOOR_COMPONENTS.markdown,
  markup: FLOOR_COMPONENTS.markup,
  todo: FLOOR_COMPONENTS.todo,
  actions: ActionButton,
};

/** Back-compat name for the original live-cards provider. */
export const liveCardsComponents: ProviderMap = sampleProfileComponents;

/**
 * The live-cards profile registry: resolves the namespaced `ui:*` capabilities (board/metric/table/
 * actions) through the profile provider. Nothing is ambient — the `ui` alias is bound explicitly to
 * this profile's projection views, mirroring a bundle's `externals.projectionViews`.
 */
export const liveCardsRegistry: ComponentRegistry = buildRegistryFromImports(
  { ui: { from: "profile" } },
  (from) => (from === "profile" ? sampleProfileComponents : undefined),
  FallbackView
);
