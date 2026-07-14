// The PLATFORM FLOOR, part 4: the shared primitive React registry (the pixels).
//
// One registry, shared by every bundle — the GenUI equivalent of the frontend's Tier-1 leaves.
// Each primitive obeys the uniform capability contract ({ node, emit, children }) and reads its
// configuration + bound data from `node.props` (populated by the document's read edges). Most apps
// ship NO projection views and just compose these primitives; a bundle that needs specialized controls
// declares its own projection views as the `self` provider in its manifest `externals` (see bundle.projectionViews).

import React from "react";
import "@xyflow/react/dist/style.css";
import { unwrap } from "../../../../kernel/src/index";
import type { Json, ResolvedNode } from "../../../../kernel/src/types";
import { runDeclarativeValidators } from "../../../../shared/libs/validators";
import {
  buildRegistryFromImports,
  type ProjectionView,
  type ProjectionViewProps,
  type ComponentRegistry,
  type ProviderResolver,
} from "../registry";
import { readProps } from "../props";
import { GenUIRoot } from "../useGenUI";
import { loadBundle, bundleSignature, type Bundle, type SerializableBundle } from "./bundle";
import { useBundleRegistry, useProjectionProviderResolver } from "./bundle-registry";
import { useGenUIFileServices } from "./fileServices";

interface Option {
  value: string;
  label: string;
}
interface Column {
  key: string;
  label: string;
  classPrefix?: string;
}

interface ChartModel {
  rows: Array<Record<string, unknown>>;
  labelKey: string;
  seriesKeys: string[];
}

interface SingleFieldSchema {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
}

interface SingleFieldConfig {
  fieldKey: string;
  prop: Record<string, unknown>;
  currentValue: string;
  options: unknown[];
  isRequired: boolean;
}

interface EditableTableSpec {
  schema?: { properties?: Record<string, Record<string, unknown>> };
  columns?: string[];
  addRow?: boolean;
  deleteRow?: boolean;
  placeholder?: string;
}

interface FormSchema {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
  // Declarative validators. Legacy JSONata shorthands (`[expr, message]`, `{ expr, message }`) still
  // normalize to `{ kind: "jsonata", ... }`. Explicit validator objects may also use
  // `{ kind: "ajv-schema", schema, message? }` or
  // `{ kind: "typedef", type, message? }`. JSONata validators run with the SAFE subset.
  validators?: unknown;
}

interface MultiFileUploadGroup {
  message?: string;
  file_idxs?: number[];
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

function buildFieldOptions(prop: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(prop.oneOf)) {
    return prop.oneOf.map((item) => {
      const record = item as Record<string, unknown>;
      return { value: String(record.const ?? ""), label: String(record.title ?? record.const ?? "") };
    });
  }
  if (Array.isArray(prop.options)) return prop.options as unknown[];
  if (Array.isArray(prop.enum)) {
    const enumNames = Array.isArray(prop.enumNames) ? prop.enumNames : null;
    return (prop.enum as unknown[]).map((value, index) => ({
      value: String(value ?? ""),
      label: String(enumNames?.[index] ?? value ?? ""),
    }));
  }
  return null;
}

function buildMultiOptions(prop: Record<string, unknown>): unknown[] {
  const items = (prop.items ?? {}) as Record<string, unknown>;
  if (Array.isArray(items.oneOf)) {
    return items.oneOf.map((item) => {
      const record = item as Record<string, unknown>;
      return { value: String(record.const ?? ""), label: String(record.title ?? record.const ?? "") };
    });
  }
  if (Array.isArray(prop.options)) return prop.options as unknown[];
  if (Array.isArray(items.enum)) {
    const enumNames = Array.isArray(items.enumNames) ? items.enumNames : null;
    return (items.enum as unknown[]).map((value, index) => ({
      value: String(value ?? ""),
      label: String(enumNames?.[index] ?? value ?? ""),
    }));
  }
  return [];
}

function toColumns(raw: unknown[]): Column[] {
  return raw.map((c) => (typeof c === "string" ? { key: c, label: c } : (c as Column)));
}

// When a table is bound to `rows` but no `columns` spec is provided (the common lowering-recipe
// case, where a region's dataPath yields row objects with no separate schema), derive the columns
// from the row data: the union of keys across rows, in first-seen order, excluding the id key.
function inferColumns(rows: Array<Record<string, unknown>>, idKey: string): Column[] {
  const seen = new Set<string>();
  const cols: Column[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) {
      if (key === idKey || seen.has(key)) continue;
      seen.add(key);
      cols.push({ key, label: key });
    }
  }
  return cols;
}

function isMultiSelect(prop: Record<string, unknown>): boolean {
  const items = (prop.items ?? {}) as Record<string, unknown>;
  return prop.type === "array" && (Array.isArray(items.enum) || Array.isArray(items.oneOf) || Array.isArray(prop.options));
}

function isSelectField(prop: Record<string, unknown>): boolean {
  return buildFieldOptions(prop) != null;
}

function isTextareaField(prop: Record<string, unknown>): boolean {
  return prop.format === "textarea" || prop.multiline === true;
}

function inputTypeFor(prop: Record<string, unknown>): string {
  if (prop.format === "date") return "date";
  if (prop.format === "time") return "time";
  if (prop.format === "date-time" || prop.format === "datetime") return "datetime-local";
  if (prop.type === "number" || prop.type === "integer") return "number";
  return "text";
}

function formatTemporalValue(prop: Record<string, unknown>, value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (prop.format === "date") return text.slice(0, 10);
  if (prop.format === "date-time" || prop.format === "datetime") return text.slice(0, 16);
  if (prop.format === "time") return text.slice(0, 5);
  return text;
}

const CHART_PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
];

function detectChartType(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "bar";
  const sample = rows[0] ?? {};
  if (sample.label !== undefined && sample.value !== undefined && sample.x === undefined && sample.date === undefined) {
    return "pie";
  }
  if (sample.x !== undefined || sample.date !== undefined) return "line";
  return "bar";
}

function normalizeChartData(data: unknown, viewData: Record<string, unknown>): ChartModel | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const map = data as Record<string, unknown>;
    if (Array.isArray(map.labels) && Array.isArray(map.datasets)) {
      const labels = map.labels;
      const datasets = map.datasets as Array<Record<string, unknown>>;
      const seriesNames = datasets.map((dataset, index) => String(dataset?.label ?? `series${index + 1}`));
      const rows = labels.map((label, index) => {
        const row: Record<string, unknown> = { __label: label };
        datasets.forEach((dataset, seriesIndex) => {
          const values = Array.isArray(dataset?.data) ? dataset.data : [];
          row[seriesNames[seriesIndex]] = values[index];
        });
        return row;
      });
      return { rows, labelKey: "__label", seriesKeys: seriesNames };
    }
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  if (typeof data[0] !== "object" || data[0] === null) {
    return {
      rows: data.map((value, index) => ({ __label: String(index + 1), value })),
      labelKey: "__label",
      seriesKeys: ["value"],
    };
  }

  const rows = data as Array<Record<string, unknown>>;
  const columns = Array.isArray(viewData.columns) ? viewData.columns.map(String) : null;
  const allKeys = Object.keys(rows[0] ?? {});
  const labelKey = columns?.[0] ?? String(viewData.labelKey ?? viewData.xKey ?? allKeys[0] ?? "");
  let seriesKeys: string[];
  if (Array.isArray(viewData.series) && viewData.series.length > 0) {
    seriesKeys = viewData.series.map(String);
  } else if (columns && columns.length > 1) {
    seriesKeys = columns.slice(1);
  } else {
    seriesKeys = allKeys.filter((key) => key !== labelKey && typeof rows[0][key] === "number");
    if (seriesKeys.length === 0) {
      seriesKeys = allKeys.filter((key) => key !== labelKey).slice(0, 1);
    }
  }

  return { rows, labelKey, seriesKeys };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return 0;
}

