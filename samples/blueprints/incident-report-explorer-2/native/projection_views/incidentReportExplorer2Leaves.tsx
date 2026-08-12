import React from "react";
import {
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowRightRegular,
  ShieldErrorRegular,
} from "@fluentui/react-icons";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";

type RecordValue = Record<string, unknown>;

const useStyles = makeStyles({
  workspace: { width: "100%", height: "100vh", minWidth: 0, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "48px minmax(0, 1fr)", backgroundColor: "#f4f5f3", color: "#202321" },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalL, padding: `0 ${tokens.spacingHorizontalXL}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  brand: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, minWidth: 0 },
  brandIcon: { color: "#b42318", fontSize: "20px" },
  title: { margin: 0, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  mode: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, textTransform: "capitalize" },
  columns: { minWidth: 0, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(360px, 34%) minmax(0, 1fr)", borderTop: "3px solid #b42318", "@media (max-width: 960px)": { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "minmax(420px, 52vh) minmax(620px, auto)", overflow: "auto" } },
  sourcePane: { minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "56px minmax(0, 1fr)", borderRight: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  sourceHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM, padding: `0 ${tokens.spacingHorizontalL}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, "@media (max-width: 520px)": { alignItems: "stretch", flexDirection: "column", justifyContent: "center", padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}` } },
  sourceActions: { minWidth: 0, display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  sourceTitle: { margin: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  selector: { width: "min(270px, 28vw)", "@media (max-width: 520px)": { width: "100%" } },
  sourceBody: { minHeight: 0, overflow: "auto", padding: tokens.spacingHorizontalXL, "& .gx-markdown": { maxWidth: "74ch", margin: "0 auto" }, "& .gx-form-grid": { display: "block" }, "& textarea": { minHeight: "calc(100vh - 210px)", fontFamily: "Cascadia Code, Consolas, monospace", lineHeight: 1.55 } },
  report: { minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "56px minmax(0, 1fr)", backgroundColor: "#f8f9f7" },
  reportHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM, padding: `0 ${tokens.spacingHorizontalXL}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  reportHeading: { display: "flex", alignItems: "baseline", gap: tokens.spacingHorizontalM },
  reportTitle: { margin: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  status: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  reportBody: { minHeight: 0, overflow: "auto", padding: `${tokens.spacingVerticalXXL} clamp(20px, 4vw, 56px)`, "@media (max-width: 620px)": { padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalM}` } },
  empty: { minHeight: "420px", display: "grid", placeItems: "center", textAlign: "center" },
  emptyInner: { maxWidth: "440px" },
  emptyIcon: { color: "#b42318", fontSize: "36px" },
  emptyTitle: { margin: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalS}`, fontSize: tokens.fontSizeBase500 },
  emptyText: { margin: 0, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase400 },
  content: { width: "100%", minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "36px", maxWidth: "980px", margin: "0 auto" },
  leaf: { minWidth: 0 },
  sectionHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: tokens.spacingHorizontalM, marginBottom: tokens.spacingVerticalM, paddingBottom: tokens.spacingVerticalS, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  sectionTitle: { margin: 0, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  sectionMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  verdict: { display: "grid", gap: tokens.spacingVerticalXL, padding: "clamp(24px, 4vw, 44px)", borderLeft: "5px solid #b42318", backgroundColor: "#fff", boxShadow: tokens.shadow2 },
  eyebrow: { margin: `0 0 ${tokens.spacingVerticalXS}`, color: "#9f1c15", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  verdictTitle: { maxWidth: "26ch", margin: 0, fontSize: "clamp(28px, 3vw, 40px)", lineHeight: 1.08, letterSpacing: "0" },
  summary: { maxWidth: "72ch", margin: `${tokens.spacingVerticalM} 0 0`, color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase500 },
  verdictFacts: { display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(240px, 1fr)", gap: tokens.spacingHorizontalXXL, paddingTop: tokens.spacingVerticalL, borderTop: `1px solid ${tokens.colorNeutralStroke2}`, "@media (max-width: 620px)": { gridTemplateColumns: "minmax(0, 1fr)", gap: tokens.spacingVerticalM } },
  factLabel: { display: "block", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  factValue: { display: "block", marginTop: tokens.spacingVerticalXXS, fontWeight: tokens.fontWeightSemibold, overflowWrap: "anywhere" },
  phaseRail: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: tokens.spacingHorizontalS },
  phase: { minWidth: 0, padding: tokens.spacingHorizontalL, borderTop: "3px solid #d97706", backgroundColor: tokens.colorNeutralBackground1 },
  phaseOrder: { color: "#9a5b08", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  phaseName: { display: "block", marginTop: tokens.spacingVerticalXS, fontWeight: tokens.fontWeightSemibold },
  phaseSummary: { margin: `${tokens.spacingVerticalXS} 0 0`, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase300 },
  pathList: { margin: tokens.spacingVerticalL + " 0 0", padding: 0, listStyle: "none", display: "grid", gap: tokens.spacingVerticalS },
  pathItem: { display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 22px minmax(120px, 1fr)", alignItems: "center", gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, "@media (max-width: 600px)": { gridTemplateColumns: "minmax(0, 1fr) 18px minmax(0, 1fr)" } },
  entityName: { overflowWrap: "anywhere", fontWeight: tokens.fontWeightSemibold },
  arrow: { color: "#b42318" },
  edgeLabel: { gridColumn: "1 / -1", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  entityGroups: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: tokens.spacingHorizontalL, "@media (max-width: 720px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  entityGroup: { minWidth: 0, padding: tokens.spacingHorizontalL, backgroundColor: tokens.colorNeutralBackground1, borderTop: `3px solid ${tokens.colorNeutralStroke1}` },
  groupTitle: { margin: `0 0 ${tokens.spacingVerticalM}`, fontSize: tokens.fontSizeBase300, textTransform: "capitalize" },
  itemList: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: tokens.spacingVerticalM },
  itemTitle: { display: "block", fontWeight: tokens.fontWeightSemibold, overflowWrap: "anywhere" },
  itemDetail: { margin: `${tokens.spacingVerticalXXS} 0 0`, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase300 },
  timeline: { margin: 0, padding: 0, listStyle: "none", display: "grid" },
  timelineItem: { display: "grid", gridTemplateColumns: "110px 18px minmax(0, 1fr)", gap: tokens.spacingHorizontalM, minHeight: "76px", "@media (max-width: 520px)": { gridTemplateColumns: "82px 14px minmax(0, 1fr)" } },
  time: { fontVariantNumeric: "tabular-nums", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  timelineMarker: { position: "relative", ":before": { content: "''", position: "absolute", top: "4px", left: "4px", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#b42318" }, ":after": { content: "''", position: "absolute", top: "16px", bottom: 0, left: "7px", width: "2px", backgroundColor: tokens.colorNeutralStroke2 } },
  techniqueRail: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: tokens.spacingHorizontalM },
  technique: { minWidth: 0, padding: tokens.spacingHorizontalL, backgroundColor: "#fff", borderBottom: "3px solid #d97706" },
  techniqueId: { color: "#9a5b08", fontWeight: tokens.fontWeightBold },
  actionColumns: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: tokens.spacingHorizontalL, "@media (max-width: 760px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  actionGroup: { padding: tokens.spacingHorizontalL, backgroundColor: tokens.colorNeutralBackground1 },
  actionHeading: { margin: `0 0 ${tokens.spacingVerticalM}`, fontSize: tokens.fontSizeBase300, textTransform: "capitalize" },
  notes: { minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: tokens.spacingVerticalS },
  note: { minWidth: 0, maxWidth: "100%", overflow: "hidden" },
  noteBody: { minWidth: 0, overflowWrap: "anywhere" },
});

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function records(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function childrenById(children: React.ReactNode): Map<string, React.ReactElement<ProjectionViewProps>> {
  const result = new Map<string, React.ReactElement<ProjectionViewProps>>();
  for (const child of React.Children.toArray(children)) {
    if (React.isValidElement<ProjectionViewProps>(child)) result.set(child.props.node.id, child);
  }
  return result;
}

export function analysisIsStale(content: unknown, analyzedContent: unknown): boolean {
  return typeof content === "string" && content.length > 0 && content !== analyzedContent;
}

const WorkspaceView: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const cells = childrenById(children);
  return <main className={styles.workspace}>
    <header className={styles.topbar}>
      <div className={styles.brand}><ShieldErrorRegular className={styles.brandIcon} /><h1 className={styles.title}>{String(node.props.title)}</h1></div>
      <span className={styles.mode}>{String(node.props.preset)} preset</span>
    </header>
    <div className={styles.columns}>{cells.get("foundry-access-gate") ?? cells.get("incident-semantic-analyzer")}</div>
  </main>;
};

const ReportView: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const readonly = node.props.readonly === true;
  const model = record(node.props.value);
  const hasModel = Object.keys(model).length > 0;
  const stale = analysisIsStale(node.props.content, node.props.analyzedContent);
  const pending = node.props.pending === true;
  const label = pending ? (hasModel ? "Refreshing" : "Analyzing") : hasModel ? (stale ? "Refresh analysis" : "Analysis current") : "Analyze report";
  return <section className={styles.report}>
    <header className={styles.reportHeader}>
      <div className={styles.reportHeading}><h2 className={styles.reportTitle}>{String(node.props.title)}</h2><span className={styles.status}>{hasModel ? (stale ? "Source changed" : "Up to date") : "Awaiting analysis"}</span></div>
      {readonly ? null : <Button appearance="primary" disabled={pending || (hasModel && !stale)} icon={pending ? <Spinner size="tiny" /> : undefined} onClick={() => void emit("analyze", {})}>{label}</Button>}
    </header>
    <div className={styles.reportBody}>{node.props.error ? <MessageBar intent="error"><MessageBarBody>{String(node.props.error)}</MessageBarBody></MessageBar> : null}{hasModel
      ? <div className={styles.content}>{children}</div>
      : <div className={styles.empty}><div className={styles.emptyInner}><ShieldErrorRegular className={styles.emptyIcon} /><h3 className={styles.emptyTitle}>Build the incident picture</h3><p className={styles.emptyText}>Analyze the source to connect attack phases, affected assets, ATT&amp;CK techniques, evidence, and response priorities.</p></div></div>}</div>
  </section>;
};

const AttackPathView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const model = record(node.props.value);
  const phases = records(model.phases).sort((left, right) => Number(left.order) - Number(right.order));
  const entities = new Map(records(model.entities).map((entity) => [String(entity.id), entity]));
  const relationships = records(model.relationships);
  if (!phases.length && !relationships.length) return null;
  return <section className={styles.leaf} aria-labelledby="attack-path-title"><header className={styles.sectionHead}><h3 id="attack-path-title" className={styles.sectionTitle}>Attack path</h3><span className={styles.sectionMeta}>{relationships.length} causal links</span></header>
    <div className={styles.phaseRail}>{phases.map((phase) => <div className={styles.phase} key={String(phase.id)}><span className={styles.phaseOrder}>Phase {Number(phase.order) + 1}</span><span className={styles.phaseName}>{String(phase.name)}</span><p className={styles.phaseSummary}>{String(phase.summary)}</p></div>)}</div>
    <ol className={styles.pathList}>{relationships.map((edge) => <li className={styles.pathItem} key={String(edge.id)}><span className={styles.entityName}>{String(entities.get(String(edge.sourceId))?.label ?? edge.sourceId)}</span><ArrowRightRegular className={styles.arrow} /><span className={styles.entityName}>{String(entities.get(String(edge.targetId))?.label ?? edge.targetId)}</span><span className={styles.edgeLabel}>{String(edge.label)}</span></li>)}</ol>
  </section>;
};

const RepresentationNotesView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const notes = records(record(node.props.value).representationNotes);
  if (!notes.length) return null;
  return <section className={styles.leaf} aria-labelledby="notes-title"><header className={styles.sectionHead}><h3 id="notes-title" className={styles.sectionTitle}>Modeling notes</h3><span className={styles.sectionMeta}>Content not silently normalized</span></header><div className={styles.notes}>{notes.map((note) => <MessageBar className={styles.note} key={String(note.id)} intent={note.severity === "critical" ? "error" : "warning"}><MessageBarBody className={styles.noteBody}><strong>{String(note.category)}</strong> · {String(note.commentary)}{note.suggestedVocabularyExtension ? ` Suggested extension: ${String(note.suggestedVocabularyExtension)}` : ""}</MessageBarBody></MessageBar>)}</div></section>;
};

export default {
  workspace: WorkspaceView,
  report: ReportView,
  "attack-path": AttackPathView,
  "representation-notes": RepresentationNotesView,
};