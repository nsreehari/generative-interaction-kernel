import React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";

const useStyles = makeStyles({
  intelligence: { border: "1px solid #c7ccd1", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", overflow: "hidden", boxShadow: "0 2px 8px rgba(0, 0, 0, .06)" },
  header: { padding: tokens.spacingHorizontalXL, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: tokens.spacingHorizontalXL, alignItems: "start", borderBottom: "1px solid #e2e5e9", backgroundColor: "#fbfcfd", "@media (max-width: 720px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  eyebrow: { margin: `0 0 ${tokens.spacingVerticalXS}`, color: "#57606a", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  title: { margin: `0 0 ${tokens.spacingVerticalXS}`, fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightSemibold },
  summary: { margin: 0, maxWidth: "76ch", color: "#42464d", lineHeight: tokens.lineHeightBase400 },
  recipeMeta: { display: "flex", gap: tokens.spacingHorizontalXS, flexWrap: "wrap", justifyContent: "end", "@media (max-width: 720px)": { justifyContent: "start" } },
  recipeToken: { padding: `3px ${tokens.spacingHorizontalS}`, border: "1px solid #b7bdc5", borderRadius: tokens.borderRadiusMedium, backgroundColor: "#ffffff", color: "#42464d", fontSize: tokens.fontSizeBase200, whiteSpace: "nowrap" },
  body: { padding: tokens.spacingHorizontalXL, display: "grid", gap: tokens.spacingVerticalXL },
  rationale: { margin: 0, color: "#57606a", fontSize: tokens.fontSizeBase200 },
  grid: { display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: tokens.spacingHorizontalL },
  section: { gridColumn: "span 6", minWidth: 0, padding: tokens.spacingHorizontalL, borderTop: "2px solid #b7bdc5", backgroundColor: "#f8f9fa", "@media (max-width: 760px)": { gridColumn: "1 / -1" } },
  primary: { gridColumn: "1 / -1", borderTopColor: "#0f6cbd", backgroundColor: "#f3f8fc" },
  tertiary: { gridColumn: "span 4", "@media (max-width: 980px)": { gridColumn: "span 6" }, "@media (max-width: 760px)": { gridColumn: "1 / -1" } },
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
  metricBlock: { display: "grid", gap: tokens.spacingVerticalXS },
  metricCaption: { color: "#57606a", fontSize: tokens.fontSizeBase200 },
  metricNumber: { fontSize: tokens.fontSizeBase500, fontVariantNumeric: "tabular-nums" },
  timeline: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: tokens.spacingVerticalM },
  timelineItem: { display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: tokens.spacingHorizontalL },
  evidenceList: { margin: 0, paddingLeft: tokens.spacingHorizontalL, display: "grid", gap: tokens.spacingVerticalS },
  evidenceLink: { color: "#0f6cbd", fontWeight: tokens.fontWeightSemibold },
  provenance: { margin: 0, padding: `0 ${tokens.spacingHorizontalXL} ${tokens.spacingHorizontalXL}`, color: "#57606a", fontSize: tokens.fontSizeBase200 },
  alternatives: { padding: tokens.spacingHorizontalXL, borderTop: "1px solid #e2e5e9", display: "flex", gap: tokens.spacingHorizontalS, flexWrap: "wrap", alignItems: "center" },
  alternative: { padding: `3px ${tokens.spacingHorizontalS}`, backgroundColor: "#f3f4f6", fontSize: tokens.fontSizeBase200 },
});

export type ProjectionSection = { id: string; title: string; primitive: string; priority: string; disclosure: string; contentIds: string[] };
export type ProjectionCandidate = { id: string; label: string; attention: string; rationale: string; sections: ProjectionSection[] };
export type ProjectionPolicy = { attention: string; showDisclosure: string[]; maxSections: number };
type IntelligenceItem = { id: string; kind: string; title: string; detail: string; salience: string; confidence: string; entities: string[]; value: string; unit: string; date: string; evidenceIds: string[] };
type EvidenceItem = { id: string; title: string; publisher: string; url: string; publishedAt: string };

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
    id: String(candidate.id ?? ""), label: String(candidate.label ?? ""), attention: String(candidate.attention ?? ""), rationale: String(candidate.rationale ?? ""),
    sections: Array.isArray(candidate.sections) ? candidate.sections.map(asRecord).map((section) => ({
      id: String(section.id ?? ""), title: String(section.title ?? ""), primitive: String(section.primitive ?? ""), priority: String(section.priority ?? "secondary"),
      disclosure: String(section.disclosure ?? "collapsed"), contentIds: Array.isArray(section.contentIds) ? section.contentIds.map(String) : [],
    })) : [],
  })).filter((candidate) => candidate.id && candidate.sections.length > 0) : [];
}