function maxChartValue(model: ChartModel, stacked: boolean): number {
  let max = 0;
  for (const row of model.rows) {
    if (stacked) {
      const sum = model.seriesKeys.reduce((acc, key) => acc + Math.max(0, toNumber(row[key])), 0);
      max = Math.max(max, sum);
    } else {
      for (const key of model.seriesKeys) {
        max = Math.max(max, toNumber(row[key]));
      }
    }
  }
  return max;
}

function chartLabel(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value == null ? "" : String(value);
}

function renderMarkdownBlocks(value: string): React.ReactNode[] {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      nodes.push(<p key={`p-${nodes.length}`}>{paragraph.join(" ")}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`ul-${nodes.length}`}>
          {listItems.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      nodes.push(<Tag key={`h-${nodes.length}`}>{text}</Tag>);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return nodes;
}

function getSingleFieldConfig(node: ProjectionViewProps["node"]): SingleFieldConfig | null {
  const p = readProps(node);
  const schema = p.obj<SingleFieldSchema>("fields", {});
  const entries = Object.entries(schema.properties ?? {});
  if (entries.length !== 1) return null;

  const [fieldKey, prop] = entries[0];
  const field = prop ?? {};
  const enumOptions = Array.isArray(field.enum) ? field.enum : [];
  const options = enumOptions.length > 0 ? enumOptions : p.list<unknown>("options");

  return {
    fieldKey,
    prop: field,
    currentValue: p.str("value"),
    options,
    isRequired: Array.isArray(schema.required) && schema.required.includes(fieldKey),
  };
}

function coerceFieldValue(raw: string, prop: Record<string, unknown>): string | number {
  const type = prop.type;
  if (type === "number" || type === "integer") {
    return raw === "" ? "" : Number.parseFloat(raw);
  }

  return raw;
}

function editableRowsFrom(source: unknown[]): Array<Record<string, unknown>> {
  return source.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { value: row ?? "" };
    }

    return { ...(row as Record<string, unknown>) };
  });
}

