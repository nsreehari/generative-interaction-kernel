import React from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";

const useStyles = makeStyles({
  workspace: { minHeight: "100%", backgroundColor: "#f7f8fa", color: "#242424" },
  header: { padding: `${tokens.spacingVerticalL} clamp(20px, 4vw, 56px)`, borderBottom: "1px solid #d9dde3", backgroundColor: "#ffffff" },
  headerInner: { width: "min(1440px, 100%)", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "end", gap: tokens.spacingHorizontalXXL, flexWrap: "wrap" },
  eyebrow: { margin: 0, color: "#57606a", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  title: { margin: `${tokens.spacingVerticalXS} 0 0`, fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold, letterSpacing: "0" },
  workflowActions: { display: "flex", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  workflowButton: { minHeight: "36px", padding: `0 ${tokens.spacingHorizontalM}`, border: "1px solid #b7bdc5", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", color: "#242424", fontWeight: tokens.fontWeightSemibold, cursor: "pointer", ":hover": { backgroundColor: "#f3f4f6" }, ":disabled": { color: "#8a8f98", cursor: "wait" } },
  primaryWorkflowButton: { backgroundColor: "#0f6cbd", color: "#ffffff", ":hover": { backgroundColor: "#115ea3" } },
  content: { width: "min(1440px, 100%)", margin: "0 auto", padding: `clamp(20px, 3vw, 40px) clamp(16px, 4vw, 56px)`, display: "grid", gap: tokens.spacingVerticalXXL },
  overview: { display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, .7fr)", gap: tokens.spacingHorizontalXXL, alignItems: "start", "@media (max-width: 900px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  marketGrid: { display: "grid", gridTemplateColumns: "minmax(300px, .7fr) minmax(560px, 1.3fr)", gap: tokens.spacingHorizontalXXL, "@media (max-width: 1120px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  section: { minWidth: 0 },
  sectionHeader: { marginBottom: tokens.spacingVerticalM, display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM },
  sectionHeading: { margin: `0 0 ${tokens.spacingVerticalM}`, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, letterSpacing: "0" },
  sectionHeaderHeading: { margin: 0 },
  tableSurface: {
    minWidth: 0,
    overflow: "hidden",
    padding: tokens.spacingHorizontalL,
    border: "1px solid #d9dde3",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "#ffffff",
    boxShadow: "0 1px 2px rgba(0, 0, 0, .04)",
    "& table": { width: "100%", tableLayout: "fixed" },
    "& th, & td": { minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" },
    "& input": { width: "100%", minWidth: 0 },
    "@media (max-width: 600px)": {
      paddingLeft: tokens.spacingHorizontalS,
      paddingRight: tokens.spacingHorizontalS,
      "& th, & td": { paddingLeft: "4px", paddingRight: "4px", fontSize: tokens.fontSizeBase200 },
    },
  },
  positionsSurface: {
    "@media (max-width: 600px)": {
      "& th:nth-child(2), & td:nth-child(2), & th:nth-child(5), & td:nth-child(5)": { display: "none" },
    },
  },
  summary: { minWidth: 0 },
  advisory: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingHorizontalL, "@media (max-width: 760px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  summaryPanel: { width: "100%", maxWidth: "100%", overflow: "hidden", padding: tokens.spacingHorizontalXL, borderLeft: "4px solid #0f6cbd", backgroundColor: "#ffffff", boxShadow: "0 1px 3px rgba(0, 0, 0, .06)" },
  metrics: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: tokens.spacingVerticalL, margin: 0 },
  metric: { minWidth: 0 },
  metricLabel: { color: "#57606a", fontSize: tokens.fontSizeBase200 },
  metricValue: { margin: `${tokens.spacingVerticalXS} 0 0`, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: "tabular-nums" },
  advisoryPanel: { minWidth: 0, padding: tokens.spacingHorizontalXL, border: "1px solid #d9dde3", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", boxShadow: "0 1px 2px rgba(0, 0, 0, .04)" },
  advisoryWide: { gridColumn: "1 / -1" },
  advisoryEyebrow: { margin: `0 0 ${tokens.spacingVerticalXS}`, color: "#57606a", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  advisoryTitle: { margin: `0 0 ${tokens.spacingVerticalM}`, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  advisorySummary: { margin: `0 0 ${tokens.spacingVerticalL}`, maxWidth: "72ch", lineHeight: tokens.lineHeightBase400 },
  detailColumns: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingHorizontalXL, "@media (max-width: 600px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  detailHeading: { margin: `0 0 ${tokens.spacingVerticalS}`, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  detailList: { margin: 0, paddingLeft: tokens.spacingHorizontalL, display: "grid", gap: tokens.spacingVerticalXS, color: "#42464d" },
  strategyWeights: { display: "grid", gap: tokens.spacingVerticalM, marginTop: tokens.spacingVerticalL },
  weightRow: { display: "grid", gridTemplateColumns: "110px minmax(0, 1fr) 44px", alignItems: "center", gap: tokens.spacingHorizontalM, fontVariantNumeric: "tabular-nums" },
  weightTrack: { height: "8px", overflow: "hidden", backgroundColor: "#e5e8ec" },
  weightFill: { height: "100%", backgroundColor: "#0f6cbd" },
  recommendationPanel: { gridColumn: "1 / -1", padding: tokens.spacingHorizontalXL, borderTop: "3px solid #0f6cbd", backgroundColor: "#ffffff", boxShadow: "0 1px 3px rgba(0, 0, 0, .06)" },
  recommendationChoice: { margin: `0 0 ${tokens.spacingVerticalXS}`, fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightSemibold, textTransform: "capitalize" },
  recommendationReason: { margin: `0 0 ${tokens.spacingVerticalL}`, maxWidth: "72ch", color: "#42464d", lineHeight: tokens.lineHeightBase400 },
});

function valueOf(node: ProjectionViewProps["node"]): unknown {
  return node.props.value;
}

function childrenByNodeId(children: React.ReactNode): Map<string, React.ReactElement<ProjectionViewProps>> {
  const slots = new Map<string, React.ReactElement<ProjectionViewProps>>();
  for (const child of React.Children.toArray(children)) {
    if (React.isValidElement<ProjectionViewProps>(child)) slots.set(child.props.node.id, child);
  }
  return slots;
}

function CellSection({ title, cell, className }: { title: string; cell?: React.ReactElement<ProjectionViewProps>; className?: string }) {
  const styles = useStyles();
  const [refreshing, setRefreshing] = React.useState(false);
  const externalSource = cell?.props.node.props.externalSource as { refreshEvent?: unknown } | undefined;
  const refreshEvent = typeof externalSource?.refreshEvent === "string" ? externalSource.refreshEvent : null;
  const refresh = async () => {
    if (!cell || !refreshEvent) return;
    setRefreshing(true);
    try {
      await cell.props.emit(refreshEvent, {});
    } finally {
      setRefreshing(false);
    }
  };
  return <div className={styles.section}>
    <div className={styles.sectionHeader}>
      <h2 className={`${styles.sectionHeading} ${styles.sectionHeaderHeading}`}>{title}</h2>
      {refreshEvent ? <Button disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Refreshing..." : "Refresh"}</Button> : null}
    </div>
    <div className={className ?? styles.tableSurface}>{cell}</div>
  </div>;
}

const SummaryView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const summary = (valueOf(node) ?? {}) as Record<string, unknown>;
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  return (
    <section className={styles.summaryPanel}>
      <h2 className={styles.sectionHeading}>Portfolio summary</h2>
      <dl className={styles.metrics}>
        {([[
          "Market value", summary.marketValue,
        ], ["Cost basis", summary.costBasis], ["Gain / loss", summary.gainLoss]] as Array<[string, unknown]>).map(([label, value]) => <div className={styles.metric} key={label}>
          <dt className={styles.metricLabel}>{label}</dt><dd className={styles.metricValue}>{currency.format(Number(value ?? 0))}</dd>
        </div>)}
      </dl>
    </section>
  );
};

const NarrativeView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const value = valueOf(node) as Record<string, unknown> | null;
  if (node.id === "portfolio-intelligence") {
    if (value == null) {
      return <article className={`${styles.advisoryPanel} ${styles.advisoryWide}`}>
        <p className={styles.advisoryEyebrow}>Portfolio intelligence</p>
        <h2 className={styles.advisoryTitle}>Ready for analysis</h2>
        <p className={styles.advisorySummary}>Add holdings, then analyze the portfolio for observations and risk signals.</p>
      </article>;
    }
    const observations = Array.isArray(value.observations) ? value.observations.map(String) : [];
    const risks = Array.isArray(value.risks) ? value.risks.map(String) : [];
    return <article className={`${styles.advisoryPanel} ${styles.advisoryWide}`}>
      <p className={styles.advisoryEyebrow}>Portfolio intelligence</p>
      <h2 className={styles.advisoryTitle}>Assessment</h2>
      <p className={styles.advisorySummary}>{String(value.summary ?? "Analysis complete.")}</p>
      <div className={styles.detailColumns}>
        <section><h3 className={styles.detailHeading}>Observations</h3><ul className={styles.detailList}>{observations.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><h3 className={styles.detailHeading}>Risks</h3><ul className={styles.detailList}>{risks.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </div>
    </article>;
  }
  if (value == null) return null;
  const weights = value.targetWeights && typeof value.targetWeights === "object"
    ? Object.entries(value.targetWeights as Record<string, unknown>)
    : [];
  return <article className={styles.advisoryPanel}>
    <p className={styles.advisoryEyebrow}>Rebalance strategy</p>
    <h2 className={styles.advisoryTitle}>{String(value.id ?? node.id).replaceAll("-", " ")}</h2>
    <p className={styles.advisorySummary}>{String(value.rationale ?? "")}</p>
    <div className={styles.strategyWeights}>
      {weights.map(([label, rawValue]) => {
        const percentage = Math.round(Number(rawValue) * 100);
        return <div className={styles.weightRow} key={label}>
          <span>{label}</span>
          <div className={styles.weightTrack}><div className={styles.weightFill} style={{ width: `${percentage}%` }} /></div>
          <strong>{percentage}%</strong>
        </div>;
      })}
    </div>
  </article>;
};

const StrategyComparisonView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const value = valueOf(node) as Record<string, unknown> | null;
  if (value == null) {
    return (
      <section className={styles.recommendationPanel}>
        <p className={styles.advisoryEyebrow}>Strategy comparison</p>
        <h2 className={styles.recommendationChoice}>Awaiting portfolio intelligence</h2>
        <p className={styles.recommendationReason}>Build strategies after analysis to compare conservative and growth alternatives.</p>
      </section>
    );
  }
  return (
    <section className={styles.recommendationPanel}>
      <p className={styles.advisoryEyebrow}>Strategy comparison</p>
      <h2 className={styles.recommendationChoice}>Agent preference: {String(value.selected ?? "Not available")}</h2>
      <p className={styles.recommendationReason}>{String(value.reason ?? "")}</p>
    </section>
  );
};

const WorkspaceView: ProjectionView = ({ node, children, emit }) => {
  const styles = useStyles();
  const [pendingCommand, setPendingCommand] = React.useState<string | null>(null);
  const cells = childrenByNodeId(children);
  const isAdvisorContext = node.props.presentationContext === "portfolio-advisor";
  const runWorkflow = async (command: string) => {
    setPendingCommand(command);
    try {
      await emit(command, {});
    } finally {
      setPendingCommand(null);
    }
  };
  const overview = <section className={styles.overview}>
    <CellSection title="Holdings" cell={cells.get("holdings")} />
    <div className={styles.summary}>{cells.get("summary")}</div>
  </section>;
  const market = <section className={styles.marketGrid}>
    <CellSection title="Market prices" cell={cells.get("market-prices")} />
    <CellSection title="Positions" cell={cells.get("positions")} className={`${styles.tableSurface} ${styles.positionsSurface}`} />
  </section>;
  const advisory = <section className={styles.advisory}>
    {cells.get("portfolio-intelligence")}
    {cells.get("conservative-rebalance")}
    {cells.get("growth-rebalance")}
    {cells.get("strategy-comparison")}
  </section>;
  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div>
          <p className={styles.eyebrow}>{isAdvisorContext ? "Advisor workspace" : "Investment workspace"}</p>
          <h1 className={styles.title}>{String(node.props.title ?? "Portfolio tracker")}</h1>
        </div>
        <div className={styles.workflowActions} aria-label="Portfolio workflows">
          <button className={styles.workflowButton} disabled={pendingCommand !== null} type="button" onClick={() => void runWorkflow("requestIntelligence")}>Analyze portfolio</button>
          <button className={`${styles.workflowButton} ${styles.primaryWorkflowButton}`} disabled={pendingCommand !== null} type="button" onClick={() => void runWorkflow("calculateStrategies")}>Build strategies</button>
        </div>
      </div>
    </header>
    <div className={styles.content}>
      {cells.get("http-proxy-access-gate")}
      {cells.get("foundry-access-gate")}
      {isAdvisorContext
        ? <>{advisory}{overview}{market}</>
        : <>{overview}{market}{advisory}</>}
    </div>
  </main>;
};

export default {
  workspace: WorkspaceView,
  summary: SummaryView,
  narrative: NarrativeView,
  comparison: StrategyComparisonView,
};
