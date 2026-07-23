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
  intelligence2: { gridColumn: "1 / -1", border: "1px solid #c7ccd1", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", overflow: "hidden", boxShadow: "0 2px 8px rgba(0, 0, 0, .06)" },
  intelligence2Header: { padding: tokens.spacingHorizontalXL, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: tokens.spacingHorizontalXL, alignItems: "start", borderBottom: "1px solid #e2e5e9", backgroundColor: "#fbfcfd", "@media (max-width: 720px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  intelligence2Title: { margin: `0 0 ${tokens.spacingVerticalXS}`, fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightSemibold },
  intelligence2Summary: { margin: 0, maxWidth: "76ch", color: "#42464d", lineHeight: tokens.lineHeightBase400 },
  recipeMeta: { display: "flex", gap: tokens.spacingHorizontalXS, flexWrap: "wrap", justifyContent: "end", "@media (max-width: 720px)": { justifyContent: "start" } },
  recipeToken: { padding: `3px ${tokens.spacingHorizontalS}`, border: "1px solid #b7bdc5", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", color: "#42464d", fontSize: tokens.fontSizeBase200, whiteSpace: "nowrap" },
  projectionBody: { padding: tokens.spacingHorizontalXL, display: "grid", gap: tokens.spacingVerticalXL },
  projectionRationale: { margin: 0, color: "#57606a", fontSize: tokens.fontSizeBase200 },
  projectionGrid: { display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: tokens.spacingHorizontalL },
  projectionSection: { gridColumn: "span 6", minWidth: 0, padding: tokens.spacingHorizontalL, borderTop: "2px solid #b7bdc5", backgroundColor: "#f8f9fa", "@media (max-width: 760px)": { gridColumn: "1 / -1" } },
  projectionPrimary: { gridColumn: "1 / -1", borderTopColor: "#0f6cbd", backgroundColor: "#f3f8fc" },
  projectionTertiary: { gridColumn: "span 4", "@media (max-width: 980px)": { gridColumn: "span 6" }, "@media (max-width: 760px)": { gridColumn: "1 / -1" } },
  disclosureSummary: { cursor: "pointer", "&::marker": { color: "#0f6cbd" } },
  disclosureTitle: { display: "block", marginTop: tokens.spacingVerticalXS, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  disclosureContent: { marginTop: tokens.spacingVerticalM },
  primitiveLabel: { margin: `0 0 ${tokens.spacingVerticalXS}`, color: "#57606a", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  primitiveTitle: { margin: `0 0 ${tokens.spacingVerticalM}`, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  heroSignal: { margin: `0 0 ${tokens.spacingVerticalS}`, maxWidth: "30ch", fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightSemibold, lineHeight: tokens.lineHeightBase500 },
  signalList: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: tokens.spacingVerticalM },
  signalItem: { display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: tokens.spacingHorizontalM, alignItems: "start" },
  salience: { minWidth: "58px", padding: `2px ${tokens.spacingHorizontalXS}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "#e5e8ec", color: "#242424", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, textAlign: "center", textTransform: "uppercase" },
  salienceCritical: { backgroundColor: "#fde7e9", color: "#b10e1c" },
  salienceHigh: { backgroundColor: "#fff4ce", color: "#6d5700" },
  signalTitle: { display: "block", marginBottom: "2px", fontWeight: tokens.fontWeightSemibold },
  signalDetail: { margin: 0, color: "#42464d", lineHeight: tokens.lineHeightBase300 },
  metricStrip: { display: "flex", gap: tokens.spacingHorizontalXL, flexWrap: "wrap" },
  metricBlock: { minWidth: "120px" },
  metricNumber: { display: "block", fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: "tabular-nums" },
  metricCaption: { color: "#57606a", fontSize: tokens.fontSizeBase200 },
  timeline: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: tokens.spacingVerticalM },
  timelineItem: { display: "grid", gridTemplateColumns: "100px minmax(0, 1fr)", gap: tokens.spacingHorizontalM, borderLeft: "2px solid #0f6cbd", paddingLeft: tokens.spacingHorizontalM },
  evidenceList: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: tokens.spacingVerticalS },
  evidenceLink: { color: "#0f6cbd", textDecoration: "none", ":hover": { textDecoration: "underline" } },
  alternatives: { padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`, display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexWrap: "wrap", borderTop: "1px solid #e2e5e9", color: "#57606a", fontSize: tokens.fontSizeBase200 },
  alternative: { padding: `2px ${tokens.spacingHorizontalS}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "#eef0f2" },
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

type IntelligenceItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  salience: string;
  confidence: string;
  entities: string[];
  value: string;
  unit: string;
  date: string;
  evidenceIds: string[];
};

type EvidenceItem = { id: string; title: string; publisher: string; url: string; publishedAt: string };
export type ProjectionSection = { id: string; title: string; primitive: string; priority: string; disclosure: string; contentIds: string[] };
export type ProjectionCandidate = { id: string; label: string; attention: string; rationale: string; sections: ProjectionSection[] };
export type ProjectionPolicy = { attention: string; showDisclosure: string[]; maxSections: number };

const EMPTY_POLICY: ProjectionPolicy = { attention: "glanceable", showDisclosure: ["always"], maxSections: 3 };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function intelligenceItems(value: unknown): IntelligenceItem[] {
  return Array.isArray(value) ? value.map(asRecord).map((item) => ({
    id: String(item.id ?? ""), kind: String(item.kind ?? "judgment"), title: String(item.title ?? ""), detail: String(item.detail ?? ""),
    salience: String(item.salience ?? "medium"), confidence: String(item.confidence ?? "medium"),
    entities: Array.isArray(item.entities) ? item.entities.map(String) : [], value: String(item.value ?? ""), unit: String(item.unit ?? ""),
    date: String(item.date ?? ""), evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds.map(String) : [],
  })).filter((item) => item.id && item.title) : [];
}

function evidenceItems(value: unknown): EvidenceItem[] {
  return Array.isArray(value) ? value.map(asRecord).map((item) => ({
    id: String(item.id ?? ""), title: String(item.title ?? ""), publisher: String(item.publisher ?? ""),
    url: String(item.url ?? ""), publishedAt: String(item.publishedAt ?? ""),
  })).filter((item) => item.id && item.title && item.url) : [];
}

function projectionCandidates(value: unknown): ProjectionCandidate[] {
  return Array.isArray(value) ? value.map(asRecord).map((candidate) => ({
    id: String(candidate.id ?? ""), label: String(candidate.label ?? ""), attention: String(candidate.attention ?? ""),
    rationale: String(candidate.rationale ?? ""), sections: Array.isArray(candidate.sections)
      ? candidate.sections.map(asRecord).map((section) => ({
        id: String(section.id ?? ""), title: String(section.title ?? ""), primitive: String(section.primitive ?? ""),
        priority: String(section.priority ?? "secondary"), disclosure: String(section.disclosure ?? "collapsed"),
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

function salienceClass(styles: ReturnType<typeof useStyles>, salience: string): string {
  if (salience === "critical") return `${styles.salience} ${styles.salienceCritical}`;
  if (salience === "high") return `${styles.salience} ${styles.salienceHigh}`;
  return styles.salience;
}

export function safeEvidenceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function ProjectionPrimitive({ section, items, evidence }: { section: ProjectionSection; items: IntelligenceItem[]; evidence: EvidenceItem[] }) {
  const styles = useStyles();
  const selectedItems = section.contentIds.map((id) => items.find((item) => item.id === id)).filter((item): item is IntelligenceItem => item !== undefined);
  const selectedEvidence = section.contentIds.map((id) => evidence.find((item) => item.id === id)).filter((item): item is EvidenceItem => item !== undefined);
  if (section.primitive === "hero-signal") {
    const item = selectedItems[0];
    return item ? <><p className={styles.heroSignal}>{item.title}</p><p className={styles.signalDetail}>{item.detail}</p></> : null;
  }
  if (section.primitive === "metric-strip") {
    return <div className={styles.metricStrip}>{selectedItems.map((item) => <div className={styles.metricBlock} key={item.id}><strong className={styles.metricNumber}>{item.value || item.title}</strong><span className={styles.metricCaption}>{item.unit || item.detail}</span></div>)}</div>;
  }
  if (section.primitive === "timeline") {
    return <ol className={styles.timeline}>{selectedItems.map((item) => <li className={styles.timelineItem} key={item.id}><strong>{item.date || "Upcoming"}</strong><div><span className={styles.signalTitle}>{item.title}</span><p className={styles.signalDetail}>{item.detail}</p></div></li>)}</ol>;
  }
  if (section.primitive === "evidence-list") {
    const linkedEvidence = selectedEvidence.length > 0 ? selectedEvidence : evidence.filter((entry) => selectedItems.some((item) => item.evidenceIds.includes(entry.id)));
    return <ul className={styles.evidenceList}>{linkedEvidence.map((entry) => {
      const href = safeEvidenceUrl(entry.url);
      return <li key={entry.id}>{href ? <a className={styles.evidenceLink} href={href} target="_blank" rel="noreferrer">{entry.title}</a> : <span>{entry.title}</span>} <span>· {entry.publisher}{entry.publishedAt ? ` · ${entry.publishedAt}` : ""}</span></li>;
    })}</ul>;
  }
  if (section.primitive === "narrative") {
    return <div>{selectedItems.map((item) => <p className={styles.signalDetail} key={item.id}>{item.detail}</p>)}</div>;
  }
  return <ul className={styles.signalList}>{selectedItems.map((item) => <li className={styles.signalItem} key={item.id}><span className={salienceClass(styles, item.salience)}>{item.salience}</span><div><span className={styles.signalTitle}>{item.title}</span><p className={styles.signalDetail}>{item.detail}</p></div></li>)}</ul>;
}

function ProjectionSectionView({ section, items, evidence }: { section: ProjectionSection; items: IntelligenceItem[]; evidence: EvidenceItem[] }) {
  const styles = useStyles();
  const className = `${styles.projectionSection} ${section.priority === "primary" ? styles.projectionPrimary : ""} ${section.priority === "tertiary" ? styles.projectionTertiary : ""}`;
  const label = `${section.primitive} · ${section.priority} · ${section.disclosure}`;
  if (section.disclosure === "collapsed") {
    return <details className={className} key={section.id}>
      <summary className={styles.disclosureSummary}><span className={styles.primitiveLabel}>{label}</span><span className={styles.disclosureTitle}>{section.title}</span></summary>
      <div className={styles.disclosureContent}><ProjectionPrimitive section={section} items={items} evidence={evidence} /></div>
    </details>;
  }
  return <section className={className} key={section.id}><p className={styles.primitiveLabel}>{label}</p><h3 className={styles.primitiveTitle}>{section.title}</h3><ProjectionPrimitive section={section} items={items} evidence={evidence} /></section>;
}

const IntelligenceProjectionsView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const value = asRecord(valueOf(node));
  const context = String(node.props.presentationContext ?? "portfolio-overview");
  const error = String(node.props.error ?? "");
  const { policy, candidate: selected, sections } = selectIntelligenceProjection(value, context, node.props.projectionRecipe);
  if (Object.keys(value).length === 0) {
    return <section className={styles.intelligence2}><div className={styles.intelligence2Header}><div><p className={styles.advisoryEyebrow}>Portfolio Intelligence 2</p><h2 className={styles.intelligence2Title}>{error ? "Analysis unavailable" : "Context-aware analysis ready"}</h2><p className={styles.intelligence2Summary}>{error || "Analyze the portfolio to generate semantic content and alternative projections for the current attention context."}</p></div><div className={styles.recipeMeta}><span className={styles.recipeToken}>{policy.attention}</span><span className={styles.recipeToken}>{context}</span></div></div></section>;
  }
  const items = intelligenceItems(value.items);
  const evidence = evidenceItems(value.evidence);
  const candidates = projectionCandidates(value.projectionCandidates);
  return <section className={styles.intelligence2}>
    <header className={styles.intelligence2Header}>
      <div><p className={styles.advisoryEyebrow}>Portfolio Intelligence 2</p><h2 className={styles.intelligence2Title}>{String(value.headline ?? "Structured assessment")}</h2><p className={styles.intelligence2Summary}>{String(value.summary ?? "")}</p></div>
      <div className={styles.recipeMeta}><span className={styles.recipeToken}>{policy.attention}</span><span className={styles.recipeToken}>{selected?.label ?? "fallback"}</span><span className={styles.recipeToken}>as of {String(value.asOf ?? "unknown")}</span></div>
    </header>
    <div className={styles.projectionBody}>
      <p className={styles.projectionRationale}>Selected by the Blueprint recipe for {context}: {selected?.rationale ?? "First valid candidate."}</p>
      <div className={styles.projectionGrid}>{sections.map((section) => <ProjectionSectionView section={section} items={items} evidence={evidence} key={section.id} />)}</div>
    </div>
    <footer className={styles.alternatives}><strong>Agent-proposed projections</strong>{candidates.map((candidate) => <span className={styles.alternative} key={candidate.id}>{candidate.label} · {candidate.attention}{candidate.id === selected?.id ? " · selected" : ""}</span>)}</footer>
  </section>;
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
          <button className={styles.workflowButton} disabled={pendingCommand !== null} type="button" onClick={() => void runWorkflow("requestIntelligence2")}>Analyze intelligence 2</button>
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
  comparison: StrategyComparisonView,
};
