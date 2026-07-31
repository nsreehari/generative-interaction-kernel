import React from "react";
import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tab,
  TabList,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowRightRegular,
  BranchForkRegular,
  ClockRegular,
  EditRegular,
  MapRegular,
  ShieldErrorRegular,
} from "@fluentui/react-icons";
import {
  InfiniteCanvas,
  type InfiniteCanvasNodeDescriptor,
  type InfiniteCanvasPortMap,
} from "@gik/component-infinite-canvas";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";
import { Handle } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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
  report: { minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "72px minmax(0, 1fr)", backgroundColor: "#f8f9f7", "@media (max-width: 680px)": { gridTemplateRows: "132px minmax(0, 1fr)" } },
  reportHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM, padding: `0 ${tokens.spacingHorizontalXL}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, "@media (max-width: 680px)": { alignItems: "stretch", flexDirection: "column", padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, "& > button": { alignSelf: "flex-end" } } },
  reportHeading: { display: "flex", alignItems: "baseline", gap: tokens.spacingHorizontalM },
  reportTitle: { margin: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  status: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  reportBody: { minHeight: 0, overflow: "auto", padding: `${tokens.spacingVerticalXXL} clamp(20px, 4vw, 56px)`, "@media (max-width: 620px)": { padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalM}` } },
  flightTabs: { maxWidth: "100%", alignSelf: "end", overflowX: "auto", "@media (max-width: 680px)": { alignSelf: "stretch" } },
  flight: { minWidth: 0 },
  story: { minWidth: 0, display: "grid", gap: "44px" },
  storyHero: { position: "relative", overflow: "hidden", padding: "clamp(28px, 5vw, 56px)", color: "#fff", backgroundColor: "#17211d", borderBottom: "5px solid #d97706", ":after": { content: "''", position: "absolute", width: "280px", height: "280px", right: "-110px", top: "-150px", border: "1px solid rgba(255,255,255,.18)", borderRadius: "50%" } },
  storyKicker: { margin: 0, color: "#fbbf24", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  storyTitle: { maxWidth: "22ch", margin: `${tokens.spacingVerticalS} 0`, fontSize: "clamp(34px, 5vw, 58px)", lineHeight: 1.02, letterSpacing: "0" },
  storySummary: { maxWidth: "68ch", margin: 0, color: "#e5ebe7", fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase500 },
  storyFacts: { display: "flex", flexWrap: "wrap", gap: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXXL}`, marginTop: tokens.spacingVerticalXXL, paddingTop: tokens.spacingVerticalL, borderTop: "1px solid rgba(255,255,255,.2)" },
  storyFact: { display: "grid", gap: tokens.spacingVerticalXXS, minWidth: "160px" },
  storyFactLabel: { color: "#aebdb5", fontSize: tokens.fontSizeBase200 },
  storyFactValue: { fontWeight: tokens.fontWeightSemibold },
  chapter: { display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: tokens.spacingHorizontalXXL, "@media (max-width: 680px)": { gridTemplateColumns: "minmax(0, 1fr)", gap: tokens.spacingVerticalM } },
  chapterLabel: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, alignSelf: "start", color: "#9f1c15", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  storyTimeline: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: tokens.spacingVerticalXL },
  storyMoment: { position: "relative", paddingLeft: "28px", ":before": { content: "''", position: "absolute", top: "5px", left: 0, width: "10px", height: "10px", backgroundColor: "#b42318" }, ":after": { content: "''", position: "absolute", top: "20px", bottom: "-24px", left: "4px", width: "2px", backgroundColor: tokens.colorNeutralStroke2 } },
  storyTime: { display: "block", marginBottom: tokens.spacingVerticalXXS, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontVariantNumeric: "tabular-nums" },
  storyMomentTitle: { display: "block", fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  storyMomentDetail: { maxWidth: "72ch", margin: `${tokens.spacingVerticalXS} 0 0`, color: tokens.colorNeutralForeground2, lineHeight: tokens.lineHeightBase400 },
  storySignals: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: tokens.spacingHorizontalM },
  storySignal: { padding: tokens.spacingHorizontalL, borderTop: "3px solid #d97706", backgroundColor: tokens.colorNeutralBackground1 },
  canvasShell: { height: "min(720px, calc(100vh - 190px))", minHeight: "520px", overflow: "hidden", border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: "#eef1ed", "@media (max-width: 680px)": { height: "620px", minHeight: "620px" } },
  canvasViewport: { width: "100%", height: "100%" },
  canvasNode: { width: "100%", padding: tokens.spacingHorizontalL, color: tokens.colorNeutralForeground1, backgroundColor: tokens.colorNeutralBackground1, borderTop: "4px solid var(--incident-node-accent, #64748b)", boxShadow: tokens.shadow4 },
  canvasNodeType: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  canvasNodeTitle: { display: "block", marginTop: tokens.spacingVerticalXS, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, overflowWrap: "anywhere" },
  canvasNodeDetail: { margin: `${tokens.spacingVerticalXS} 0 0`, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase300 },
  canvasPort: { width: "10px", height: "10px", border: "2px solid #fff", borderRadius: "50%", backgroundColor: "#b42318", boxShadow: "0 0 0 1px #b42318" },
  canvasLegend: { position: "absolute", zIndex: 4, top: tokens.spacingVerticalM, left: tokens.spacingHorizontalM, display: "flex", gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, backgroundColor: "rgba(255,255,255,.92)", boxShadow: tokens.shadow4, fontSize: tokens.fontSizeBase200 },
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
      <span className={styles.mode}>{node.props.preset === "flights" ? "Flight comparison" : `${String(node.props.preset)} preset`}</span>
    </header>
    <div className={styles.columns}>{cells.get("incident-source")}{cells.get("foundry-access-gate")}</div>
  </main>;
};

const EditorView: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const [editing, setEditing] = React.useState(false);
  const content = String(node.props.value ?? "");
  const previous = React.useRef(content);
  const cells = childrenById(children);
  React.useEffect(() => {
    if (previous.current !== content) setEditing(false);
    previous.current = content;
  }, [content]);
  return <section className={styles.sourcePane}>
    <header className={styles.sourceHeader}>
      <h2 className={styles.sourceTitle}>{String(node.props.title)}</h2>
      <div className={styles.sourceActions}><div className={styles.selector}>{cells.get("incident-source-selector")}</div>{editing
        ? <Button appearance="subtle" onClick={() => setEditing(false)}>Cancel</Button>
        : <Button appearance="subtle" icon={<EditRegular />} aria-label="Edit report" title="Edit report" onClick={() => setEditing(true)} />}</div>
    </header>
    <div className={styles.sourceBody}>{editing ? cells.get("incident-source-form") : cells.get("incident-source-markdown")}</div>
  </section>;
};

const ReportView: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const cells = childrenById(children);
  const model = record(node.props.value);
  const hasModel = Object.keys(model).length > 0;
  const stale = analysisIsStale(node.props.content, node.props.analyzedContent);
  const [pending, setPending] = React.useState(false);
  const [flight, setFlight] = React.useState("story");
  const run = async () => {
    setPending(true);
    try { await emit("analyze", {}); } finally { setPending(false); }
  };
  const label = pending ? (hasModel ? "Refreshing" : "Analyzing") : hasModel ? (stale ? "Refresh analysis" : "Analysis current") : "Analyze report";
  return <section className={styles.report}>
    <header className={styles.reportHeader}>
      <div><div className={styles.reportHeading}><h2 className={styles.reportTitle}>{String(node.props.title)}</h2><span className={styles.status}>{hasModel ? (stale ? "Source changed" : "Same source · two authored views") : "Awaiting analysis"}</span></div>{hasModel ? <TabList className={styles.flightTabs} selectedValue={flight} onTabSelect={(_, data) => setFlight(String(data.value))} size="small"><Tab value="story" icon={<ClockRegular />}>Flight A · Story</Tab><Tab value="canvas" icon={<MapRegular />}>Flight B · Canvas</Tab></TabList> : null}</div>
      <Button appearance="primary" disabled={pending || (hasModel && !stale)} icon={pending ? <Spinner size="tiny" /> : undefined} onClick={() => void run()}>{label}</Button>
    </header>
    <div className={styles.reportBody}>{node.props.error ? <MessageBar intent="error"><MessageBarBody>{String(node.props.error)}</MessageBarBody></MessageBar> : null}{hasModel
      ? <div className={styles.content}>{flight === "canvas" ? cells.get("incident-flight-b") : cells.get("incident-flight-a")}</div>
      : <div className={styles.empty}><div className={styles.emptyInner}><ShieldErrorRegular className={styles.emptyIcon} /><h3 className={styles.emptyTitle}>One source, two flights</h3><p className={styles.emptyText}>Analyze the document once, then compare an authored incident story with an exploratory canvas built from the same source-supported facts.</p></div></div>}</div>
  </section>;
};

const IncidentStoryView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const model = record(node.props.value);
  const identity = record(model.identity);
  const verdict = record(model.verdict);
  const events = records(model.events).sort((left, right) => String(left.time).localeCompare(String(right.time)));
  const alerts = records(model.alerts);
  const techniques = records(model.techniques);
  const actions = records(model.actions);
  const notes = records(model.representationNotes);
  return <article className={`${styles.flight} ${styles.story}`} aria-label="Flight A incident story">
    <header className={styles.storyHero}>
      <p className={styles.storyKicker}>Flight A · Incident story</p>
      <h2 className={styles.storyTitle}>{String(identity.title || "Incident report")}</h2>
      <p className={styles.storySummary}>{String(model.summary)}</p>
      <div className={styles.storyFacts}>
        <div className={styles.storyFact}><span className={styles.storyFactLabel}>Source verdict</span><span className={styles.storyFactValue}>{String(verdict.classification)} · {String(verdict.confidence)} confidence</span></div>
        <div className={styles.storyFact}><span className={styles.storyFactLabel}>Incident window</span><span className={styles.storyFactValue}>{String(identity.startTime)} – {String(identity.endTime)}</span></div>
        <div className={styles.storyFact}><span className={styles.storyFactLabel}>Reported impact</span><span className={styles.storyFactValue}>{String(verdict.impact)}</span></div>
      </div>
    </header>
    <section className={styles.chapter}>
      <div className={styles.chapterLabel}><ClockRegular /> What happened</div>
      <ol className={styles.storyTimeline}>{events.map((event) => <li className={styles.storyMoment} key={String(event.id)}><time className={styles.storyTime}>{String(event.time)}</time><span className={styles.storyMomentTitle}>{String(event.title)}</span><p className={styles.storyMomentDetail}>{String(event.detail)}</p></li>)}</ol>
    </section>
    <section className={styles.chapter}>
      <div className={styles.chapterLabel}><BranchForkRegular /> Signals</div>
      <div className={styles.storySignals}>{alerts.map((alert) => <article className={styles.storySignal} key={String(alert.id)}><Badge appearance="tint" color="danger">{String(alert.verdict)}</Badge><span className={styles.itemTitle}>{String(alert.title)}</span><p className={styles.itemDetail}>{String(alert.summary)}</p></article>)}</div>
    </section>
    <section className={styles.chapter}>
      <div className={styles.chapterLabel}>ATT&amp;CK</div>
      <div className={styles.storySignals}>{techniques.map((technique) => <article className={styles.storySignal} key={String(technique.id)}><span className={styles.techniqueId}>{String(technique.techniqueId)}</span><span className={styles.itemTitle}>{String(technique.technique)}</span><p className={styles.itemDetail}>{String(technique.description)}</p></article>)}</div>
    </section>
    <section className={styles.chapter}>
      <div className={styles.chapterLabel}>Source actions</div>
      <div className={styles.storySignals}>{actions.map((action) => <article className={styles.storySignal} key={String(action.id)}><Badge appearance="outline">{String(action.category)}</Badge><span className={styles.itemTitle}>{String(action.title)}</span><p className={styles.itemDetail}>{String(action.detail)}</p></article>)}</div>
    </section>
    {notes.length ? <section className={styles.chapter}><div className={styles.chapterLabel}>Fidelity notes</div><div className={styles.notes}>{notes.map((note) => <MessageBar className={styles.note} key={String(note.id)} intent="warning"><MessageBarBody className={styles.noteBody}><strong>{String(note.category)}</strong> · {String(note.commentary)}</MessageBarBody></MessageBar>)}</div></section> : null}
  </article>;
};

type CanvasConnection = { sourceId: string; targetId: string; label: string };

const InvestigationCanvasView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const model = record(node.props.value);
  const identity = record(model.identity);
  const phases = records(model.phases);
  const entities = records(model.entities);
  const events = records(model.events);
  const alerts = records(model.alerts);
  const evidence = records(model.evidence);
  const techniques = records(model.techniques);
  const actions = records(model.actions);
  const descriptors: InfiniteCanvasNodeDescriptor[] = [
    ...phases.map((item) => ({ id: String(item.id), kind: "phase", label: String(item.name), detail: String(item.summary), width: 230, accent: "#d97706", column: 0 })),
    ...entities.map((item) => ({ id: String(item.id), kind: String(item.type), label: String(item.label), detail: String(item.description), width: 240, accent: item.status === "compromised" ? "#b42318" : "#2563eb", column: 1 })),
    ...evidence.map((item) => ({ id: String(item.id), kind: "evidence", label: String(item.sourceType), detail: String(item.summary), width: 230, accent: "#64748b", column: 1 })),
    ...events.map((item) => ({ id: String(item.id), kind: "event", label: String(item.title), detail: String(item.detail), width: 260, accent: "#b42318", column: 2 })),
    ...alerts.map((item) => ({ id: String(item.id), kind: "alert", label: String(item.title), detail: String(item.summary), width: 240, accent: "#dc2626", column: 3 })),
    ...techniques.map((item) => ({ id: String(item.id), kind: String(item.techniqueId), label: String(item.technique), detail: String(item.description), width: 230, accent: "#7c3aed", column: 3 })),
    ...actions.map((item) => ({ id: String(item.id), kind: "source action", label: String(item.title), detail: String(item.detail), width: 250, accent: "#15803d", column: 4 })),
  ];
  const connections: CanvasConnection[] = [
    ...records(model.relationships).map((item) => ({ sourceId: String(item.sourceId), targetId: String(item.targetId), label: String(item.label) })),
    ...events.flatMap((event) => [
      ...(Array.isArray(event.entityIds) ? event.entityIds.map((id) => ({ sourceId: String(id), targetId: String(event.id), label: "referenced by event" })) : []),
      ...(Array.isArray(event.evidenceIds) ? event.evidenceIds.map((id) => ({ sourceId: String(id), targetId: String(event.id), label: "supports event" })) : []),
      ...(event.phaseId ? [{ sourceId: String(event.phaseId), targetId: String(event.id), label: "contains event" }] : []),
    ].filter((value): value is CanvasConnection => value !== null)),
    ...alerts.flatMap((alert) => Array.isArray(alert.eventIds) ? alert.eventIds.map((id) => ({ sourceId: String(id), targetId: String(alert.id), label: "raised alert" })) : []),
    ...techniques.flatMap((technique) => technique.phaseId ? [{ sourceId: String(technique.phaseId), targetId: String(technique.id), label: "maps technique" }] : []),
    ...actions.flatMap((action) => Array.isArray(action.entityIds) ? action.entityIds.map((id) => ({ sourceId: String(id), targetId: String(action.id), label: "named in action" })) : []),
  ].filter((connection) => descriptors.some(({ id }) => id === connection.sourceId) && descriptors.some(({ id }) => id === connection.targetId));
  const ports: Record<string, { left: Array<Record<string, unknown>>; right: Array<Record<string, unknown>> }> = Object.fromEntries(descriptors.map(({ id }) => [id, { left: [], right: [] }]));
  connections.forEach((connection, index) => {
    const token = `connection:${index}`;
    ports[connection.sourceId]?.right.push({ id: `${token}:source`, token, label: connection.label });
    ports[connection.targetId]?.left.push({ id: `${token}:target`, token, label: connection.label });
  });
  return <section className={styles.flight} aria-label="Flight B investigation canvas">
    <div className={styles.canvasShell}>
      <InfiniteCanvas
        stateKey={`incident-canvas:${String(identity.incidentId)}`}
        nodes={descriptors}
        nodePorts={ports as InfiniteCanvasPortMap}
        controls
        miniMap
        viewportClassName={styles.canvasViewport}
        getInitialNodePos={(descriptor, context) => {
          const column = Number(descriptor.column ?? 0);
          const row = context.nodes.slice(0, context.index).filter((candidate) => Number(candidate.column ?? 0) === column).length;
          return { x: column * 330, y: row * 190 };
        }}
        renderNode={(descriptor) => <article className={styles.canvasNode} style={{ "--incident-node-accent": String(descriptor.accent) } as React.CSSProperties}><span className={styles.canvasNodeType}>{String(descriptor.kind)}</span><span className={styles.canvasNodeTitle}>{String(descriptor.label)}</span><p className={styles.canvasNodeDetail}>{String(descriptor.detail)}</p></article>}
        renderNodePort={(port, context) => <Handle className={styles.canvasPort} id={String(port.id)} type={context.side === "right" || context.side === "bottom" ? "source" : "target"} position={context.position} />}
        overlay={<div className={styles.canvasLegend}><BranchForkRegular /> Drag to arrange · scroll to pan · controls to zoom</div>}
      />
    </div>
  </section>;
};

const VerdictBriefView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const model = record(node.props.value);
  const verdict = record(model.verdict);
  const identity = record(model.identity);
  if (!Object.keys(verdict).length) return null;
  return <section className={`${styles.leaf} ${styles.verdict}`} aria-labelledby="incident-verdict-title">
    <div><p className={styles.eyebrow}>{String(verdict.classification)} · {String(verdict.confidence)} confidence</p><h2 id="incident-verdict-title" className={styles.verdictTitle}>{String(identity.title || "Confirmed incident")}</h2><p className={styles.summary}>{String(model.summary)}</p></div>
    <div className={styles.verdictFacts}><div><span className={styles.factLabel}>Impact</span><span className={styles.factValue}>{String(verdict.impact)}</span></div><div><span className={styles.factLabel}>Window</span><span className={styles.factValue}>{String(identity.startTime)} – {String(identity.endTime)}</span></div></div>
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

const BlastRadiusView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const entities = records(record(node.props.value).entities);
  const statuses = ["compromised", "affected", "targeted"];
  if (!entities.length) return null;
  return <section className={styles.leaf} aria-labelledby="blast-radius-title"><header className={styles.sectionHead}><h3 id="blast-radius-title" className={styles.sectionTitle}>Blast radius</h3><span className={styles.sectionMeta}>{entities.length} entities</span></header><div className={styles.entityGroups}>{statuses.map((status) => {
    const group = entities.filter((entity) => entity.status === status);
    return group.length ? <section className={styles.entityGroup} key={status}><h4 className={styles.groupTitle}>{status} · {group.length}</h4><ul className={styles.itemList}>{group.map((entity) => <li key={String(entity.id)}><Badge appearance="tint" color={status === "compromised" ? "danger" : status === "affected" ? "warning" : "informative"}>{String(entity.type)}</Badge><span className={styles.itemTitle}>{String(entity.label)}</span><p className={styles.itemDetail}>{String(entity.description)}</p></li>)}</ul></section> : null;
  })}</div></section>;
};

const PhaseTimelineView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const events = records(record(node.props.value).events);
  if (!events.length) return null;
  return <section className={styles.leaf} aria-labelledby="timeline-title"><header className={styles.sectionHead}><h3 id="timeline-title" className={styles.sectionTitle}>Incident timeline</h3><span className={styles.sectionMeta}>{events.length} normalized events</span></header><ol className={styles.timeline}>{events.map((event) => <li className={styles.timelineItem} key={String(event.id)}><time className={styles.time}>{String(event.time)}</time><span className={styles.timelineMarker} /><div><span className={styles.itemTitle}>{String(event.title)}</span><p className={styles.itemDetail}>{String(event.detail)}</p></div></li>)}</ol></section>;
};

const TtpChainView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const techniques = records(record(node.props.value).techniques);
  if (!techniques.length) return null;
  return <section className={styles.leaf} aria-labelledby="ttp-title"><header className={styles.sectionHead}><h3 id="ttp-title" className={styles.sectionTitle}>ATT&amp;CK progression</h3><span className={styles.sectionMeta}>{techniques.length} techniques</span></header><div className={styles.techniqueRail}>{techniques.map((technique) => <article className={styles.technique} key={String(technique.id)}><span className={styles.techniqueId}>{String(technique.techniqueId)}</span><span className={styles.itemTitle}>{String(technique.technique)}</span><p className={styles.itemDetail}>{String(technique.tactic)} · {String(technique.description)}</p></article>)}</div></section>;
};

const ResponsePlanView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const actions = records(record(node.props.value).actions);
  const priorities = ["immediate", "next", "follow-up"];
  if (!actions.length) return null;
  return <section className={styles.leaf} aria-labelledby="response-title"><header className={styles.sectionHead}><h3 id="response-title" className={styles.sectionTitle}>Response plan</h3><span className={styles.sectionMeta}>Ordered by urgency</span></header><div className={styles.actionColumns}>{priorities.map((priority) => <section className={styles.actionGroup} key={priority}><h4 className={styles.actionHeading}>{priority}</h4><ol className={styles.itemList}>{actions.filter((action) => action.priority === priority).map((action) => <li key={String(action.id)}><Badge appearance="filled" color={priority === "immediate" ? "danger" : priority === "next" ? "warning" : "informative"}>{String(action.category)}</Badge><span className={styles.itemTitle}>{String(action.title)}</span><p className={styles.itemDetail}>{String(action.detail)}</p></li>)}</ol></section>)}</div></section>;
};

const RepresentationNotesView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const notes = records(record(node.props.value).representationNotes);
  if (!notes.length) return null;
  return <section className={styles.leaf} aria-labelledby="notes-title"><header className={styles.sectionHead}><h3 id="notes-title" className={styles.sectionTitle}>Modeling notes</h3><span className={styles.sectionMeta}>Content not silently normalized</span></header><div className={styles.notes}>{notes.map((note) => <MessageBar className={styles.note} key={String(note.id)} intent={note.severity === "critical" ? "error" : "warning"}><MessageBarBody className={styles.noteBody}><strong>{String(note.category)}</strong> · {String(note.commentary)}{note.suggestedVocabularyExtension ? ` Suggested extension: ${String(note.suggestedVocabularyExtension)}` : ""}</MessageBarBody></MessageBar>)}</div></section>;
};

export default {
  workspace: WorkspaceView,
  editor: EditorView,
  report: ReportView,
  "incident-story": IncidentStoryView,
  "investigation-canvas": InvestigationCanvasView,
  "verdict-brief": VerdictBriefView,
  "attack-path": AttackPathView,
  "blast-radius": BlastRadiusView,
  "phase-timeline": PhaseTimelineView,
  "ttp-chain": TtpChainView,
  "response-plan": ResponsePlanView,
  "representation-notes": RepresentationNotesView,
};