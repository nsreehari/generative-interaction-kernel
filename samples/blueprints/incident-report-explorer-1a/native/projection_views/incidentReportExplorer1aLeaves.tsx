import React from "react";
import { EditRegular } from "@fluentui/react-icons";
import { makeStyles, tokens } from "@fluentui/react-components";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";

const useStyles = makeStyles({
  workspace: { width: "100%", height: "100vh", minWidth: 0, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "44px minmax(0, 1fr)", backgroundColor: "#ecefed", color: "#1d2522", fontFamily: "Aptos, 'Segoe UI Variable', sans-serif" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalL, padding: `0 ${tokens.spacingHorizontalXL}`, borderBottom: "1px solid #cbd1cd", backgroundColor: "#ffffff" },
  brand: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, minWidth: 0 },
  brandMark: { width: "4px", height: "20px", backgroundColor: "#0b6a6c" },
  title: { margin: 0, overflow: "hidden", fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, textOverflow: "ellipsis", whiteSpace: "nowrap" },
  headerMeta: { color: "#68716c", fontSize: tokens.fontSizeBase200, whiteSpace: "nowrap", "@media (max-width: 520px)": { display: "none" } },
  panes: { width: "100%", minWidth: 0, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "1px", backgroundColor: "#cbd1cd", "@media (max-width: 820px)": { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "minmax(520px, 1fr) minmax(520px, 1fr)", overflow: "auto" } },
  pane: { minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "52px minmax(0, 1fr)", backgroundColor: "#ffffff" },
  paneHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM, padding: `0 ${tokens.spacingHorizontalL}`, borderBottom: "1px solid #e1e5e2", backgroundColor: "#fafbfa" },
  paneTitle: { margin: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  paneActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: tokens.spacingHorizontalS },
  paneBody: { minHeight: 0, overflow: "auto", padding: tokens.spacingHorizontalXL },
  editorBody: { "& .gx-markdown": { maxWidth: "78ch", margin: "0 auto" }, "& .gx-form-grid": { display: "block" }, "& textarea": { minHeight: "calc(100vh - 190px)", resize: "vertical", fontFamily: "Cascadia Code, Consolas, monospace", fontSize: tokens.fontSizeBase200, lineHeight: 1.55 } },
  resultBody: { backgroundColor: "#f8f9f7" },
  semanticContent: { width: "100%", maxWidth: "980px", margin: "0 auto", display: "grid", gap: "32px" },
  sampleSelector: { width: "min(280px, 38vw)", minWidth: "150px", "& .gx-fluent-dropdown": { width: "100%", maxWidth: "280px" }, "@media (max-width: 520px)": { width: "150px", minWidth: 0 } },
  iconButton: { width: "34px", height: "34px", display: "inline-grid", placeItems: "center", border: "1px solid #c6ccc8", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", color: "#27312c", cursor: "pointer", ":hover": { backgroundColor: "#f0f3f1" } },
  textButton: { minHeight: "34px", padding: `0 ${tokens.spacingHorizontalM}`, border: "1px solid #c6ccc8", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", color: "#27312c", font: "inherit", fontWeight: tokens.fontWeightSemibold, cursor: "pointer" },
  status: { color: "#68716c", fontSize: tokens.fontSizeBase200 },
  empty: { height: "100%", minHeight: "280px", display: "grid", placeItems: "center", textAlign: "center" },
  emptyInner: { maxWidth: "430px" },
  emptyKicker: { margin: `0 0 ${tokens.spacingVerticalS}`, color: "#0b6a6c", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  emptyTitle: { margin: `0 0 ${tokens.spacingVerticalS}`, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  emptyText: { margin: 0, color: "#68716c", lineHeight: tokens.lineHeightBase400 },
  error: { margin: `0 0 ${tokens.spacingVerticalL}`, padding: tokens.spacingHorizontalM, borderLeft: "4px solid #d13438", backgroundColor: "#fdf3f4", color: "#8f1d22" },
  audit: { maxWidth: "78ch", margin: `0 auto ${tokens.spacingVerticalXL}`, padding: tokens.spacingHorizontalM, border: "1px solid #b9d8d4", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#f2faf8" },
  auditTitle: { margin: `0 0 ${tokens.spacingVerticalXS}`, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  auditText: { margin: 0, color: "#44524c", lineHeight: tokens.lineHeightBase300 },
  sectionList: { margin: `${tokens.spacingVerticalM} 0 0`, padding: 0, display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS, listStyle: "none" },
  sectionTag: { padding: `2px ${tokens.spacingHorizontalS}`, border: "1px solid #c9d6d2", borderRadius: tokens.borderRadiusSmall, backgroundColor: "#ffffff", color: "#44524c", fontSize: tokens.fontSizeBase100 },
});

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function refinementIsStale(content: unknown, refinedContent: unknown): boolean {
  return typeof content === "string" && content.length > 0 && content !== refinedContent;
}

function childrenById(children: React.ReactNode): Map<string, React.ReactElement<ProjectionViewProps>> {
  const result = new Map<string, React.ReactElement<ProjectionViewProps>>();
  for (const child of React.Children.toArray(children)) {
    if (React.isValidElement<ProjectionViewProps>(child)) result.set(child.props.node.id, child);
  }
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
    <header className={styles.paneHeader}><h2 className={styles.paneTitle}>{String(node.props.title ?? "Source report")}</h2><div className={styles.paneActions}><div className={styles.sampleSelector}>{cells.get("incident-report-selector")}</div>{editing ? <button className={styles.textButton} type="button" onClick={() => setEditing(false)}>Cancel</button> : <button className={styles.iconButton} type="button" title="Edit report" aria-label="Edit report" onClick={() => setEditing(true)}><EditRegular /></button>}</div></header>
    <div className={`${styles.paneBody} ${styles.editorBody}`}>{editing ? cells.get("incident-report-form") : cells.get("incident-report-markdown")}</div>
  </section>;
};

export const RefinementView: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const value = asRecord(node.props.value);
  const hasResult = Object.keys(value).length > 0;
  const stale = refinementIsStale(node.props.content, node.props.refinedContent);
  const pending = node.props.pending === true;
  const cells = childrenById(children);
  const coveredSections = records(value.sectionCoverage);
  const error = String(node.props.error ?? "");
  return <section className={styles.pane}>
    <header className={styles.paneHeader}><div><h2 className={styles.paneTitle}>{String(node.props.title ?? "Improved semantic report")}</h2><span className={styles.status}>{pending ? (hasResult ? "Refreshing report..." : "Improving report...") : hasResult ? (stale ? "Source changed" : `${coveredSections.length} sections preserved`) : "Not refined"}</span></div><div className={styles.paneActions}>{cells.get("incident-improve-report")}</div></header>
    <div className={`${styles.paneBody} ${styles.resultBody}`}>{pending ? <span role="status">{hasResult ? "Refreshing incident report..." : "Improving incident report..."}</span> : null}{error ? <p className={styles.error}>{error}</p> : null}{hasResult ? <div className={styles.semanticContent}>{cells.get("incident-sections")}</div> : <div className={styles.empty}><div className={styles.emptyInner}><p className={styles.emptyKicker}>Ready</p><h3 className={styles.emptyTitle}>Improve the report without changing what it says</h3><p className={styles.emptyText}>The agent selects semantic contracts and returns their data; the authored runtime owns components and presentation.</p></div></div>}</div>
  </section>;
};

const WorkspaceView: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const cells = childrenById(children);
  return <main className={styles.workspace}><header className={styles.header}><div className={styles.brand}><span className={styles.brandMark} /><h1 className={styles.title}>{String(node.props.title ?? "Incident report refinement")}</h1></div><span className={styles.headerMeta}>Semantic tier to runtime recipe</span></header><div className={styles.panes}>{cells.get("incident-report")}{cells.get("foundry-access-gate") ?? cells.get("incident-refinement")}</div></main>;
};

export default { workspace: WorkspaceView, editor: EditorView, refinement: RefinementView };