export function selectIntelligenceProjection(value: unknown, context: string, recipeValue: unknown): { policy: ProjectionPolicy; candidate: ProjectionCandidate | undefined; sections: ProjectionSection[] } {
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
  const sections = (candidate?.sections ?? []).filter((section) => policy.showDisclosure.includes(section.disclosure)).slice(0, policy.maxSections);
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

function salienceClass(styles: ReturnType<typeof useStyles>, salience: string): string {
  if (salience === "critical") return `${styles.salience} ${styles.salienceCritical}`;
  if (salience === "high") return `${styles.salience} ${styles.salienceHigh}`;
  return styles.salience;
}

function ProjectionPrimitive({ section, items, evidence }: { section: ProjectionSection; items: IntelligenceItem[]; evidence: EvidenceItem[] }) {
  const styles = useStyles();
  const selectedItems = section.contentIds.map((id) => items.find((item) => item.id === id)).filter((item): item is IntelligenceItem => item !== undefined);
  const selectedEvidence = section.contentIds.map((id) => evidence.find((item) => item.id === id)).filter((item): item is EvidenceItem => item !== undefined);
  if (section.primitive === "hero-signal") {
    const item = selectedItems[0];
    return item ? <><p className={styles.heroSignal}>{item.title}</p><p className={styles.signalDetail}>{item.detail}</p></> : null;
  }
  if (section.primitive === "metric-strip") return <div className={styles.metricStrip}>{selectedItems.map((item) => <div className={styles.metricBlock} key={item.id}><span className={styles.metricCaption}>{item.title}</span><strong className={styles.metricNumber}>{formatIntelligenceMetric(item.value, item.unit)}</strong></div>)}</div>;
  if (section.primitive === "timeline") return <ol className={styles.timeline}>{selectedItems.map((item) => <li className={styles.timelineItem} key={item.id}><strong>{item.date || "Upcoming"}</strong><div><span className={styles.signalTitle}>{item.title}</span><p className={styles.signalDetail}>{item.detail}</p></div></li>)}</ol>;
  if (section.primitive === "evidence-list") {
    const linkedEvidence = selectedEvidence.length > 0 ? selectedEvidence : evidence.filter((entry) => selectedItems.some((item) => item.evidenceIds.includes(entry.id)));
    return <ul className={styles.evidenceList}>{linkedEvidence.map((entry) => {
      const href = safeEvidenceUrl(entry.url);
      return <li key={entry.id}>{href ? <a className={styles.evidenceLink} href={href} target="_blank" rel="noreferrer">{entry.title}</a> : <span>{entry.title}</span>} <span>· {entry.publisher}{entry.publishedAt ? ` · ${entry.publishedAt}` : ""}</span></li>;
    })}</ul>;
  }
  if (section.primitive === "narrative") return <div>{selectedItems.map((item) => <p className={styles.signalDetail} key={item.id}>{item.detail}</p>)}</div>;
  return <ul className={styles.signalList}>{selectedItems.map((item) => <li className={styles.signalItem} key={item.id}><span className={salienceClass(styles, item.salience)}>{item.salience}</span><div><span className={styles.signalTitle}>{item.title}</span><p className={styles.signalDetail}>{item.detail}</p></div></li>)}</ul>;
}

function ProjectionSectionView({ section, items, evidence, diagnostics }: { section: ProjectionSection; items: IntelligenceItem[]; evidence: EvidenceItem[]; diagnostics: boolean }) {
  const styles = useStyles();
  const className = [styles.section, section.priority === "primary" ? styles.primary : "", section.priority === "tertiary" ? styles.tertiary : ""].filter(Boolean).join(" ");
  const label = `${section.primitive} · ${section.priority} · ${section.disclosure}`;
  if (section.disclosure === "collapsed") return <details className={className}><summary className={styles.disclosureSummary}>{diagnostics ? <span className={styles.primitiveLabel}>{label}</span> : null}<span className={styles.disclosureTitle}>{section.title}</span></summary><div className={styles.disclosureContent}><ProjectionPrimitive section={section} items={items} evidence={evidence} /></div></details>;
  return <section className={className}>{diagnostics ? <p className={styles.primitiveLabel}>{label}</p> : null}<h3 className={styles.primitiveTitle}>{section.title}</h3><ProjectionPrimitive section={section} items={items} evidence={evidence} /></section>;
}

const IntelligenceProjectionsView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const value = asRecord(node.props.value);
  const context = String(node.props.presentationContext ?? "portfolio-overview");
  const error = String(node.props.error ?? "");
  const diagnostics = node.props.projectionDiagnostics === true;
  const { policy, candidate: selected, sections } = selectIntelligenceProjection(value, context, node.props.projectionRecipe);
  if (Object.keys(value).length === 0) return <section className={styles.intelligence}><div className={styles.header}><div><p className={styles.eyebrow}>Portfolio intelligence</p><h2 className={styles.title}>{error ? "Analysis unavailable" : "Analysis pending"}</h2><p className={styles.summary}>{error || "Portfolio intelligence will appear when its source settles."}</p></div></div></section>;
  const items = intelligenceItems(value.items);
  const evidence = evidenceItems(value.evidence);
  const candidates = projectionCandidates(value.projectionCandidates);
  const heroSection = sections.find((section) => section.primitive === "hero-signal");
  const heroItem = heroSection?.contentIds.map((id) => items.find((item) => item.id === id)).find((item): item is IntelligenceItem => item !== undefined);
  const visibleSections = diagnostics || !heroSection ? sections : sections.filter((section) => section.id !== heroSection.id);
  const headline = diagnostics ? String(value.headline ?? "Structured assessment") : heroItem?.title ?? String(value.headline ?? "Portfolio assessment");
  const summary = diagnostics || policy.attention === "focused" ? String(value.summary ?? "") : heroItem?.detail ?? String(value.summary ?? "");
  const provenance = evidence.length > 0 ? `Based on the supplied portfolio data and ${evidence.length} external ${evidence.length === 1 ? "source" : "sources"}.` : "Based on the supplied portfolio data. External news was not included.";
  return <section className={styles.intelligence}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Portfolio intelligence</p><h2 className={styles.title}>{headline}</h2><p className={styles.summary}>{summary}</p></div><div className={styles.recipeMeta}>{diagnostics ? <><span className={styles.recipeToken}>{policy.attention}</span><span className={styles.recipeToken}>{selected?.label ?? "fallback"}</span></> : null}<span className={styles.recipeToken}>As of {String(value.asOf ?? "unknown")}</span></div></header>
    <div className={styles.body}>{diagnostics ? <p className={styles.rationale}>Selected by the Blueprint recipe for {context}: {selected?.rationale ?? "First valid candidate."}</p> : null}<div className={styles.grid}>{visibleSections.map((section) => <ProjectionSectionView section={section} items={items} evidence={evidence} diagnostics={diagnostics} key={section.id} />)}</div></div>
    {diagnostics ? <footer className={styles.alternatives}><strong>Agent-proposed projections</strong>{candidates.map((candidate) => <span className={styles.alternative} key={candidate.id}>{candidate.label} · {candidate.attention}{candidate.id === selected?.id ? " · selected" : ""}</span>)}</footer> : <p className={styles.provenance}>{provenance}</p>}
  </section>;
};

export default { "intelligence-projections": IntelligenceProjectionsView };