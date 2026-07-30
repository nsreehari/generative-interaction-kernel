import React from "react";
import { EditRegular } from "@fluentui/react-icons";
import { makeStyles, tokens } from "@fluentui/react-components";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";

const useStyles = makeStyles({
  workspace: { width: "100%", height: "100vh", minWidth: 0, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "44px minmax(0, 1fr)", backgroundColor: "#ecefed", color: "#1d2522", fontFamily: "Aptos, 'Segoe UI Variable', sans-serif" },
  header: { minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalL, padding: `0 ${tokens.spacingHorizontalXL}`, borderBottom: "1px solid #cbd1cd", backgroundColor: "#ffffff" },
  brand: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, minWidth: 0 },
  brandMark: { width: "4px", height: "20px", backgroundColor: "#d13438" },
  title: { margin: 0, overflow: "hidden", fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, textOverflow: "ellipsis", whiteSpace: "nowrap" },
  headerMeta: { color: "#68716c", fontSize: tokens.fontSizeBase200, whiteSpace: "nowrap", "@media (max-width: 520px)": { display: "none" } },
  panes: { width: "100%", minWidth: 0, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "1px", backgroundColor: "#cbd1cd", "@media (max-width: 820px)": { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "minmax(520px, 1fr) minmax(520px, 1fr)", overflow: "auto" } },
  pane: { minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "52px minmax(0, 1fr)", backgroundColor: "#ffffff" },
  paneHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM, padding: `0 ${tokens.spacingHorizontalL}`, borderBottom: "1px solid #e1e5e2", backgroundColor: "#fafbfa" },
  paneTitle: { margin: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  paneActions: { minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: tokens.spacingHorizontalS },
  paneBody: { minHeight: 0, overflow: "auto", padding: tokens.spacingHorizontalXL },
  editorBody: { "& .gx-markdown": { maxWidth: "78ch", margin: "0 auto" }, "& .gx-form-grid": { display: "block" }, "& textarea": { minHeight: "calc(100vh - 190px)", resize: "vertical", fontFamily: "Cascadia Code, Consolas, monospace", fontSize: tokens.fontSizeBase200, lineHeight: 1.55 } },
  sampleSelector: { width: "min(280px, 38vw)", minWidth: "150px", "& .gx-fluent-dropdown": { width: "100%", maxWidth: "280px" }, "@media (max-width: 520px)": { width: "150px", minWidth: "0" } },
  iconButton: { width: "34px", height: "34px", display: "inline-grid", placeItems: "center", border: "1px solid #c6ccc8", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", color: "#27312c", cursor: "pointer", ":hover": { backgroundColor: "#f0f3f1" } },
  textButton: { minHeight: "34px", padding: `0 ${tokens.spacingHorizontalM}`, border: "1px solid #c6ccc8", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", color: "#27312c", font: "inherit", fontWeight: tokens.fontWeightSemibold, cursor: "pointer", ":hover": { backgroundColor: "#f0f3f1" } },
  analyzeButton: { minWidth: "132px", minHeight: "34px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: tokens.spacingHorizontalS, padding: `0 ${tokens.spacingHorizontalM}`, border: 0, borderRadius: tokens.borderRadiusMedium, backgroundColor: "#0b6a6c", color: "#ffffff", font: "inherit", fontWeight: tokens.fontWeightSemibold, cursor: "pointer", ":hover": { backgroundColor: "#07585a" }, ":disabled": { backgroundColor: "#d8ddda", color: "#747c77", cursor: "default" } },
  spinner: { width: "14px", height: "14px", border: "2px solid rgba(255,255,255,.45)", borderTopColor: "#ffffff", borderRadius: "50%", animationName: { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } }, animationDuration: "800ms", animationIterationCount: "infinite", animationTimingFunction: "linear" },
  status: { color: "#68716c", fontSize: tokens.fontSizeBase200 },
  empty: { height: "100%", minHeight: "280px", display: "grid", placeItems: "center", textAlign: "center" },
  emptyInner: { maxWidth: "420px" },
  emptyKicker: { margin: `0 0 ${tokens.spacingVerticalS}`, color: "#0b6a6c", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  emptyTitle: { margin: `0 0 ${tokens.spacingVerticalS}`, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  emptyText: { margin: 0, color: "#68716c", lineHeight: tokens.lineHeightBase400 },
  error: { margin: `0 0 ${tokens.spacingVerticalL}`, padding: tokens.spacingHorizontalM, borderLeft: "4px solid #d13438", backgroundColor: "#fdf3f4", color: "#8f1d22" },
  analysisHeader: { marginBottom: tokens.spacingVerticalXL },
  analysisEyebrow: { margin: `0 0 ${tokens.spacingVerticalXS}`, color: "#0b6a6c", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  analysisTitle: { margin: `0 0 ${tokens.spacingVerticalS}`, fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightSemibold, lineHeight: tokens.lineHeightBase500 },
  analysisSummary: { margin: 0, maxWidth: "76ch", color: "#505a55", lineHeight: tokens.lineHeightBase400 },
  projectionGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingHorizontalL, "@media (max-width: 1120px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  section: { minWidth: 0, padding: tokens.spacingHorizontalL, border: "1px solid #dce1de", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#fafbfa" },
  primary: { gridColumn: "1 / -1", borderTop: "3px solid #d13438" },
  sectionTitle: { margin: `0 0 ${tokens.spacingVerticalM}`, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  heroTitle: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  detail: { margin: `${tokens.spacingVerticalXS} 0 0`, color: "#58615d", lineHeight: tokens.lineHeightBase400 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: tokens.spacingHorizontalM, "@media (max-width: 520px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  metric: { paddingLeft: tokens.spacingHorizontalM, borderLeft: "3px solid #0b6a6c" },
  metricValue: { display: "block", fontSize: tokens.fontSizeBase600, fontVariantNumeric: "tabular-nums" },
  metricLabel: { color: "#68716c", fontSize: tokens.fontSizeBase200 },
  list: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: tokens.spacingVerticalM },
  listItem: { display: "grid", gridTemplateColumns: "70px minmax(0, 1fr)", gap: tokens.spacingHorizontalM },
  badge: { padding: "2px 5px", borderRadius: tokens.borderRadiusSmall, backgroundColor: "#f3d78a", color: "#4b3a00", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, textAlign: "center", textTransform: "uppercase" },
  critical: { backgroundColor: "#f9d7d8", color: "#9f1d22" },
  itemTitle: { display: "block", fontWeight: tokens.fontWeightSemibold, overflowWrap: "anywhere" },
  timeline: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: tokens.spacingVerticalM },
  timelineItem: { display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", gap: tokens.spacingHorizontalM, paddingLeft: tokens.spacingHorizontalM, borderLeft: "3px solid #d13438" },
  disclosure: { minWidth: 0 },
  disclosureSummary: { cursor: "pointer", fontWeight: tokens.fontWeightSemibold },
  disclosureBody: { marginTop: tokens.spacingVerticalM },
  provenance: { margin: `${tokens.spacingVerticalXL} 0 0`, color: "#747c77", fontSize: tokens.fontSizeBase200 },
});

type Item = { id: string; kind: string; title: string; detail: string; salience: string; value: string; unit: string; date: string };
type Section = { id: string; title: string; primitive: string; priority: string; disclosure: string; contentIds: string[] };
type Candidate = { id: string; label: string; attention: string; rationale: string; sections: Section[] };

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function itemsFrom(value: unknown): Item[] {
  return Array.isArray(value) ? value.map(asRecord).map((item) => ({
    id: String(item.id ?? ""), kind: String(item.kind ?? "fact"), title: String(item.title ?? ""), detail: String(item.detail ?? ""),
    salience: String(item.salience ?? "medium"), value: String(item.value ?? ""), unit: String(item.unit ?? ""), date: String(item.date ?? ""),
  })).filter((item) => item.id && item.title) : [];
}

function candidatesFrom(value: unknown): Candidate[] {
  return Array.isArray(value) ? value.map(asRecord).map((candidate) => ({
    id: String(candidate.id ?? ""), label: String(candidate.label ?? ""), attention: String(candidate.attention ?? ""), rationale: String(candidate.rationale ?? ""),
    sections: Array.isArray(candidate.sections) ? candidate.sections.map(asRecord).map((section) => ({
      id: String(section.id ?? ""), title: String(section.title ?? ""), primitive: String(section.primitive ?? ""), priority: String(section.priority ?? "secondary"),
      disclosure: String(section.disclosure ?? "collapsed"), contentIds: Array.isArray(section.contentIds) ? section.contentIds.map(String) : [],
    })) : [],
  })).filter((candidate) => candidate.id && candidate.sections.length > 0) : [];
}

export function analysisIsStale(content: unknown, analyzedContent: unknown): boolean {
  return typeof content === "string" && content.length > 0 && content !== analyzedContent;
}

export function selectIncidentProjection(value: unknown, recipeValue: unknown): Section[] {
  const source = asRecord(value);
  const recipe = asRecord(recipeValue);
  const fallback = asRecord(recipe.fallback);
  const attention = String(fallback.attention ?? "focused");
  const disclosures = Array.isArray(fallback.showDisclosure) ? fallback.showDisclosure.map(String) : ["always", "collapsed"];
  const maxSections = Number(fallback.maxSections ?? 8);
  const candidate = candidatesFrom(source.projectionCandidates).find((entry) => entry.attention === attention) ?? candidatesFrom(source.projectionCandidates)[0];
  return (candidate?.sections ?? []).filter((section) => disclosures.includes(section.disclosure)).slice(0, maxSections);
}

function Content({ section, items }: { section: Section; items: Item[] }) {
  const styles = useStyles();
  const selected = section.contentIds.map((id) => items.find((item) => item.id === id)).filter((item): item is Item => item !== undefined);
  if (section.primitive === "hero-signal") {
    const item = selected[0];
    return item ? <><h3 className={styles.heroTitle}>{item.title}</h3><p className={styles.detail}>{item.detail}</p></> : null;
  }
  if (section.primitive === "metric-strip") {
    return <div className={styles.metrics}>{selected.map((item) => <div className={styles.metric} key={item.id}><strong className={styles.metricValue}>{item.value}</strong><span className={styles.metricLabel}>{item.title}{item.unit ? ` · ${item.unit}` : ""}</span></div>)}</div>;
  }
  if (section.primitive === "timeline") {
    return <ol className={styles.timeline}>{selected.map((item) => <li className={styles.timelineItem} key={item.id}><strong>{item.date}</strong><div><span className={styles.itemTitle}>{item.title}</span><p className={styles.detail}>{item.detail}</p></div></li>)}</ol>;
  }
  if (section.primitive === "narrative") return <>{selected.map((item) => <p className={styles.detail} key={item.id}>{item.detail}</p>)}</>;
  return <ul className={styles.list}>{selected.map((item) => <li className={styles.listItem} key={item.id}><span className={`${styles.badge} ${item.salience === "critical" ? styles.critical : ""}`}>{item.value || item.salience}</span><div><span className={styles.itemTitle}>{item.title}</span><p className={styles.detail}>{item.detail}</p></div></li>)}</ul>;
}

function SectionView({ section, items }: { section: Section; items: Item[] }) {
  const styles = useStyles();
  const className = `${styles.section} ${section.priority === "primary" ? styles.primary : ""}`;
  if (section.disclosure === "collapsed") return <details className={`${className} ${styles.disclosure}`}><summary className={styles.disclosureSummary}>{section.title}</summary><div className={styles.disclosureBody}><Content section={section} items={items} /></div></details>;
  return <section className={className}>{section.primitive === "hero-signal" ? null : <h3 className={styles.sectionTitle}>{section.title}</h3>}<Content section={section} items={items} /></section>;
}

function childrenById(children: React.ReactNode): Map<string, React.ReactElement<ProjectionViewProps>> {
  const result = new Map<string, React.ReactElement<ProjectionViewProps>>();
  for (const child of React.Children.toArray(children)) if (React.isValidElement<ProjectionViewProps>(child)) result.set(child.props.node.id, child);
  return result;
}

export const EditorView: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const [editing, setEditing] = React.useState(false);
  const content = String(node.props.value ?? "");
  const previousContent = React.useRef(content);
  const cells = childrenById(children);
  React.useEffect(() => {
    if (previousContent.current !== content) setEditing(false);
    previousContent.current = content;
  }, [content]);
  return <section className={styles.pane}>
    <header className={styles.paneHeader}><h2 className={styles.paneTitle}>{String(node.props.title ?? "Investigation report")}</h2><div className={styles.paneActions}><div className={styles.sampleSelector}>{cells.get("incident-report-selector")}</div>{editing ? <button className={styles.textButton} type="button" onClick={() => setEditing(false)}>Cancel</button> : <button className={styles.iconButton} type="button" title="Edit report" aria-label="Edit report" onClick={() => setEditing(true)}><EditRegular /></button>}</div></header>
    <div className={`${styles.paneBody} ${styles.editorBody}`}>{editing ? cells.get("incident-report-form") : cells.get("incident-report-markdown")}</div>
  </section>;
};

export const IncidentProjectionsView: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const value = asRecord(node.props.value);
  const hasResult = Object.keys(value).length > 0;
  const stale = analysisIsStale(node.props.content, node.props.analyzedContent);
  const [pending, setPending] = React.useState(false);
  const error = String(node.props.error ?? "");
  const run = async () => {
    setPending(true);
    try { await emit("analyze", {}); } finally { setPending(false); }
  };
  const buttonLabel = pending ? (hasResult ? "Refreshing…" : "Analyzing…") : hasResult ? (stale ? "Refresh analysis" : "Analysis current") : "Analyze report";
  const sections = selectIncidentProjection(value, node.props.projectionRecipe);
  const items = itemsFrom(value.items);
  return <section className={styles.pane}>
    <header className={styles.paneHeader}><div><h2 className={styles.paneTitle}>{String(node.props.title ?? "Agent analysis")}</h2><span className={styles.status}>{hasResult ? (stale ? "Source changed" : "Up to date") : "Not analyzed"}</span></div><button className={styles.analyzeButton} type="button" disabled={pending || (hasResult && !stale)} aria-busy={pending || undefined} onClick={() => void run()}>{pending ? <span className={styles.spinner} aria-hidden="true" /> : null}{buttonLabel}</button></header>
    <div className={styles.paneBody}>{error ? <p className={styles.error}>{error}</p> : null}{hasResult ? <><div className={styles.analysisHeader}><p className={styles.analysisEyebrow}>Incident intelligence</p><h2 className={styles.analysisTitle}>{String(value.headline ?? "Structured assessment")}</h2><p className={styles.analysisSummary}>{String(value.summary ?? "")}</p></div><div className={styles.projectionGrid}>{sections.map((section) => <SectionView section={section} items={items} key={section.id} />)}</div><p className={styles.provenance}>Generated from the report in the left pane. Refresh is enabled whenever that source changes.</p></> : <div className={styles.empty}><div className={styles.emptyInner}><p className={styles.emptyKicker}>Ready</p><h3 className={styles.emptyTitle}>Turn the report into an operational view</h3><p className={styles.emptyText}>Analyze the Markdown to surface the verdict, attack sequence, entities, techniques, and containment priorities.</p></div></div>}</div>
  </section>;
};

const WorkspaceView: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const cells = childrenById(children);
  return <main className={styles.workspace}><header className={styles.header}><div className={styles.brand}><span className={styles.brandMark} /><h1 className={styles.title}>{String(node.props.title ?? "Incident report intelligence")}</h1></div><span className={styles.headerMeta}>Source → Agent projection</span></header><div className={styles.panes}>{cells.get("incident-report")}{cells.get("foundry-access-gate")}</div></main>;
};

export default { workspace: WorkspaceView, editor: EditorView, projections: IncidentProjectionsView };