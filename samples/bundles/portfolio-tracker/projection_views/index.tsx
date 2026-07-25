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
  appliedStatus: { margin: 0, color: "#107c10", fontWeight: tokens.fontWeightSemibold },
});

function valueOf(node: ProjectionViewProps["node"]): unknown {
  return node.props.value;
}

export type StrategyInputSnapshot = {
  positions: unknown;
  summary: unknown;
  investorProfile: unknown;
  intelligenceSource: "portfolio-intelligence" | "portfolio-intelligence-2";
  intelligence: unknown;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function strategyInputSnapshot(props: Record<string, unknown>): StrategyInputSnapshot | null {
  const intelligence2 = objectValue(props.intelligence2);
  const intelligence1 = objectValue(props.intelligence1);
  const intelligence = intelligence2 ?? intelligence1;
  if (!intelligence) return null;
  return {
    positions: props.positions ?? {},
    summary: props.summary ?? {},
    investorProfile: props.investorProfile ?? null,
    intelligenceSource: intelligence2 ? "portfolio-intelligence-2" : "portfolio-intelligence",
    intelligence,
  };
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJson(entry)]));
  }
  return value;
}

export function strategyInputsEqual(current: StrategyInputSnapshot, previous: unknown): boolean {
  return JSON.stringify(canonicalJson(current)) === JSON.stringify(canonicalJson(previous));
}

export function strategyActionDisabled(props: Record<string, unknown>): boolean {
  const current = strategyInputSnapshot(props);
  return current === null || strategyInputsEqual(current, props.strategyInputs);
}

export type ProjectionSection = { id: string; title: string; primitive: string; priority: string; disclosure: string; contentIds: string[] };
export type ProjectionCandidate = { id: string; label: string; attention: string; rationale: string; sections: ProjectionSection[] };
export type ProjectionPolicy = { attention: string; showDisclosure: string[]; maxSections: number };

const EMPTY_POLICY: ProjectionPolicy = { attention: "glanceable", showDisclosure: ["always"], maxSections: 3 };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function projectionCandidates(value: unknown): ProjectionCandidate[] {
  return Array.isArray(value) ? value.map(asRecord).map((candidate) => ({
    id: String(candidate.id ?? ""),
    label: String(candidate.label ?? ""),
    attention: String(candidate.attention ?? ""),
    rationale: String(candidate.rationale ?? ""),
    sections: Array.isArray(candidate.sections) ? candidate.sections.map(asRecord).map((section) => ({
      id: String(section.id ?? ""),
      title: String(section.title ?? ""),
      primitive: String(section.primitive ?? ""),
      priority: String(section.priority ?? "secondary"),
      disclosure: String(section.disclosure ?? "collapsed"),
      contentIds: Array.isArray(section.contentIds) ? section.contentIds.map(String) : [],
    })) : [],
  })).filter((candidate) => candidate.id && candidate.sections.length > 0) : [];
}

export function selectIntelligenceProjection(value: unknown, context: string, recipeValue: unknown): {
  policy: ProjectionPolicy;
  candidate: ProjectionCandidate | undefined;
  sections: ProjectionSection[];
} {
  const valueRecord = asRecord(value);
  const recipe = asRecord(recipeValue);
  const contexts = asRecord(recipe.contexts);
  const configuredPolicy = asRecord(contexts[context] ?? recipe.fallback);
  const policy: ProjectionPolicy = {
    attention: String(configuredPolicy.attention ?? EMPTY_POLICY.attention),
    showDisclosure: Array.isArray(configuredPolicy.showDisclosure) ? configuredPolicy.showDisclosure.map(String) : EMPTY_POLICY.showDisclosure,
    maxSections: Number(configuredPolicy.maxSections ?? EMPTY_POLICY.maxSections),
  };
  const candidates = projectionCandidates(valueRecord.projectionCandidates);
  const candidate = candidates.find((entry) => entry.attention === policy.attention) ?? candidates[0];
  const sections = (candidate?.sections ?? [])
    .filter((section) => policy.showDisclosure.includes(section.disclosure))
    .slice(0, policy.maxSections);
  return { policy, candidate, sections };
}

export function safeEvidenceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function formatIntelligenceMetric(value: string, unit: string): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return [value, unit].filter(Boolean).join(" ");
  const normalizedUnit = unit.trim().toLowerCase();
  if (["usd", "currency", "dollar", "dollars"].includes(normalizedUnit)) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(numericValue);
  }
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numericValue);
  if (normalizedUnit === "%" || normalizedUnit.includes("percent")) return `${formatted}%`;
  if (normalizedUnit === "share" || normalizedUnit === "shares") return `${formatted} shares`;
  return unit ? `${formatted} ${unit}` : formatted;
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
  if (value == null) return null;
  if (node.id === "portfolio-intelligence") {
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

const RecommendationView: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const value = valueOf(node) as Record<string, unknown> | null;
  if (value == null) return null;
  return (
    <section className={styles.recommendationPanel}>
      <p className={styles.advisoryEyebrow}>Recommended allocation</p>
      <h2 className={styles.recommendationChoice}>{String(value.selected ?? "Recommendation")}</h2>
      <p className={styles.recommendationReason}>{String(value.reason ?? "")}</p>
      {value.status === "proposed"
        ? <Button appearance="primary" onClick={() => emit("apply", {}, "human-investor")}>Apply recommendation</Button>
        : <p className={styles.appliedStatus}>Applied by {String(value.actorId ?? "investor")}</p>}
    </section>
  );
};

const IntelligenceProjectionsView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const value = asRecord(valueOf(node));
  if (Object.keys(value).length === 0) return null;
  const context = String(node.props.presentationContext ?? "portfolio-overview");
  const { candidate, sections } = selectIntelligenceProjection(value, context, node.props.projectionRecipe);
  return <article className={`${styles.advisoryPanel} ${styles.advisoryWide}`}>
    <p className={styles.advisoryEyebrow}>Portfolio intelligence</p>
    <h2 className={styles.advisoryTitle}>{String(value.headline ?? candidate?.label ?? "Assessment")}</h2>
    <p className={styles.advisorySummary}>{String(value.summary ?? "")}</p>
    <ul className={styles.detailList}>{sections.map((section) => <li key={section.id}>{section.title}</li>)}</ul>
  </article>;
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
    {cells.get("portfolio-intelligence-2")}
    {cells.get("conservative-rebalance")}
    {cells.get("growth-rebalance")}
    {cells.get("rebalance-comparison")}
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
  "intelligence-projections": IntelligenceProjectionsView,
  comparison: RecommendationView,
  recommendation: RecommendationView,
};
