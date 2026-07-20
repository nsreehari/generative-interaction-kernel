import React from "react";
import { Button, makeStyles, shorthands, tokens } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";

const useStyles = makeStyles({
  page: {
    width: "100%",
    minWidth: 0,
    overflowX: "hidden",
    color: "var(--text)",
    backgroundColor: "var(--bg)",
  },
  inner: {
    width: "100%",
    maxWidth: "1180px",
    margin: "0 auto",
    paddingLeft: tokens.spacingHorizontalXL,
    paddingRight: tokens.spacingHorizontalXL,
    boxSizing: "border-box",
  },
  hero: {
    minHeight: "560px",
    display: "flex",
    alignItems: "center",
    paddingTop: "72px",
    paddingBottom: "72px",
    backgroundColor: "var(--panel)",
    borderBottom: `${tokens.strokeWidthThin} solid var(--line)`,
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(340px, 0.85fr)",
    gap: "64px",
    alignItems: "center",
    "@media (max-width: 860px)": { gridTemplateColumns: "1fr", gap: tokens.spacingVerticalXXL },
  },
  eyebrow: {
    marginBottom: tokens.spacingVerticalM,
    color: "var(--accent)",
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightBold,
    letterSpacing: "0",
    textTransform: "uppercase",
  },
  heroTitle: {
    maxWidth: "760px",
    margin: `0 0 ${tokens.spacingVerticalL}`,
    fontSize: "56px",
    lineHeight: 1.04,
    fontWeight: tokens.fontWeightBold,
    letterSpacing: "0",
    "@media (max-width: 600px)": { fontSize: "38px" },
  },
  lead: { maxWidth: "720px", margin: 0, color: "var(--muted)", fontSize: tokens.fontSizeBase400, lineHeight: 1.55 },
  contractLine: {
    margin: `${tokens.spacingVerticalL} 0 0`,
    paddingLeft: tokens.spacingHorizontalM,
    borderLeft: "4px solid var(--line)",
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: 1.4,
  },
  heroAction: { marginTop: tokens.spacingVerticalXL },
  button: { minHeight: "42px", borderRadius: tokens.borderRadiusMedium, fontWeight: tokens.fontWeightSemibold },
  contractPanel: {
    display: "grid",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXL,
    backgroundColor: "var(--panel-2)",
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusMedium,
  },
  contractHeader: { margin: 0, fontSize: tokens.fontSizeBase500 },
  contractItem: {
    display: "grid",
    gridTemplateColumns: "34px minmax(0, 1fr)",
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `${tokens.strokeWidthThin} solid var(--line)`,
  },
  contractNumber: {
    display: "grid",
    placeItems: "center",
    width: "32px",
    height: "32px",
    color: "var(--text)",
    backgroundColor: "var(--panel)",
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusMedium,
    fontWeight: tokens.fontWeightBold,
  },
  contractName: { margin: 0, fontWeight: tokens.fontWeightBold },
  contractText: { margin: `${tokens.spacingVerticalXXS} 0 0`, color: "var(--muted)", lineHeight: 1.45 },
  band: { paddingTop: "76px", paddingBottom: "76px", borderBottom: `${tokens.strokeWidthThin} solid var(--line)` },
  alternateBand: { backgroundColor: "var(--panel-2)" },
  sectionHeader: {
    display: "grid",
    gridTemplateColumns: "180px minmax(0, 1fr)",
    gap: tokens.spacingHorizontalXXL,
    marginBottom: tokens.spacingVerticalXXL,
    "@media (max-width: 700px)": { gridTemplateColumns: "1fr", gap: tokens.spacingVerticalS },
  },
  sectionIndex: { color: "var(--accent)", fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  sectionTitle: {
    maxWidth: "760px",
    margin: 0,
    fontSize: "36px",
    lineHeight: 1.15,
    letterSpacing: "0",
    "@media (max-width: 600px)": { fontSize: "30px" },
  },
  fractureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalL,
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
  },
  fractureItem: { paddingTop: tokens.spacingVerticalL, borderTop: "2px solid var(--line)" },
  itemTitle: { margin: `0 0 ${tokens.spacingVerticalS}`, fontSize: tokens.fontSizeBase400 },
  body: { margin: 0, color: "var(--muted)", fontSize: tokens.fontSizeBase300, lineHeight: 1.55 },
  warningLine: {
    maxWidth: "780px",
    margin: `${tokens.spacingVerticalXXL} 0 0`,
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: 1.4,
  },
  modeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    alignItems: "stretch",
    gap: tokens.spacingHorizontalL,
    "@media (max-width: 900px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    "@media (max-width: 560px)": { gridTemplateColumns: "1fr" },
  },
  mode: {
    padding: tokens.spacingHorizontalXL,
    backgroundColor: "var(--panel)",
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusMedium,
  },
  modeLabel: {
    display: "inline-block",
    marginBottom: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    color: "var(--muted)",
    backgroundColor: "var(--panel-2)",
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusSmall,
    fontWeight: tokens.fontWeightSemibold,
  },
  modeBridge: {
    display: "grid",
    placeItems: "center",
    color: "var(--muted)",
    fontSize: "28px",
    fontWeight: tokens.fontWeightBold,
    "@media (max-width: 760px)": { transform: "rotate(90deg)", minHeight: "48px" },
  },
  invariant: {
    marginTop: tokens.spacingVerticalXL,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`,
    backgroundColor: "var(--panel)",
    borderLeft: "4px solid var(--line)",
    borderRadius: tokens.borderRadiusMedium,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: 1.5,
  },
  journey: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(180px, 1fr))",
    gap: tokens.spacingHorizontalS,
    overflowX: "auto",
    paddingBottom: tokens.spacingVerticalS,
  },
  journeyStep: {
    minWidth: "150px",
    minHeight: "170px",
    padding: tokens.spacingHorizontalM,
    backgroundColor: "var(--panel)",
    borderTop: "3px solid var(--line)",
    borderRadius: tokens.borderRadiusMedium,
  },
  autonomousStep: { backgroundColor: "var(--panel-2)" },
  approvalStep: { borderTopColor: "var(--accent)" },
  stepNumber: { color: "var(--muted)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold },
  stepTitle: { margin: `${tokens.spacingVerticalS} 0`, fontSize: tokens.fontSizeBase300 },
  stepText: { margin: 0, color: "var(--muted)", lineHeight: 1.45 },
  trace: {
    display: "grid",
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalXL,
    padding: tokens.spacingHorizontalL,
    color: "var(--text)",
    backgroundColor: "var(--panel-2)",
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: "Consolas, monospace",
    fontSize: tokens.fontSizeBase200,
    lineHeight: 1.5,
  },
  traceRow: {
    display: "grid",
    gridTemplateColumns: "80px 130px minmax(0, 1fr)",
    gap: tokens.spacingHorizontalM,
    "@media (max-width: 600px)": { gridTemplateColumns: "1fr", gap: tokens.spacingVerticalXXS, paddingBottom: tokens.spacingVerticalS },
  },
  traceTime: { color: "var(--muted)" },
  traceAccepted: { color: tokens.colorStatusSuccessForeground1 },
  traceRejected: { color: tokens.colorStatusDangerForeground1 },
  proofGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalL,
    "@media (max-width: 700px)": { gridTemplateColumns: "1fr" },
  },
  proof: { paddingTop: tokens.spacingVerticalL, borderTop: "2px solid var(--line)" },
  forkGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalXL,
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
  },
  fork: {
    display: "flex",
    minHeight: "250px",
    flexDirection: "column",
    alignItems: "flex-start",
    padding: tokens.spacingHorizontalXL,
    backgroundColor: "var(--panel)",
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusMedium,
  },
  forkLabel: { color: "var(--accent)", fontWeight: tokens.fontWeightBold },
  forkTitle: { margin: `${tokens.spacingVerticalS} 0`, fontSize: tokens.fontSizeBase600 },
  forkText: { flexGrow: 1, margin: `0 0 ${tokens.spacingVerticalL}`, color: "var(--muted)", fontSize: tokens.fontSizeBase300, lineHeight: 1.55 },
  expansion: {
    paddingTop: "56px",
    paddingBottom: "56px",
    color: "var(--text)",
    backgroundColor: "var(--panel-2)",
    borderTop: "1px solid var(--line)",
  },
  expansionText: { maxWidth: "920px", margin: 0, fontSize: tokens.fontSizeBase500, lineHeight: 1.45, fontWeight: tokens.fontWeightSemibold },
  domainGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalXL,
    marginTop: tokens.spacingVerticalXL,
    "@media (max-width: 700px)": { gridTemplateColumns: "1fr" },
  },
  domain: { paddingTop: tokens.spacingVerticalL, borderTop: "3px solid var(--line)" },
  sharedRail: { display: "flex", gap: tokens.spacingHorizontalS, flexWrap: "wrap", marginTop: tokens.spacingVerticalXL },
  sharedTag: { padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, border: "1px solid var(--line)", borderRadius: tokens.borderRadiusSmall, backgroundColor: "var(--panel)" },
  boundary: { marginTop: tokens.spacingVerticalXL, color: "var(--muted)", lineHeight: 1.55 },
  forthcoming: { display: "inline-block", marginTop: tokens.spacingVerticalM, color: "var(--accent)", fontWeight: tokens.fontWeightBold },
});

interface StoryItem { title: string; text: string }
interface Actor { id: string; name: string; kind: string; role: string }
interface SocAct extends StoryItem { id: number }
interface CausalStep { result: string; text: string }
interface ProofPlane extends StoryItem { id: string; label: string; blueprint: string; gik: boolean; button: string }
interface Domain { id: string; label: string; text: string }
interface Storyboard {
  hero: { eyebrow: string; title: string; lead: string; contract: string };
  invariants: StoryItem[];
  fractures: StoryItem[];
  actors: Actor[];
  socActs: SocAct[];
  causalChain: CausalStep[];
  trustProof: StoryItem[];
  proofPlanes: ProofPlane[];
  expansion: { title: string; domains: Domain[]; shared: string[]; taxJourney: string[]; boundary: string; status: string };
}

function openBlueprint(blueprintId: string, gik: boolean) {
  const current = new URL(window.location.href);
  current.searchParams.delete("blueprint");
  current.searchParams.delete("bundle");
  current.searchParams.set("b", blueprintId);
  if (gik) current.searchParams.set("gik", "1");
  else current.searchParams.delete("gik");
  current.searchParams.delete("plane");
  current.searchParams.delete("context");
  window.location.assign(current.toString());
}

function scrollToJourney() {
  document.getElementById("soc-journey")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const PlatformStoryboardView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const overview = node.props.overview as unknown as Storyboard;

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="platform-storyboard-title">
        <div className={`${styles.inner} ${styles.heroGrid}`}>
          <div>
            <div className={styles.eyebrow}>{overview.hero.eyebrow}</div>
            <h1 id="platform-storyboard-title" className={styles.heroTitle}>{overview.hero.title}</h1>
            <p className={styles.lead}>{overview.hero.lead}</p>
            <p className={styles.contractLine}>{overview.hero.contract}</p>
            <div className={styles.heroAction}>
              <Button appearance="primary" className={styles.button} onClick={scrollToJourney}>See how it works</Button>
            </div>
          </div>
          <aside className={styles.contractPanel} aria-label="Platform contract">
            <h2 className={styles.contractHeader}>The workspace contract</h2>
            {overview.invariants.slice(1).map((item, index) => (
              <div key={item.title} className={styles.contractItem}>
                <span className={styles.contractNumber}>{index + 1}</span>
                <div><p className={styles.contractName}>{item.title}</p><p className={styles.contractText}>{item.text}</p></div>
              </div>
            ))}
          </aside>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="why-now-title">
        <div className={styles.inner}>
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIndex}>01 · Why now</div>
            <h2 id="why-now-title" className={styles.sectionTitle}>AI has started doing the work. The systems around it have not caught up.</h2>
          </header>
          <div className={styles.fractureGrid}>
            {overview.fractures.map((item) => <article key={item.title} className={styles.fractureItem}><h3 className={styles.itemTitle}>{item.title}</h3><p className={styles.body}>{item.text}</p></article>)}
          </div>
          <p className={styles.warningLine}>A hallucinated answer is inconvenient. A hallucinated action is an incident.</p>
        </div>
      </section>

      <section className={`${styles.band} ${styles.alternateBand}`} aria-labelledby="contract-title">
        <div className={styles.inner}>
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIndex}>02 · Product contract</div>
            <h2 id="contract-title" className={styles.sectionTitle}>Many participants. One operational truth. Authority stays explicit.</h2>
          </header>
          <div className={styles.modeGrid}>
            {overview.actors.map((actor) => <article key={actor.id} className={styles.mode}>
              <div className={styles.modeLabel}>{actor.kind}</div>
              <h3 className={styles.itemTitle}>{actor.name}</h3>
              <p className={styles.body}>{actor.role}</p>
            </article>)}
          </div>
          <div className={styles.invariant}>
            The invariant: all four contribute through one event and state model. Their roles determine who may investigate, recommend, authorize, or execute.
          </div>
        </div>
      </section>

      <section id="soc-journey" className={styles.band} aria-labelledby="soc-journey-title">
        <div className={styles.inner}>
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIndex}>03 · SOC first</div>
            <h2 id="soc-journey-title" className={styles.sectionTitle}>A privileged-access anomaly becomes one governed mixed-team investigation.</h2>
          </header>
          <div className={styles.journey} aria-label="SOC investigation journey">
            {overview.socActs.map((act) => (
              <article key={act.id} className={`${styles.journeyStep} ${act.id === 5 ? styles.approvalStep : ""}`}>
                <div className={styles.stepNumber}>ACT {act.id}</div><h3 className={styles.stepTitle}>{act.title}</h3><p className={styles.stepText}>{act.text}</p>
              </article>
            ))}
          </div>
          <div className={styles.trace} aria-label="Governed action trace">
            {overview.causalChain.map((step, index) => <div className={styles.traceRow} key={step.result}>
              <span className={styles.traceTime}>{String(index + 1).padStart(2, "0")}</span>
              <strong className={step.result.startsWith("Rejected") ? styles.traceRejected : styles.traceAccepted}>{step.result.toUpperCase()}</strong>
              <span>{step.text}</span>
            </div>)}
          </div>
        </div>
      </section>

      <section className={`${styles.band} ${styles.alternateBand}`} aria-labelledby="trust-title">
        <div className={styles.inner}>
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIndex}>04 · Why trust it</div>
            <h2 id="trust-title" className={styles.sectionTitle}>Governance is attached to the work, not reconstructed afterward.</h2>
          </header>
          <div className={styles.proofGrid}>
            {overview.trustProof.map((item) => <article key={item.title} className={styles.proof}><h3 className={styles.itemTitle}>{item.title}</h3><p className={styles.body}>{item.text}</p></article>)}
          </div>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="proof-path-title">
        <div className={styles.inner}>
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIndex}>05 · Enter the proof</div>
            <h2 id="proof-path-title" className={styles.sectionTitle}>One governed system. Two proof planes.</h2>
          </header>
          <div className={styles.forkGrid}>
            {overview.proofPlanes.map((proof, index) => <article className={styles.fork} key={proof.id}>
              <div className={styles.forkLabel}>{proof.label}</div><h3 className={styles.forkTitle}>{proof.title}</h3>
              <p className={styles.forkText}>{proof.text}</p>
              <Button appearance={index === 0 ? "primary" : "secondary"} className={styles.button} onClick={() => openBlueprint(proof.blueprint, proof.gik)}>{proof.button}</Button>
            </article>)}
          </div>
        </div>
      </section>

      <footer className={styles.expansion}>
        <div className={styles.inner}>
          <p className={styles.expansionText}>{overview.expansion.title}</p>
          <div className={styles.domainGrid}>
            {overview.expansion.domains.map((domain) => <article className={styles.domain} key={domain.id}>
              <div className={styles.eyebrow}>{domain.label}</div>
              <p className={styles.body}>{domain.text}</p>
              {domain.id === "tax-prep" ? <ol className={styles.body}>{overview.expansion.taxJourney.map((step) => <li key={step}>{step}</li>)}</ol> : null}
            </article>)}
          </div>
          <div className={styles.sharedRail}>{overview.expansion.shared.map((item) => <span className={styles.sharedTag} key={item}>{item}</span>)}</div>
          <p className={styles.boundary}>{overview.expansion.boundary}</p>
          <span className={styles.forthcoming}>{overview.expansion.status}</span>
        </div>
      </footer>
    </main>
  );
};

const projectionViews: Record<string, ProjectionView> = { "platform-storyboard": PlatformStoryboardView };

export default projectionViews;