function editableColumns(spec: EditableTableSpec, rows: Array<Record<string, unknown>>): string[] {
  if (Array.isArray(spec.columns) && spec.columns.length > 0) {
    return spec.columns.map(String);
  }

  const schemaColumns = Object.keys(spec.schema?.properties ?? {});
  if (schemaColumns.length > 0) {
    return schemaColumns;
  }

  return Object.keys(rows[0] ?? {});
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "Unknown size";
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb >= 100 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

function resolveMultiFileData(raw: unknown): {
  files: Array<Record<string, unknown>>;
  filegroups: MultiFileUploadGroup[];
} {
  if (Array.isArray(raw)) {
    return { files: raw.filter((file) => file && typeof file === "object") as Array<Record<string, unknown>>, filegroups: [] };
  }

  if (raw && typeof raw === "object") {
    const map = raw as Record<string, unknown>;
    return {
      files: Array.isArray(map.files) ? map.files.filter((file) => file && typeof file === "object") as Array<Record<string, unknown>> : [],
      filegroups: Array.isArray(map.filegroups) ? map.filegroups as MultiFileUploadGroup[] : [],
    };
  }

  return { files: [], filegroups: [] };
}

// --- Layout -------------------------------------------------------------------------

function Screen({ node, children }: ProjectionViewProps) {
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

function Row({ node, children }: ProjectionViewProps) {
  const p = readProps(node);
  return (
    <div className={`gx-row gx-row-${p.str("variant", "default")}`} data-spacing={p.str("spacing")}>
      {children}
    </div>
  );
}

function Col({ node, children }: ProjectionViewProps) {
  const p = readProps(node);
  return (
    <div className={`gx-col gx-col-${p.str("variant", "default")}`} data-spacing={p.str("spacing")}>
      {children}
    </div>
  );
}

function Panel({ node, children }: ProjectionViewProps) {
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

function Text({ node }: ProjectionViewProps) {
  const p = readProps(node);
  return <span className={`gx-text gx-text-${p.str("variant", "body")}`}>{p.str("value")}</span>;
}

function Heading({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const level = p.str("level", "2");
  const Tag = (`h${["1", "2", "3", "4"].includes(level) ? level : "2"}`) as "h1" | "h2" | "h3" | "h4";
  return <Tag className="gx-heading">{p.str("value")}</Tag>;
}

function Note({ node }: ProjectionViewProps) {
  const p = readProps(node);
  return <p className={`gx-note gx-note-${p.str("tone", "muted")}`}>{p.str("value")}</p>;
}

function Badge({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const value = p.str("value");
  const tone = p.str("tone", value);
  return <span className={`gx-badge gx-badge-${tone}`}>{value}</span>;
}

function Alert({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const value = p.str("value").trim() || "-";
  const label = p.str("label");
  const level = p.str("level", "unknown");
  const tone = level === "green" || level === "good"
    ? "active"
    : level === "amber" || level === "warn" || level === "warning"
      ? "draft"
      : level === "red" || level === "bad" || level === "error"
        ? "danger"
        : "default";

  return (
    <div className="gx-panel-inset">
      <div className="gx-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="gx-metric">
          <strong className="gx-metric-value">{value}</strong>
          {label ? <span className="gx-metric-label">{label}</span> : null}
        </div>
        <span className={`gx-badge gx-badge-${tone}`}>{level}</span>
      </div>
    </div>
  );
}

function Metric({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const variant = p.str("variant");
  return (
    <div className={variant ? `gx-metric gx-metric-${variant}` : "gx-metric"}>
      <span className="gx-metric-label">{p.str("label")}</span>
      <strong className="gx-metric-value">{p.str("value")}</strong>
    </div>
  );
}

// A labeled text attribute (identifier, enum, or short phrase). Unlike `metric`, whose value is a
// large KPI number, `property` renders its value at body size and weight so identifiers like
// `ui:board` read as data, not as a heading.
function Property({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const label = p.str("label");
  const value = p.str("value").trim() || "—";
  return (
    <div className="gx-property">
      {label ? <span className="gx-property-label">{label}</span> : null}
      <span className="gx-property-value">{value}</span>
    </div>
  );
}

// A list of directional mappings ("when → then"), used to make a lowering step legible: each row
// reads left-to-right as input → output (e.g. `role = timeline → timeline`). Reads `rows` of
// `{ from, to }`; optional `fromLabel`/`toLabel` render a column caption header.
function MapList({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const rows = p.list<Record<string, unknown>>("rows");
  const fromLabel = p.str("fromLabel");
  const toLabel = p.str("toLabel");
  const emptyText = p.str("emptyText", "Nothing to map.");
  if (rows.length === 0) {
    return <p className="gx-note gx-note-muted">{emptyText}</p>;
  }
  return (
    <div className="gx-maplist">
      {fromLabel || toLabel ? (
        <div className="gx-maplist-head">
          <span className="gx-maplist-from">{fromLabel}</span>
          <span className="gx-maplist-arrow" aria-hidden="true" />
          <span className="gx-maplist-to">{toLabel}</span>
        </div>
      ) : null}
      {rows.map((row, index) => {
        const r = row as Record<string, unknown>;
        return (
          <div className="gx-maplist-row" key={String(r.id ?? index)}>
            <span className="gx-maplist-from">{String(r.from ?? "")}</span>
            <span className="gx-maplist-arrow" aria-hidden="true">→</span>
            <span className="gx-maplist-to">{String(r.to ?? "") || "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

// A read-only catalog of a layer's closed grammar: `groups` of `{ label, note, terms[] }`, each
// term shown as a static chip. Unlike `chips`, nothing here is removable — it documents the fixed
// vocabulary a layer speaks (interaction kinds, roles, capabilities), not an editable selection.
function Vocabulary({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const groups = p.list<Record<string, unknown>>("groups");
  const emptyText = p.str("emptyText", "No vocabulary for this layer.");
  if (groups.length === 0) {
    return <p className="gx-note gx-note-muted">{emptyText}</p>;
  }
  return (
    <div className="gx-vocab">
      {groups.map((group, index) => {
        const g = group as Record<string, unknown>;
        const terms = Array.isArray(g.terms) ? (g.terms as unknown[]) : [];
        return (
          <div className="gx-vocab-group" key={String(g.id ?? index)}>
            <div className="gx-vocab-head">
              <span className="gx-vocab-label">{String(g.label ?? "")}</span>
              {g.note ? <span className="gx-vocab-note">{String(g.note)}</span> : null}
            </div>
            <div className="gx-vocab-terms">
              {terms.length === 0 ? (
                <span className="gx-vocab-empty">—</span>
              ) : (
                terms.map((term, termIndex) => (
                  <code className="gx-vocab-term" key={termIndex}>
                    {String(term)}
                  </code>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Narrative({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const text = p.str("text") || p.str("value");
  const emptyMessage = p.str("emptyMessage", "No narrative yet.");
  if (!text.trim()) {
    return <p className="gx-note gx-note-muted">{emptyMessage}</p>;
  }

  return <div className="gx-text">{text}</div>;
}

// A scrollable, whitespace-preserving monospace block for JSON/code dumps (reads `code`). Distinct
// from `text` variant=code, which is an inline snippet span.
function CodeBlock({ node }: ProjectionViewProps) {
  return (
    <div className="gx-code">
      <pre>{readProps(node).str("code")}</pre>
    </div>
  );
}

function ChartPrimitive({ node }: ProjectionViewProps) {
  const spec = (node.props ?? {}) as Record<string, unknown>;
  const model = normalizeChartData(spec.data, spec);
  if (!model || model.rows.length === 0 || model.seriesKeys.length === 0) {
    return <p className="gx-muted">No chart data</p>;
  }

  const width = 360;
  const height = typeof spec.height === "number" ? spec.height : 220;
  const variant = typeof spec.chartType === "string" && spec.chartType.length > 0
    ? spec.chartType
    : detectChartType(model.rows);
  const stacked = spec.stacked === true;
  const showLegend = spec.legend !== false && (model.seriesKeys.length > 1 || variant === "pie" || variant === "doughnut");
  const left = 6;
  const top = 8;
  const right = 8;
  const bottom = 18;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const max = maxChartValue(model, stacked);

  const legendLabels = variant === "pie" || variant === "doughnut"
    ? model.rows.map((row) => chartLabel(row, model.labelKey))
    : model.seriesKeys;

  const baseline = <line key="baseline" x1={left} x2={left + plotW} y1={top + plotH} y2={top + plotH} stroke="currentColor" opacity="0.35" />;

  const bars = variant === "bar"
    ? model.rows.flatMap((row, rowIndex) => {
        const groupW = plotW / model.rows.length;
        let runningBottom = top + plotH;
        return model.seriesKeys.flatMap((key, seriesIndex) => {
          const value = Math.max(0, toNumber(row[key]));
          const barHeight = max > 0 ? (value / max) * plotH : 0;
          let x: number;
          let y: number;
          let barWidth: number;
          if (stacked) {
            barWidth = groupW * 0.6;
            x = left + rowIndex * groupW + groupW * 0.2;
            runningBottom -= barHeight;
            y = runningBottom;
          } else {
            barWidth = (groupW * 0.8) / model.seriesKeys.length;
            x = left + rowIndex * groupW + groupW * 0.1 + seriesIndex * barWidth;
            y = top + plotH - barHeight;
          }
          const elements: React.ReactNode[] = [];
          if (barHeight > 0) {
            elements.push(
              <rect
                key={`bar-${rowIndex}-${seriesIndex}`}
                x={x}
                y={y}
                width={Math.max(1, barWidth * 0.9)}
                height={barHeight}
                fill={CHART_PALETTE[seriesIndex % CHART_PALETTE.length]}
              />
            );
          }
          if (seriesIndex === model.seriesKeys.length - 1) {
            elements.push(
              <text key={`barlbl-${rowIndex}`} x={left + rowIndex * groupW} y={top + plotH + 12} fontSize="9" opacity="0.7">
                {chartLabel(row, model.labelKey)}
              </text>
            );
          }
          return elements;
        });
      })
    : [];

  const linePoints = (seriesIndex: number) => model.rows
    .map((row, rowIndex) => {
      const x = model.rows.length <= 1 ? left + plotW / 2 : left + rowIndex * (plotW / (model.rows.length - 1));
      const y = top + plotH - (max > 0 ? (toNumber(row[model.seriesKeys[seriesIndex]]) / max) * plotH : 0);
      return `${x},${y}`;
    })
    .join(" ");

  const lines = variant === "line" || variant === "area"
    ? model.seriesKeys.flatMap((key, seriesIndex) => {
        const points = linePoints(seriesIndex);
        const elements: React.ReactNode[] = [];
        if (variant === "area") {
          const firstX = model.rows.length <= 1 ? left + plotW / 2 : left;
          const lastX = model.rows.length <= 1 ? left + plotW / 2 : left + plotW;
          elements.push(
            <polygon
              key={`area-${key}`}
              points={`${points} ${lastX},${top + plotH} ${firstX},${top + plotH}`}
              fill={CHART_PALETTE[seriesIndex % CHART_PALETTE.length]}
              opacity="0.3"
            />
          );
        }
        elements.push(
          <polyline
            key={`line-${key}`}
            points={points}
            fill="none"
            stroke={CHART_PALETTE[seriesIndex % CHART_PALETTE.length]}
            strokeWidth="2"
          />
        );
        return elements;
      })
    : [];

  const scatter = variant === "scatter"
    ? model.rows.map((row, rowIndex) => {
        const x = model.rows.length <= 1 ? left + plotW / 2 : left + rowIndex * (plotW / (model.rows.length - 1));
        const y = top + plotH - (max > 0 ? (toNumber(row[model.seriesKeys[0]]) / max) * plotH : 0);
        return <circle key={`pt-${rowIndex}`} cx={x} cy={y} r="4" fill={CHART_PALETTE[0]} />;
      })
    : [];

  const pie = variant === "pie" || variant === "doughnut"
    ? (() => {
        const total = model.rows.reduce((acc, row) => acc + Math.max(0, toNumber(row[model.seriesKeys[0]])), 0);
        if (total <= 0) return [];
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) / 2 * 0.8;
        const innerRadius = variant === "doughnut" ? radius * 0.55 : 0;
        let angle = -Math.PI / 2;
        const slices = model.rows.flatMap((row, rowIndex) => {
          const value = Math.max(0, toNumber(row[model.seriesKeys[0]]));
          if (value <= 0) return [];
          const sweep = (value / total) * Math.PI * 2;
          const start = angle;
          const end = angle + sweep;
          angle = end;
          const x1 = cx + radius * Math.cos(start);
          const y1 = cy + radius * Math.sin(start);
          const x2 = cx + radius * Math.cos(end);
          const y2 = cy + radius * Math.sin(end);
          const largeArc = sweep > Math.PI ? 1 : 0;
          const path = innerRadius > 0
            ? (() => {
                const ix2 = cx + innerRadius * Math.cos(start);
                const iy2 = cy + innerRadius * Math.sin(start);
                const ix1 = cx + innerRadius * Math.cos(end);
                const iy1 = cy + innerRadius * Math.sin(end);
                return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
              })()
            : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
          return <path key={`slice-${rowIndex}`} d={path} fill={CHART_PALETTE[rowIndex % CHART_PALETTE.length]} />;
        });
        return slices;
      })()
    : [];

  const body = pie.length > 0 ? pie : [baseline, ...bars, ...lines, ...scatter];

  return (
    <div className="gx-chart">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="chart">
        {body}
      </svg>
      {showLegend ? (
        <div className="gx-chart-legend">
          {legendLabels.map((label, index) => (
            <span key={`${label}-${index}`} className="gx-chart-legend-item">
              <span className="gx-chart-swatch" style={{ background: CHART_PALETTE[index % CHART_PALETTE.length] }} />
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Markdown({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const value = p.str("value", p.str("text"));
  if (!value) return null;
  return (
    <div className="gx-markdown">
      {renderMarkdownBlocks(value)}
    </div>
  );
}

// --- Data display -------------------------------------------------------------------

function List({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const items = p.list<unknown>("items");
  const idKey = p.str("idKey", "id");
  const primaryKey = p.str("primaryKey", "label");
  const secondaryKey = p.str("secondaryKey");
  const badgeKey = p.str("badgeKey");
  const valueKey = p.str("valueKey");
  const selectedId = p.str("selectedId");
  const empty = p.str("emptyText", "Nothing here yet.");
  const isStatic = p.bool("static"); // passive display (no button/select), vs the default picker
  const ordered = p.bool("ordered"); // <ol> vs <ul>
  const badgeLeading = p.bool("badgeLeading"); // badge before the primary text
  if (items.length === 0) return <p className="gx-muted">{empty}</p>;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className="gx-list">
      {items.map((raw, i) => {
        const isStr = typeof raw === "string";
        const item = (isStr ? {} : (raw as Record<string, unknown>)) as Record<string, unknown>;
        const id = String(isStr ? (raw as string) : (item[idKey] ?? i));
        const primary = isStr ? (raw as string) : String(item[primaryKey] ?? "");
        const selected = id === selectedId;
        const badge =
          !isStr && badgeKey && item[badgeKey] != null ? (
            <span className={`gx-badge gx-badge-${String(item[badgeKey])}`}>
              {String(item[badgeKey])}
            </span>
          ) : null;
        const body = (
          <>
            {badgeLeading ? badge : null}
            <span className="gx-list-primary">{primary}</span>
            {badgeLeading ? null : badge}
            {!isStr && secondaryKey && item[secondaryKey] != null ? (
              <span className="gx-list-secondary gx-muted">{String(item[secondaryKey])}</span>
            ) : null}
            {!isStr && valueKey && item[valueKey] != null ? (
              <span className="gx-list-value gx-muted">{String(item[valueKey])}</span>
            ) : null}
          </>
        );
        return (
          <li key={id} className={selected && isStatic ? "selected" : undefined}>
            {isStatic ? (
              <span className="gx-list-row">{body}</span>
            ) : (
              <button
                className={`gx-list-row${selected ? " selected" : ""}`}
                onClick={() => emit("select", { id })}
              >
                {body}
              </button>
            )}
          </li>
        );
      })}
    </Tag>
  );
}

function Timeline({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const items = p.list<unknown>("items");
  const empty = p.str("emptyText", "No timeline data.");
  if (items.length === 0) return <p className="gx-muted">{empty}</p>;

  const headlineOf = (entry: Record<string, unknown>, index: number) =>
    String(
      entry.title ??
      entry.label ??
      entry.name ??
      entry.event ??
      entry.step ??
      entry.id ??
      `Item ${index + 1}`
    );

  const metaOf = (entry: Record<string, unknown>) => {
    const meta = entry.at ?? entry.time ?? entry.date ?? entry.timestamp;
    return meta == null ? "" : String(meta);
  };

  const detailOf = (entry: Record<string, unknown>) => {
    const detail = entry.detail ?? entry.summary ?? entry.description ?? entry.value ?? entry.status;
    return detail == null ? "" : String(detail);
  };

  return (
    <ol className="gx-list">
      {items.map((raw, index) => {
        const entry =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : { value: raw };
        const headline = headlineOf(entry, index);
        const meta = metaOf(entry);
        const detail = detailOf(entry);
        return (
          <li key={String(entry.id ?? entry.key ?? index)}>
            <span className="gx-list-row">
              <span className="gx-list-primary">{headline}</span>
              {meta ? <span className="gx-list-secondary gx-muted">{meta}</span> : null}
              {detail ? <span className="gx-list-value gx-muted">{detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Stats({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const items = p.list<unknown>("items");
  const empty = p.str("emptyText", "No stats available.");
  if (items.length === 0) return <p className="gx-muted">{empty}</p>;

  return (
    <div className="gx-row gx-wrap">
      {items.map((raw, index) => {
        const entry = raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : { value: raw };
        const label = String(entry.label ?? entry.name ?? entry.key ?? entry.id ?? `Metric ${index + 1}`);
        const value = String(entry.value ?? entry.amount ?? entry.total ?? entry.count ?? raw ?? "");
        return (
          <div key={String(entry.id ?? entry.key ?? index)} className="gx-metric">
            <span className="gx-metric-label">{label}</span>
            <strong className="gx-metric-value">{value}</strong>
          </div>
        );
      })}
    </div>
  );
}

function Diff({ node }: ProjectionViewProps) {
  const p = readProps(node);
  // A diff needs two distinct sides. They can arrive either as explicit `before`/`after` props or
  // as a single bound object (`value`/`data` = `{ before, after }`) — the latter is what a lowering
  // recipe naturally produces when a region's dataPath points at one comparison record.
  const bundle = p.obj<Record<string, unknown>>("value", p.obj<Record<string, unknown>>("data", {}));
  const before = node.props.before ?? bundle.before;
  const after = node.props.after ?? bundle.after;
  const empty = p.str("emptyText", "No diff data.");
  if (before == null && after == null) return <p className="gx-muted">{empty}</p>;

  return (
    <div className="gx-col">
      <div className="gx-panel-inset">
        <span className="gx-property-label">Before</span>
        <div className="gx-code">
          <pre>{JSON.stringify(before, null, 2)}</pre>
        </div>
      </div>
      <div className="gx-panel-inset">
        <span className="gx-property-label">After</span>
        <div className="gx-code">
          <pre>{JSON.stringify(after, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function Table({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const rows = p.list<Record<string, unknown>>("rows");
  const idKey = p.str("idKey", "id");
  const explicitColumns = toColumns(p.list<unknown>("columns"));
  const columns = explicitColumns.length > 0 ? explicitColumns : inferColumns(rows, idKey);
  const empty = p.str("emptyText", "No rows.");
  const isStatic = p.bool("static"); // passive display (no rowSelect), vs the default picker
  const blank = p.str("blankText", ""); // placeholder for null/empty cells
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
        {rows.map((row, i) => {
          const id = String(row[idKey] ?? i);
          return (
            <tr key={id} onClick={isStatic ? undefined : () => emit("rowSelect", { id })}>
              {columns.map((c) => {
                const raw = row[c.key];
                const text = raw == null || raw === "" ? blank : String(raw);
                return (
                  <td
                    key={c.key}
                    className={c.classPrefix ? `${c.classPrefix}${String(raw ?? "")}` : undefined}
                  >
                    {text}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// --- Inputs -------------------------------------------------------------------------

function Field({ node, emit }: ProjectionViewProps) {
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

function TextArea({ node, emit }: ProjectionViewProps) {
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

/** A `json` field renders a JSON textarea whose parse-validity gates the enclosing form's Save. */
function isJsonField(prop: Record<string, unknown>): boolean {
  return prop.format === "json" || prop.type === "json";
}

// A JSON text field: sugar for a single-field committed `Form` whose one field is a `json` textarea.
// It is a reusable floor input (not console-specific): reads `value`/`data` (a parsed object or raw
// JSON text), renders one JSON field with live parse validation, and — like any Form — emits
// `save { values }` on commit, with `values[name]` holding the parsed value. Optional `validators`
// (JSONata `[expr, message]` pairs) are passed straight through to the Form. `name` (default
// "value") is the field key consumers read back from `$event.values`.
function JsonField({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const name = p.str("name", "value");
  const fieldSpec: Record<string, Json> = {
    type: "json",
    title: p.str("label"),
    rows: p.str("rows", "8"),
    placeholder: p.str("placeholder"),
  };
  const validators = node.props.validators;
  const fields: Record<string, Json> = {
    properties: { [name]: fieldSpec },
    ...(validators !== undefined ? { validators } : {}),
  };
  const initial = node.props.value !== undefined ? node.props.value : (node.props.data ?? null);
  const formProps: Record<string, Json> = {
    ...node.props,
    fields,
    value: initial === null ? {} : { [name]: initial },
    saveLabel: p.str("saveLabel", "Apply"),
    discardLabel: p.str("discardLabel", "Reset"),
  };
  const formNode: ResolvedNode = { ...node, props: formProps };
  return <Form node={formNode} emit={emit} children={undefined} />;
}

function Form({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  // Canonical schema prop is `fields`; `schema` is accepted as a defensive alias so a lowering
  // recipe that binds `read.schema` (a natural authoring mistake) still renders instead of blanking.
  const schema = p.obj<FormSchema>("fields", p.obj<FormSchema>("schema", {}));
  const props = schema.properties ?? {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const incoming = p.obj<Record<string, unknown>>("value", p.obj<Record<string, unknown>>("data", {}));

  // `json` fields keep their raw textarea text apart from the parsed `values` so an in-progress /
  // invalid edit doesn't clobber the last parsed value or fight the controlled textarea.
  const jsonKeys = React.useMemo(
    () => Object.entries(props).filter(([, prop]) => isJsonField(prop ?? {})).map(([key]) => key),
    [JSON.stringify(props)],
  );
  const jsonTextFrom = React.useCallback((source: Record<string, unknown>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const key of jsonKeys) {
      const v = source[key];
      out[key] = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2);
    }
    return out;
  }, [jsonKeys]);

  const validators = schema.validators;

  const [values, setValues] = React.useState<Record<string, unknown>>(incoming ?? {});
  const [jsonText, setJsonText] = React.useState<Record<string, string>>(() => jsonTextFrom(incoming ?? {}));
  const [jsonErrors, setJsonErrors] = React.useState<Record<string, string>>({});
  const [dirty, setDirty] = React.useState(false);
  const [validation, setValidation] = React.useState<{ checked: boolean; errors: string[] }>({ checked: false, errors: [] });

  React.useEffect(() => {
    setValues(incoming ?? {});
    setJsonText(jsonTextFrom(incoming ?? {}));
    setJsonErrors({});
    setDirty(false);
    setValidation({ checked: false, errors: [] });
  }, [JSON.stringify(incoming)]);

  const setField = (key: string, nextValue: unknown) => {
    setValues((current) => ({ ...current, [key]: nextValue }));
    setDirty(true);
  };

  const setJsonField = (key: string, text: string) => {
    setJsonText((current) => ({ ...current, [key]: text }));
    setDirty(true);
    const trimmed = text.trim();
    if (trimmed === "") {
      setJsonErrors((cur) => ({ ...cur, [key]: "" }));
      setValues((cur) => ({ ...cur, [key]: undefined }));
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      setJsonErrors((cur) => ({ ...cur, [key]: "" }));
      setValues((cur) => ({ ...cur, [key]: parsed }));
    } catch (err) {
      setJsonErrors((cur) => ({ ...cur, [key]: err instanceof Error ? err.message : "Invalid JSON" }));
    }
  };

  const hasJsonError = Object.values(jsonErrors).some((message) => message);

  // Re-run declarative validators whenever the committed values settle. Keyed on serialized values so
  // the Save gate stays live without running per keystroke inside each field.
  React.useEffect(() => {
    if (!Array.isArray(validators) || validators.length === 0) return;
    const report = runDeclarativeValidators(validators, values as Json);
    setValidation({ checked: true, errors: report.errors.map((issue) => issue.detail) });
  }, [validators, JSON.stringify(values)]);

  const submitDisabled = hasJsonError || (validation.checked && validation.errors.length > 0);

  const reset = () => {
    setValues(incoming ?? {});
    setJsonText(jsonTextFrom(incoming ?? {}));
    setJsonErrors({});
    setDirty(false);
    setValidation({ checked: false, errors: [] });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (hasJsonError) return;
    const report = runDeclarativeValidators(validators, values as Json);
    setValidation({ checked: true, errors: report.errors.map((issue) => issue.detail) });
    if (!report.ok) return;
    emit("save", { values });
    setDirty(false);
  };

  return (
    <form className="gx-col" onSubmit={submit}>
      {Object.entries(props).map(([key, prop]) => {
        const field = prop ?? {};
        const title = String(field.title ?? key);
        const isRequired = required.includes(key);
        const current = values[key];

        if (isJsonField(field)) {
          const rowsRaw = Number.parseInt(String(field.rows ?? 8), 10);
          const rows = Number.isFinite(rowsRaw) && rowsRaw > 0 ? rowsRaw : 8;
          const err = jsonErrors[key];
          return (
            <label key={key} className="gx-field gx-json-field">
              {field.title ? <span className="gx-field-label">{title}</span> : null}
              <textarea
                className={err ? "gx-json-input invalid" : "gx-json-input"}
                spellCheck={false}
                rows={rows}
                value={jsonText[key] ?? ""}
                placeholder={String(field.placeholder ?? "")}
                required={isRequired}
                onChange={(event) => setJsonField(key, event.target.value)}
              />
              {err ? <span className="gx-json-error" role="alert">{err}</span> : null}
            </label>
          );
        }

        if (field.type === "boolean") {
          return (
            <label key={key} className="gx-row" style={{ alignItems: "center" }}>
              <input
                type="checkbox"
                checked={Boolean(current)}
                onChange={(event) => setField(key, event.target.checked)}
              />
              <span className="gx-field-label">{title}</span>
            </label>
          );
        }

        if (isMultiSelect(field)) {
          const selected = Array.isArray(current) ? current.map(String) : [];
          const options = toOptions(buildMultiOptions(field));
          return (
            <label key={key} className="gx-field">
              <span className="gx-field-label">{title}</span>
              <select
                multiple
                value={selected}
                required={isRequired}
                onChange={(event) => setField(key, Array.from(event.target.selectedOptions).map((option) => option.value))}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          );
        }

        if (isSelectField(field)) {
          const options = toOptions(buildFieldOptions(field) ?? []);
          const value = current == null ? "" : String(current);
          return (
            <label key={key} className="gx-field">
              <span className="gx-field-label">{title}</span>
              <select value={value} required={isRequired} onChange={(event) => setField(key, event.target.value)}>
                {isRequired ? null : <option value="">All</option>}
                {options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          );
        }

        if (isTextareaField(field)) {
          return (
            <label key={key} className="gx-field">
              <span className="gx-field-label">{title}</span>
              <textarea
                rows={Number.parseInt(String(field.rows ?? 4), 10) || 4}
                value={current == null ? "" : String(current)}
                placeholder={String(field.placeholder ?? "")}
                required={isRequired}
                onChange={(event) => setField(key, event.target.value)}
              />
            </label>
          );
        }

        const type = inputTypeFor(field);
        const value = type === "date" || type === "time" || type === "datetime-local"
          ? formatTemporalValue(field, current)
          : current == null ? "" : String(current);
        return (
          <label key={key} className="gx-field">
            <span className="gx-field-label">{title}</span>
            <input
              type={type}
              value={value}
              placeholder={String(field.placeholder ?? "")}
              required={isRequired}
              min={typeof field.minimum === "number" ? field.minimum : undefined}
              max={typeof field.maximum === "number" ? field.maximum : undefined}
              step={field.type === "integer" ? "1" : (field.type === "number" ? "any" : undefined)}
              onChange={(event) => setField(key, coerceFieldValue(event.target.value, field))}
            />
          </label>
        );
      })}
      {validation.checked && validation.errors.length > 0 ? (
        <div className="gx-form-errors" role="alert">
          {validation.errors.map((message, index) => (
            <span key={index} className="gx-json-error">{message}</span>
          ))}
        </div>
      ) : null}
      {dirty ? (
        <div className="gx-panel-actions">
          <button type="button" className="gx-btn" onClick={reset}>
            {p.str("discardLabel", "Discard")}
          </button>
          <button type="submit" className="gx-btn gx-btn-primary" disabled={submitDisabled}>
            {p.str("saveLabel", "Save")}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function Select({ node, emit }: ProjectionViewProps) {
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

function Selection({ node, emit }: ProjectionViewProps) {
  const field = getSingleFieldConfig(node);
  if (!field) {
    return <p className="gx-muted">No selection configured</p>;
  }

  const value = field.currentValue;
  const options = toOptions(field.options);
  const title = String(field.prop.title ?? field.fieldKey);

  return (
    <label className="gx-field">
      {field.prop.title ? <span className="gx-field-label">{title}</span> : null}
      <select
        value={value}
        required={field.isRequired}
        aria-label={title}
        onChange={(e) => emit("select", { value: e.target.value })}
      >
        {field.isRequired ? null : <option value="">All</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Button({ node, emit }: ProjectionViewProps) {
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

function TabBar({ node, emit }: ProjectionViewProps) {
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

function Searchbox({ node, emit }: ProjectionViewProps) {
  const field = getSingleFieldConfig(node);
  const p = readProps(node);
  const buttonLabel = p.str("actionLabel", "Search");
  const [journalValue, setJournalValue] = useSyncedValue(field?.currentValue ?? "");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!field) return;
    emit("submit", { value: coerceFieldValue(journalValue, field.prop) });
  };

  if (!field) {
    return <p className="gx-muted">No search field configured</p>;
  }

  const placeholder = String(field.prop.placeholder ?? field.prop.title ?? field.fieldKey);
  const type = field.prop.format === "date"
    ? "date"
    : field.prop.type === "number" || field.prop.type === "integer"
      ? "number"
      : "search";
  const value = type === "date"
    ? (journalValue ? String(journalValue).slice(0, 10) : "")
    : journalValue;

  return (
    <form className="gx-searchbox" onSubmit={handleSubmit}>
      <input
        type={type}
        value={value}
        min={typeof field.prop.minimum === "number" ? field.prop.minimum : undefined}
        max={typeof field.prop.maximum === "number" ? field.prop.maximum : undefined}
        step={field.prop.type === "integer" ? "1" : (field.prop.type === "number" ? "any" : undefined)}
        placeholder={placeholder}
        aria-label={String(field.prop.title ?? field.fieldKey)}
        required={field.isRequired}
        onChange={(e) => setJournalValue(e.target.value)}
      />
      <button type="submit" aria-label={buttonLabel} title={buttonLabel}>{buttonLabel}</button>
    </form>
  );
}

function Todo({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const sourceItems = (p.list<unknown>("items").length > 0 ? p.list<unknown>("items") : p.list<unknown>("baseItems"))
    .map((item) => {
      if (!item || typeof item !== "object") {
        return { text: String(item ?? ""), done: false };
      }

      const row = item as Record<string, unknown>;
      return {
        text: String(row.text ?? ""),
        done: Boolean(row.done),
      };
    });
  const [items, setItems] = React.useState(sourceItems);

  React.useEffect(() => {
    setItems(sourceItems);
  }, [JSON.stringify(sourceItems)]);

  const [draft, setDraft] = React.useState("");

  const save = (next: Array<{ text: string; done: boolean }>) => {
    setItems(next);
    emit("save", { items: next });
  };

  return (
    <div className="gx-panel" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 6 }}>
        {items.length === 0 ? <p className="gx-muted">Nothing here yet.</p> : null}
        {items.map((item, index) => (
          <div key={`${index}-${item.text}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={item.done}
              aria-label={item.text || `Todo ${index + 1}`}
              onChange={(event) => {
                const next = items.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, done: event.target.checked } : entry
                );
                save(next);
              }}
            />
            <span style={{ flex: 1, opacity: item.done ? 0.65 : 1, textDecoration: item.done ? "line-through" : "none" }}>
              {item.text}
            </span>
            <button
              type="button"
              aria-label={`remove ${item.text || `todo ${index + 1}`}`}
              onClick={() => save(items.filter((_, entryIndex) => entryIndex !== index))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <form
        className="gx-searchbox"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text) return;
          save([...items, { text, done: false }]);
          setDraft("");
        }}
      >
        <input
          type="text"
          value={draft}
          placeholder={p.str("placeholder", "Add item...")}
          aria-label={p.str("composerLabel", "Add todo item")}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit">{p.str("actionLabel", "+")}</button>
      </form>
    </div>
  );
}

function Actions({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  // Canonical prop is `buttons`; `items`/`actions` are accepted as defensive aliases so a recipe
  // that binds `read.items` still renders its button row instead of collapsing to nothing.
  const source = ((): unknown[] => {
    const buttons = p.list<unknown>("buttons");
    if (buttons.length > 0) return buttons;
    const items = p.list<unknown>("items");
    if (items.length > 0) return items;
    return p.list<unknown>("actions");
  })();
  const buttons = source
    .map((entry, index) => {
      if (typeof entry === "string") {
        return { id: entry, label: entry, tone: "default", disabled: false, index };
      }

      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = String(row.id ?? row.value ?? row.label ?? `action-${index}`);
      return {
        id,
        label: String(row.label ?? id),
        tone: String(row.tone ?? row.style ?? "default"),
        disabled: Boolean(row.disabled),
        index,
      };
    })
    .filter((entry): entry is { id: string; label: string; tone: string; disabled: boolean; index: number } => !!entry);

  if (buttons.length === 0) return null;

  return (
    <div className="gx-panel-actions">
      {buttons.map((button) => (
        <button
          key={`${button.id}-${button.index}`}
          className={`gx-btn gx-btn-${button.tone}`}
          disabled={button.disabled}
          onClick={() => emit("press", { id: button.id })}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

function Notes({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const baseContent = p.str("content") || p.str("value");
  const [content, setContent] = useSyncedValue(baseContent);
  const dirty = content !== baseContent;
  const rows = Math.max(3, Number.parseInt(String(node.props.rows ?? 8), 10) || 8);

  return (
    <div className="gx-col">
      <label className="gx-field">
        {p.str("label") ? <span className="gx-field-label">{p.str("label")}</span> : null}
        <textarea
          rows={rows}
          value={content}
          placeholder={p.str("placeholder", "Write markdown...")}
          onChange={(event) => setContent(event.target.value)}
        />
      </label>
      {dirty ? (
        <div className="gx-panel-actions">
          <button type="button" className="gx-btn" onClick={() => setContent(baseContent)}>
            {p.str("discardLabel", "Discard")}
          </button>
          <button type="button" className="gx-btn gx-btn-primary" onClick={() => emit("save", { content })}>
            {p.str("saveLabel", "Save")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EditableTable({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const spec = p.obj<EditableTableSpec>("spec", {});
  const incomingRows = editableRowsFrom(
    p.list<unknown>("rows").length > 0 ? p.list<unknown>("rows") : p.list<unknown>("baseRows")
  );
  const [rows, setRows] = React.useState(incomingRows);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setRows(incomingRows);
    setDirty(false);
  }, [JSON.stringify(incomingRows)]);

  const columns = editableColumns(spec, rows);
  const canAdd = spec.addRow !== false;
  const canDelete = spec.deleteRow !== false;
  const placeholder = spec.placeholder ?? "No data";
  const schemaProps = spec.schema?.properties ?? {};

  const updateRows = (next: Array<Record<string, unknown>>) => {
    setRows(next);
    setDirty(true);
  };

  if (columns.length === 0 && !canAdd) {
    return <p className="gx-muted">{placeholder}</p>;
  }

  return (
    <div className="gx-panel" style={{ display: "grid", gap: 8 }}>
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
            {canDelete ? <th aria-label="actions" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (canDelete ? 1 : 0)}>{placeholder}</td>
            </tr>
          ) : rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => {
                const prop = schemaProps[column] ?? {};
                const isNumber = prop.type === "number" || prop.type === "integer" || typeof row[column] === "number";
                return (
                  <td key={column}>
                    <input
                      type={isNumber ? "number" : "text"}
                      value={row[column] == null ? "" : String(row[column])}
                      onChange={(event) => {
                        const next = rows.map((entry) => ({ ...entry }));
                        next[rowIndex][column] = isNumber
                          ? (event.target.value === "" ? 0 : Number.parseFloat(event.target.value))
                          : event.target.value;
                        updateRows(next);
                      }}
                    />
                  </td>
                );
              })}
              {canDelete ? (
                <td>
                  <button type="button" aria-label={`remove row ${rowIndex + 1}`} onClick={() => updateRows(rows.filter((_, index) => index !== rowIndex))}>
                    ✕
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8 }}>
        {canAdd ? (
          <button
            type="button"
            onClick={() => {
              const blank = Object.fromEntries(columns.map((column) => [column, ""]));
              updateRows([...rows, blank]);
            }}
          >
            + Add row
          </button>
        ) : null}
        {dirty ? <button type="button" onClick={() => { setRows(incomingRows); setDirty(false); }}>Discard</button> : null}
        {dirty ? <button type="button" onClick={() => { emit("save", { rows }); setDirty(false); }}>Save</button> : null}
      </div>
    </div>
  );
}

function MultiFileUpload({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const fileServices = useGenUIFileServices();
  const source = (node.props as Record<string, unknown>).data ?? {
    files: p.list<unknown>("files"),
    filegroups: p.list<unknown>("filegroups"),
  };
  const { files, filegroups } = resolveMultiFileData(source);
  const [text, setText] = React.useState("");
  const [staged, setStaged] = React.useState<File[]>([]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const acceptList = p.list<string>("accept");
  const accept = acceptList.length > 0 ? acceptList.join(",") : undefined;
  const placeholder = p.str("placeholder", "Add a message…");
  const submitLabel = p.str("submitLabel", "Upload");

  const submit = async () => {
    if (staged.length === 0) return;
    const trimmed = text.trim();
    const metadata = staged.map((file) => ({
      name: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified,
    }));

    emit("submit", { text: trimmed, files: metadata });
    if (fileServices?.uploadFilesMultiple) {
      try {
        await Promise.resolve(fileServices.uploadFilesMultiple(staged, trimmed || undefined));
      } catch {
        return;
      }
    }

    setText("");
    setStaged([]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="gx-panel" style={{ display: "grid", gap: 12 }}>
      {filegroups.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {filegroups.map((group, groupIndex) => (
            <div key={groupIndex} className="gx-panel" style={{ display: "grid", gap: 6 }}>
              {typeof group?.message === "string" && group.message.trim() ? <div>{group.message.trim()}</div> : null}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(Array.isArray(group?.file_idxs) ? group.file_idxs : []).map((fileIndex) => {
                  const file = files[fileIndex];
                  if (!file) return null;
                  const href = fileServices?.resolveFileUrl?.(fileIndex, file) ?? null;
                  const name = typeof file.name === "string" && file.name ? file.name : typeof file.stored_name === "string" ? file.stored_name : `file ${fileIndex}`;
                  const size = typeof file.size === "number" ? ` (${formatFileSize(file.size)})` : "";
                  return href
                    ? <a key={fileIndex} href={href} target="_blank" rel="noreferrer">{name}{size}</a>
                    : <span key={fileIndex}>{name}{size}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {staged.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {staged.map((file, index) => (
            <span key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
              {file.name} ({formatFileSize(file.size)})
              <button type="button" aria-label={`remove ${file.name}`} onClick={() => setStaged((current) => current.filter((_, currentIndex) => currentIndex !== index))}>×</button>
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept={accept}
          onChange={(event) => {
            const next = Array.from(event.target.files ?? []);
            if (next.length === 0) return;
            setStaged((current) => {
              const merged = [...current];
              for (const file of next) {
                const exists = merged.some((entry) => entry.name === file.name && entry.size === file.size && entry.lastModified === file.lastModified);
                if (!exists) {
                  merged.push(file);
                }
              }

              return merged;
            });
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()}>Attach files</button>
        <input type="text" value={text} placeholder={placeholder} onChange={(event) => setText(event.target.value)} />
        <button type="button" onClick={() => void submit()} disabled={staged.length === 0}>{submitLabel}</button>
      </div>
    </div>
  );
}

function Chips({ node, emit }: ProjectionViewProps) {
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

function Embed({ node }: ProjectionViewProps) {
  const p = readProps(node);
  // Two ways to host a whole bundle in a leaf:
  //   props.app     -> a KNOWN app resolved by name from the registry (carries native effects)
  //   props.bundle  -> an INLINE JSON bundle from state (runtime-built, e.g. preview/playground)
  const appName = p.str("app", "");
  const inline = p.obj<SerializableBundle | null>("bundle", null);
  const registry = useBundleRegistry();
  const resolveProvider = useProjectionProviderResolver();
  const sig = appName ? `app:${appName}` : bundleSignature(inline);
  // Resolve the source bundle once per signature: a registered app by name (bundle-kind), else the
  // inline JSON bundle from state. Building it inside the memo keeps the factory from re-running.
  const bundle = React.useMemo<SerializableBundle | Bundle | null>(() => {
    const entry = appName ? registry?.get(appName) : undefined;
    return entry?.kind === "bundle" ? entry.make() : inline;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const controller = React.useMemo(
    () => (bundle ? loadBundle(bundle) : null),
    [sig] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Every embedded bundle — a named app or an inline JSON bundle — resolves its `alias:name`
  // capabilities through its own manifest `externals.projectionViews` (the floor via the `floor`
  // provider, its own projection views via `self`).
  // Every embedded bundle — a named app or an inline JSON bundle — resolves its `alias:name`
  // capabilities through its own manifest `externals.projectionViews` (the floor via the `floor`
  // provider, its own projection views via `self`).
  const renderRegistry = React.useMemo(
    () => (bundle ? buildBundleRegistry(bundle as Bundle, resolveProvider ?? undefined) : null),
    [sig, resolveProvider] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!controller || !renderRegistry) return <p className="gx-muted">{p.str("emptyText", "Nothing to preview.")}</p>;
  return (
    <div className="gx-bundle">
      <GenUIRoot source={controller} registry={renderRegistry} />
    </div>
  );
}

function Fallback({ node }: ProjectionViewProps) {
  return <div className="gx-muted">Unsupported primitive: {node.capability}</div>;
}

/** The floor's raw capability -> component map: the `floor` PROVIDER that a bundle's `externals`
 *  binds an alias to (see buildRegistryFromImports). */
export const FLOOR_COMPONENTS: Record<string, ProjectionView> = {
  screen: Screen,
  row: Row,
  col: Col,
  panel: Panel,
  text: Text,
  heading: Heading,
  note: Note,
  badge: Badge,
  alert: Alert,
  metric: Metric,
  narrative: Narrative,
  property: Property,
  maplist: MapList,
  timeline: Timeline,
  stats: Stats,
  diff: Diff,
  vocabulary: Vocabulary,
  codeBlock: CodeBlock,
  chart: ChartPrimitive,
  markdown: Markdown,
  markup: Markdown,
  todo: Todo,
  actions: Actions,
  notes: Notes,
  "editable-table": EditableTable,
  "multi-file-upload": MultiFileUpload,
  list: List,
  table: Table,
  selection: Selection,
  field: Field,
  textarea: TextArea,
  "json-field": JsonField,
  select: Select,
  form: Form,
  button: Button,
  tabBar: TabBar,
  chips: Chips,
  searchbox: Searchbox,
  query: Searchbox,
  embed: Embed,
};

/** The floor's fallback view (exported so import-driven registries share one graceful fallback). */
export const floorFallback: ProjectionView = Fallback;

/**
 * Build a bundle's render registry from its manifest `externals.projectionViews` (the end-state,
 * namespaced model): every `alias:name` reference resolves through an explicit import — the floor is
 * the `floor` provider, the bundle's own projection views are `self`, and any other provider name is
 * resolved by an optional `crossProvider` (e.g. an app-registry lookup for borrowing another
 * bundle's capability). Nothing is ambient: a bundle with no imports renders everything as fallback.
 */
export function buildBundleRegistry(
  bundle: Bundle,
  crossProvider?: ProviderResolver
): ComponentRegistry {
  const resolve: ProviderResolver = (from) => {
    if (from === "floor") return FLOOR_COMPONENTS;
    if (from === "self") return bundle.projectionViews;
    return crossProvider?.(from);
  };
  return buildRegistryFromImports(unwrap(bundle.manifest).externals?.projectionViews, resolve, Fallback);
}
