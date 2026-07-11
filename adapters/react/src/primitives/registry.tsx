// The PLATFORM FLOOR, part 4: the shared primitive React registry (the pixels).
//
// One registry, shared by every bundle — the GenUI equivalent of the frontend's Tier-1 leaves.
// Each primitive obeys the uniform capability contract ({ node, emit, children }) and reads its
// configuration + bound data from `node.props` (populated by the document's read edges). Most apps
// ship NO projection views and just compose these primitives; a bundle that needs specialized controls
// declares its own projection views as the `self` provider in its manifest `externals` (see bundle.projectionViews).

import React from "react";
import { unwrap } from "../../../../kernel/src/index";
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
import { useBundleRegistry } from "./bundle-registry";
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
function toColumns(raw: unknown[]): Column[] {
  return raw.map((c) => (typeof c === "string" ? { key: c, label: c } : (c as Column)));
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

function Metric({ node }: ProjectionViewProps) {
  const p = readProps(node);
  return (
    <div className="gx-metric">
      <span className="gx-metric-label">{p.str("label")}</span>
      <strong className="gx-metric-value">{p.str("value")}</strong>
    </div>
  );
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

function Table({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const rows = p.list<Record<string, unknown>>("rows");
  const columns = toColumns(p.list<unknown>("columns"));
  const idKey = p.str("idKey", "id");
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
    () => (bundle ? buildBundleRegistry(bundle as Bundle) : null),
    [sig] // eslint-disable-line react-hooks/exhaustive-deps
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
  metric: Metric,
  codeBlock: CodeBlock,
  chart: ChartPrimitive,
  markdown: Markdown,
  markup: Markdown,
  todo: Todo,
  editableTable: EditableTable,
  multiFileUpload: MultiFileUpload,
  list: List,
  table: Table,
  selection: Selection,
  field: Field,
  textarea: TextArea,
  select: Select,
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
