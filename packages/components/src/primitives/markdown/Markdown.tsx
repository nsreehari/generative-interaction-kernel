import React from "react";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema } from "../../shared/component";
import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

const useStyles = makeStyles({
  root: {
    minWidth: 0,
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    lineHeight: tokens.lineHeightBase300,
    overflowWrap: "anywhere",
    "& h1": { fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700, margin: `${tokens.spacingVerticalL} 0 ${tokens.spacingVerticalS}` },
    "& h2": { fontSize: tokens.fontSizeBase600, lineHeight: tokens.lineHeightBase600, margin: `${tokens.spacingVerticalL} 0 ${tokens.spacingVerticalS}` },
    "& h3": { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500, margin: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalXS}` },
    "& h4": { fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400, margin: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalXS}` },
    "& p": { margin: `0 0 ${tokens.spacingVerticalM}` },
    "& ul, & ol": { margin: `0 0 ${tokens.spacingVerticalM}`, paddingLeft: tokens.spacingHorizontalXXL },
    "& a": { color: tokens.colorBrandForegroundLink, textDecorationLine: "underline", textUnderlineOffset: "2px" },
    "& code": { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorBrandForeground1 },
  },
  code: {
    overflow: "auto",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  diagram: { overflow: "auto", margin: `${tokens.spacingVerticalM} 0`, textAlign: "center", "& svg": { display: "inline-block", maxWidth: "100%", height: "auto" } },
  tableWrap: { maxWidth: "100%", overflowX: "auto", margin: `${tokens.spacingVerticalM} 0` },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: tokens.fontSizeBase200,
    "& th": { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`, borderBottom: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralStroke1}`, textAlign: "left", whiteSpace: "nowrap" },
    "& td": { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`, borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, textAlign: "left", verticalAlign: "top" },
    "& tbody tr:hover": { backgroundColor: tokens.colorNeutralBackground2 },
  },
});

export function safeMarkdownHref(url: string): string | null {
  const trimmed = url.trim();
  return /^(https?:|mailto:|\/|#|\.)/i.test(trimmed) ? trimmed : null;
}

function renderInline(text: string): React.ReactNode {
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = link ? safeMarkdownHref(link[2]) : null;
      nodes.push(link && href ? <a key={key++} href={href} target="_blank" rel="noreferrer noopener">{link[1]}</a> : token);
    } else if (token.startsWith("**")) nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length === 0 ? text : nodes.length === 1 ? nodes[0] : nodes;
}

let mermaidInitialized = false;

function MermaidDiagram({ source, className, codeClassName }: { source: string; className: string; codeClassName: string }) {
  const diagramId = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    setSvg(null);
    void import("mermaid").then(async ({ default: mermaid }) => {
      if (!mermaidInitialized) {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
        mermaidInitialized = true;
      }
      const rendered = await mermaid.render(`gik-mermaid-${diagramId}`, source);
      if (active) setSvg(rendered.svg);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [diagramId, source]);
  return svg
    ? <div className={className} role="img" aria-label="Mermaid diagram" dangerouslySetInnerHTML={{ __html: svg }} />
    : <pre className={codeClassName} data-mermaid-fallback><code className="language-mermaid">{source}</code></pre>;
}

function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of line.trim().replace(/^\|/, "").replace(/\|$/, "")) {
    if (escaped) { cell += character; escaped = false; }
    else if (character === "\\") escaped = true;
    else if (character === "|") { cells.push(cell.trim()); cell = ""; }
    else cell += character;
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells;
}

function renderBlocks(value: string, styles: ReturnType<typeof useStyles>): React.ReactNode[] {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  let ordered = false;
  let fence: string | null = null;
  let fenceLines: string[] = [];
  const flushParagraph = () => { if (paragraph.length) { nodes.push(<p key={`p-${nodes.length}`}>{renderInline(paragraph.join(" "))}</p>); paragraph = []; } };
  const flushList = () => {
    if (!items.length) return;
    const children = items.map((item, index) => <li key={index}>{renderInline(item)}</li>);
    nodes.push(ordered ? <ol key={`ol-${nodes.length}`}>{children}</ol> : <ul key={`ul-${nodes.length}`}>{children}</ul>);
    items = [];
  };
  const flushFence = () => {
    if (fence === null) return;
    const source = fenceLines.join("\n");
    nodes.push(fence.toLowerCase() === "mermaid"
      ? <MermaidDiagram key={`f-${nodes.length}`} source={source} className={styles.diagram} codeClassName={styles.code} />
      : <pre key={`f-${nodes.length}`} className={styles.code}><code className={fence ? `language-${fence}` : undefined}>{source}</code></pre>);
    fence = null;
    fenceLines = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (fence !== null) { if (/^```\s*$/.test(line)) flushFence(); else fenceLines.push(raw); continue; }
    const fenceStart = /^```([^\s`]*)\s*$/.exec(line);
    if (fenceStart) { flushParagraph(); flushList(); fence = fenceStart[1]; continue; }
    if (!line) { flushParagraph(); flushList(); continue; }
    const headers = line.includes("|") ? tableCells(line) : [];
    const separator = lines[index + 1]?.trim() ?? "";
    if (headers.length > 1 && tableCells(separator).length === headers.length && tableCells(separator).every((cell) => /^:?-{3,}:?$/.test(cell))) {
      flushParagraph(); flushList();
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().includes("|")) {
        const row = tableCells(lines[index]);
        if (row.length !== headers.length) break;
        rows.push(row); index += 1;
      }
      index -= 1;
      nodes.push(<div key={`t-${nodes.length}`} className={styles.tableWrap}><table className={styles.table}><thead><tr>{headers.map((header, cell) => <th key={cell}>{renderInline(header)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, cell) => <td key={cell}>{renderInline(value)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); const Tag = `h${heading[1].length}` as "h1" | "h2" | "h3" | "h4"; nodes.push(<Tag key={`h-${nodes.length}`}>{renderInline(heading[2])}</Tag>); continue; }
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (numbered) { flushParagraph(); if (!ordered) flushList(); ordered = true; items.push(numbered[1]); continue; }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) { flushParagraph(); if (ordered) flushList(); ordered = false; items.push(bullet[1]); continue; }
    flushList(); paragraph.push(line);
  }
  flushParagraph(); flushList(); flushFence();
  return nodes;
}

export const Markdown: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const value = readProps(node).str("value");
  return value ? <div {...componentRootProps(node, styles.root, "gik-markdown")}>{renderBlocks(value, styles)}</div> : null;
};

const schema = { $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["value"], properties: { ...componentStylePropsSchema, value: { type: "string" } } } as const;
const description: ComponentDescription = {
  capability: "primitive:markdown",
  summary: "Safely renders authored Markdown as structured document content, including tables, code, and Mermaid diagrams.",
  dataProp: "value",
  events: [],
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: ["A trusted scalar contains Markdown document content", "Headings, lists, tables, code, and links must retain their structure"],
    avoidWhen: ["The value is plain text; use fluent:text", "The source must be shown verbatim; use primitive:source-viewer"],
    rules: ["Bind Markdown through value", "Do not pass HTML as a substitute for Markdown", "Use fenced mermaid blocks for diagrams"],
  },
};
export function validateMarkdown(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid primitive:markdown props", code: "primitive-markdown-schema" }], props as Json);
}
export const markdownDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: Markdown,
  getSchema: () => schema as unknown as Record<string, unknown>,
  validate: validateMarkdown,
  materializeTrial: () => trialNode("primitive:markdown", { value: "# Incident report\n\n**Status:** Ready" }),
});