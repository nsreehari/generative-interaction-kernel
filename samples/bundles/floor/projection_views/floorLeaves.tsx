// The PLATFORM FLOOR, part 4: the shared primitive React registry (the pixels).
//
// One registry, shared by every bundle — the GenUI equivalent of the frontend's Tier-1 leaves.
// Each primitive obeys the uniform capability contract ({ node, emit, children }) and reads its
// configuration + bound data from `node.props` (populated by the document's read edges). Most apps
// ship NO projection views and just compose these primitives; a bundle that needs specialized controls
// declares its own projection views as the `self` provider in its manifest `externals` (see bundle.projectionViews).

import React from "react";
import "@xyflow/react/dist/style.css";
import {
  Form as PrimitiveForm,
} from "@gik/components/primitives";
import { unwrap, type Json, type ResolvedNode } from "@gik/kernel";
import {
  buildBundleRegistry,
  bundleSignature,
  GenUIRoot,
  loadBundle,
  readProps,
  useBundleContexts,
  useBundleContextSync,
  useBundleRegistry,
  useGenUIFileServices,
  useProjectionProviderResolver,
  type Bundle,
  type SerializableBundle,
  type ProjectionView,
  type ProjectionViewProps,
} from "@gik/react";

interface Option {
  value: string;
  label: string;
}
interface Column {
  key: string;
  label: string;
  classPrefix?: string;
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

// Numeric-aware, null-tolerant cell comparison used by the sortable table. Nulls always sort last
// (independent of direction); two numbers compare numerically; everything else compares as text.
function compareCells(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result =
    typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return dir === "asc" ? result : -result;
}

/** Stable, numeric-aware sort of table rows by a column key. Pure — the leaf's sort state drives it. */
export function sortRows<T extends Record<string, unknown>>(rows: T[], key: string, dir: "asc" | "desc"): T[] {
  return rows.map((row, index) => ({ row, index }))
    .sort((a, b) => compareCells(a.row[key], b.row[key], dir) || a.index - b.index)
    .map((entry) => entry.row);
}

// Only allow link schemes that can't execute script. Anything else (e.g. `javascript:`) falls back
// to plain text so untrusted markdown can't smuggle an XSS payload through a link.
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^(https?:|mailto:|\/|#|\.)/i.test(trimmed) ? trimmed : null;
}

// Inline markdown within a single line: `code`, **bold**, *italic*/_italic_, and [text](url) links.
// Returns a React node (string when there's no formatting) so callers can drop it straight into JSX.
function renderInline(text: string): React.ReactNode {
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={key++} className="gx-text-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = link ? safeHref(link[2]) : null;
      if (link && href) {
        nodes.push(
          <a key={key++} className="gx-link" href={href} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  if (nodes.length === 0) return text;
  return nodes.length === 1 ? nodes[0] : nodes;
}

let mermaidInitialized = false;

function MermaidDiagram({ source }: { source: string }) {
  const diagramId = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setSvg(null);
    setFailed(false);

    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        if (!mermaidInitialized) {
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
          mermaidInitialized = true;
        }
        const rendered = await mermaid.render(`gx-mermaid-${diagramId}`, source);
        if (active) setSvg(rendered.svg);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [diagramId, source]);

  if (!svg || failed) {
    return (
      <pre className="gx-markdown-code" data-mermaid-fallback>
        <code className="language-mermaid">{source}</code>
      </pre>
    );
  }

  return <div className="gx-mermaid" role="img" aria-label="Mermaid diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function parseMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells;
}

function isMarkdownTableSeparator(line: string, columns: number): boolean {
  const cells = parseMarkdownTableRow(line);
  return cells.length === columns && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderMarkdownBlocks(value: string): React.ReactNode[] {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let fenceLanguage: string | null = null;
  let fenceLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      nodes.push(<p key={`p-${nodes.length}`}>{renderInline(paragraph.join(" "))}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      const items = listItems.map((item, index) => <li key={index}>{renderInline(item)}</li>);
      nodes.push(
        listOrdered
          ? <ol key={`ol-${nodes.length}`}>{items}</ol>
          : <ul key={`ul-${nodes.length}`}>{items}</ul>,
      );
      listItems = [];
    }
  };
  const flushFence = () => {
    if (fenceLanguage === null) return;
    const source = fenceLines.join("\n");
    nodes.push(
      fenceLanguage.toLowerCase() === "mermaid"
        ? <MermaidDiagram key={`fence-${nodes.length}`} source={source} />
        : (
          <pre key={`fence-${nodes.length}`} className="gx-markdown-code">
            <code className={fenceLanguage ? `language-${fenceLanguage}` : undefined}>{source}</code>
          </pre>
        ),
    );
    fenceLanguage = null;
    fenceLines = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trim();
    if (fenceLanguage !== null) {
      if (/^```\s*$/.test(line)) flushFence();
      else fenceLines.push(rawLine);
      continue;
    }

    const fence = /^```([^\s`]*)\s*$/.exec(line);
    if (fence) {
      flushParagraph();
      flushList();
      fenceLanguage = fence[1];
      continue;
    }

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const tableHeaders = line.includes("|") ? parseMarkdownTableRow(line) : [];
    const tableSeparator = lines[lineIndex + 1]?.trim() ?? "";
    if (tableHeaders.length > 1 && isMarkdownTableSeparator(tableSeparator, tableHeaders.length)) {
      flushParagraph();
      flushList();
      const rows: string[][] = [];
      lineIndex += 2;
      while (lineIndex < lines.length && lines[lineIndex].trim().includes("|")) {
        const cells = parseMarkdownTableRow(lines[lineIndex]);
        if (cells.length !== tableHeaders.length) break;
        rows.push(cells);
        lineIndex += 1;
      }
      lineIndex -= 1;
      nodes.push(
        <div key={`table-${nodes.length}`} className="gx-markdown-table-wrap">
          <table className="gx-markdown-table">
            <thead>
              <tr>{tableHeaders.map((header, index) => <th key={index}>{renderInline(header)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      nodes.push(<Tag key={`h-${nodes.length}`}>{renderInline(heading[2])}</Tag>);
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (!listOrdered) flushList();
      listOrdered = true;
      listItems.push(ordered[1]);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (listOrdered) flushList();
      listOrdered = false;
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushFence();
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
      <div className="gx-row gx-row-between">
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
  const detail = p.str("detail", p.str("caption"));
  return (
    <div className={variant ? `gx-metric gx-metric-${variant}` : "gx-metric"}>
      <span className="gx-metric-label">{p.str("label")}</span>
      <strong className="gx-metric-value">{p.str("value")}</strong>
      {detail ? <span className="gx-metric-detail gx-muted">{detail}</span> : null}
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function formatDiffValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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

  // When both sides are plain objects, show a field-level comparison so a reader sees exactly which
  // keys were added, removed, or changed — far more legible than two raw JSON blobs. Non-object
  // values (strings, arrays, primitives) fall back to the side-by-side JSON view.
  if (isPlainRecord(before) && isPlainRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return (
      <div className="gx-diff">
        {keys.map((key) => {
          const hasBefore = key in before;
          const hasAfter = key in after;
          const changed = JSON.stringify(before[key]) !== JSON.stringify(after[key]);
          const status = !hasBefore ? "added" : !hasAfter ? "removed" : changed ? "changed" : "same";
          return (
            <div key={key} className={`gx-diff-row gx-diff-${status}`}>
              <span className="gx-diff-key">{key}</span>
              <span className="gx-diff-before">{hasBefore ? formatDiffValue(before[key]) : "—"}</span>
              <span className="gx-diff-arrow" aria-hidden="true">→</span>
              <span className="gx-diff-after">{hasAfter ? formatDiffValue(after[key]) : "—"}</span>
            </div>
          );
        })}
      </div>
    );
  }

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
  const empty = p.str("emptyText", "No rows.");
  const isStatic = p.bool("static"); // passive display (no rowSelect), vs the default picker
  const blank = p.str("blankText", ""); // placeholder for null/empty cells
  const sortable = node.props.sortable !== false; // click-to-sort columns, on by default
  const maxRows = typeof node.props.maxRows === "number" ? node.props.maxRows : 200; // render cap

  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  // Reset the active sort when the underlying data changes (parity with the frontend table). Keyed
  // on a content signature so identical re-renders don't drop the user's chosen sort.
  const rowsSignature = React.useMemo(() => JSON.stringify(rows), [rows]);
  React.useEffect(() => {
    setSort(null);
  }, [rowsSignature]);

  const limit = Math.min(rows.length, Math.max(0, maxRows));

  // Rows carry a stable render key derived from `idKey` (or their pre-sort position) so sorting
  // reorders rather than remounts. Columns are inferred from the capped set when not given.
  const indexed = React.useMemo(
    () => rows.slice(0, limit).map((row, index) => ({ row, id: String(row[idKey] ?? index) })),
    [rowsSignature, limit, idKey],
  );
  const columns = explicitColumns.length > 0
    ? explicitColumns
    : inferColumns(indexed.map((e) => e.row), idKey);

  const visibleRows = React.useMemo(() => {
    if (!sortable || !sort) return indexed;
    return indexed
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => compareCells(a.entry.row[sort.key], b.entry.row[sort.key], sort.dir) || a.index - b.index)
      .map((wrapped) => wrapped.entry);
  }, [indexed, sort, sortable]);

  if (rows.length === 0) return <p className="gx-muted">{empty}</p>;

  const toggleSort = (key: string) =>
    setSort((current) =>
      current && current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  return (
    <>
      <table className="gx-table">
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const arrow = active ? (sort!.dir === "asc" ? " \u2191" : " \u2193") : "";
              return (
                <th
                  key={c.key}
                  className={sortable ? "gx-table-sortable" : undefined}
                  role={sortable ? "button" : undefined}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  onClick={sortable ? () => toggleSort(c.key) : undefined}
                >
                  {c.label}{arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(({ row, id }) => (
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
          ))}
        </tbody>
      </table>
      {rows.length > limit ? (
        <p className="gx-muted gx-table-overflow">Showing {limit} of {rows.length} rows</p>
      ) : null}
    </>
  );
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
  return <PrimitiveForm node={formNode} emit={emit} children={undefined} />;
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

function MathChallenge({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const operandA = Number(node.props.operandA ?? 3);
  const operandB = Number(node.props.operandB ?? 7);
  const expected = operandA + operandB;
  const [answer, setAnswer] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const titleId = `${node.id}-title`;
  const messageId = `${node.id}-message`;
  const answered = answer.trim().length > 0;
  const correct = answered && Number(answer) === expected;

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="gx-challenge-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onKeyDown={(event) => {
        if (event.key === "Escape") emit("cancel", { reason: "escape" });
      }}
    >
      <div className="gx-challenge-dialog">
        <h2 id={titleId}>{p.str("title", "Confirm destructive action")}</h2>
        <p id={messageId}>{p.str("message", "This action cannot be undone.")}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (correct) emit("confirm", {});
          }}
        >
          <label htmlFor={`${node.id}-answer`}>Solve to continue: <strong>{operandA} + {operandB} = ?</strong></label>
          <input
            ref={inputRef}
            id={`${node.id}-answer`}
            type="number"
            inputMode="numeric"
            value={answer}
            aria-invalid={answered && !correct}
            autoComplete="off"
            onChange={(event) => setAnswer(event.target.value)}
          />
          <div className="gx-challenge-error" aria-live="polite">
            {answered && !correct ? "Incorrect answer. Try again." : ""}
          </div>
          <div className="gx-challenge-actions">
            <button className="gx-btn" type="button" onClick={() => emit("cancel", { reason: "button" })}>{p.str("cancelLabel", "Cancel")}</button>
            <button className="gx-btn gx-btn-danger" type="submit" disabled={!correct}>{p.str("confirmLabel", "Delete")}</button>
          </div>
        </form>
      </div>
    </div>
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
    <div className="gx-panel gx-stack">
      <div className="gx-stack gx-stack-tight">
        {items.length === 0 ? <p className="gx-muted">Nothing here yet.</p> : null}
        {items.map((item, index) => (
          <div key={`${index}-${item.text}`} className="gx-inline">
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
            <span className={`gx-todo-text${item.done ? " is-done" : ""}`}>
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

interface DirtyActionRowProps {
  dirty: boolean;
  discardLabel: string;
  saveLabel: string;
  onDiscard: () => void;
  onSave?: () => void;
  /** `"submit"` renders Save as a form submit button (Form); `"button"` wires `onSave` (default). */
  saveType?: "button" | "submit";
  saveDisabled?: boolean;
  /** Always-visible controls rendered before the dirty-gated Discard/Save (e.g. "+ Add row"). */
  leading?: React.ReactNode;
}

// Shared committed-editor footer. Renders the standard Discard/Save action row (only when `dirty`),
// optionally preceded by always-visible `leading` controls. Used by Form, EditableTable, and Notes
// so every committed editor exposes the same bottom action-buttons row.
function DirtyActionRow({
  dirty,
  discardLabel,
  saveLabel,
  onDiscard,
  onSave,
  saveType = "button",
  saveDisabled = false,
  leading = null,
}: DirtyActionRowProps) {
  if (!dirty && !leading) return null;
  return (
    <div className="gx-panel-actions">
      {leading}
      {dirty ? (
        <button type="button" className="gx-btn" onClick={onDiscard}>
          {discardLabel}
        </button>
      ) : null}
      {dirty ? (
        saveType === "submit" ? (
          <button type="submit" className="gx-btn gx-btn-primary" disabled={saveDisabled}>
            {saveLabel}
          </button>
        ) : (
          <button type="button" className="gx-btn gx-btn-primary" disabled={saveDisabled} onClick={onSave}>
            {saveLabel}
          </button>
        )
      ) : null}
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
      <DirtyActionRow
        dirty={dirty}
        discardLabel={p.str("discardLabel", "Discard")}
        saveLabel={p.str("saveLabel", "Save")}
        onDiscard={() => setContent(baseContent)}
        onSave={() => emit("save", { content })}
      />
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
    <div className="gx-panel gx-stack gx-stack-loose">
      {filegroups.length > 0 ? (
        <div className="gx-stack">
          {filegroups.map((group, groupIndex) => (
            <div key={groupIndex} className="gx-panel gx-stack gx-stack-tight">
              {typeof group?.message === "string" && group.message.trim() ? <div>{group.message.trim()}</div> : null}
              <div className="gx-inline-wrap">
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
        <div className="gx-inline-wrap">
          {staged.map((file, index) => (
            <span key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
              {file.name} ({formatFileSize(file.size)})
              <button type="button" aria-label={`remove ${file.name}`} onClick={() => setStaged((current) => current.filter((_, currentIndex) => currentIndex !== index))}>×</button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="gx-inline">
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
  const contexts = useBundleContexts();
  const sig = appName ? `app:${appName}` : bundleSignature(inline);
  // Resolve the source bundle once per signature: a registered app by name (bundle-kind), else the
  // inline JSON bundle from state. Building it inside the memo keeps the factory from re-running.
  const bundle = React.useMemo<SerializableBundle | Bundle | null>(() => {
    const entry = appName ? registry?.get(appName) : undefined;
    return entry?.kind === "bundle" ? entry.make() : inline;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const controller = React.useMemo(
    () => (bundle ? loadBundle(bundle, contexts) : null),
    [sig] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useBundleContextSync(controller, contexts);
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
    <div className={p.bool("unframed") ? undefined : "gx-bundle"}>
      <GenUIRoot source={controller} registry={renderRegistry} />
    </div>
  );
}

/** The sample floor's raw capability -> component provider map. */
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
  stats: Stats,
  diff: Diff,
  vocabulary: Vocabulary,
  codeBlock: CodeBlock,
  markdown: Markdown,
  markup: Markdown,
  todo: Todo,
  actions: Actions,
  notes: Notes,
  "multi-file-upload": MultiFileUpload,
  list: List,
  table: Table,
  selection: Selection,
  "json-field": JsonField,
  "math-challenge": MathChallenge,
  embed: Embed,
};

export default FLOOR_COMPONENTS;
