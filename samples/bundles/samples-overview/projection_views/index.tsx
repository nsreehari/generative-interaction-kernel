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
    gridTemplateColumns: "minmax(0, 1fr) 80px minmax(0, 1fr)",
    alignItems: "stretch",
    gap: tokens.spacingHorizontalL,
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
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
    gridTemplateColumns: "repeat(6, minmax(150px, 1fr))",
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
});

const fractureItems = [
  ["Human interface", "The analyst sees one version of the investigation, shaped by a static dashboard."],
  ["Agent runtime", "The agent reasons over a separate context, with its own interpretation of state."],
  ["Autonomous backend", "Headless work disappears into another process, leaving accountability to logs after the fact."],
];

const journeySteps = [
  ["Intent arrives", "Investigate this phishing alert.", "shared"],
  ["Evidence assembles", "Trusted signals become one evolving analyst workspace.", "shared"],
  ["Human + agent investigate", "Both participants work against the same governed state.", "shared"],
  ["Analyst steps away", "The agent continues asynchronously under the same capabilities and policy.", "autonomous"],
  ["Findings return", "New evidence and rationale re-enter the same workspace, fully attributed.", "autonomous"],
  ["Action is governed", "Isolate Host requires human confirmation before execution.", "approval"],
];

const proofItems = [
  ["A single source of truth", "Human interface and agent context derive from the same evolving graph. There is no shadow state to sync or reconcile."],
  ["Relentless continuity", "An agent can seamlessly transition from live collaboration to headless autonomy without leaving the governance boundary."],
  ["Deterministic by design", "The AI proposes. A pure kernel evaluates the patch. Actions are executed, rejected, or routed to a human for confirmation."],
  ["Forensic accountability", "Every hypothesis, rejection, state mutation, and approval is immutably traced back to a specific capability and policy."],
];

function openBundle(bundleId: string) {
  const current = new URL(window.location.href);
  current.searchParams.set("bundle", bundleId);
  window.location.assign(current.toString());
}

function scrollToJourney() {
  document.getElementById("soc-journey")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const SamplesOverviewView: ProjectionView = () => {
  const styles = useStyles();
  const journeyClass = (mode: string) =>
    `${styles.journeyStep} ${mode === "autonomous" ? styles.autonomousStep : mode === "approval" ? styles.approvalStep : ""}`;

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="platform-storyboard-title">
        <div className={`${styles.inner} ${styles.heroGrid}`}>
          <div>
            <div className={styles.eyebrow}>Governed human-agent collaboration</div>
            <h1 id="platform-storyboard-title" className={styles.heroTitle}>Humans and agents need one governed place to work.</h1>
            <p className={styles.lead}>
              AI now investigates, recommends, and acts. The Generative Interaction Kernel gives humans and agents one evolving workspace where they can work
              together or continue autonomously without fragmenting state, authority, or accountability.
            </p>
            <p className={styles.contractLine}>Agents can leave the screen. They cannot leave the governance boundary.</p>
            <div className={styles.heroAction}>
              <Button appearance="primary" className={styles.button} onClick={scrollToJourney}>See how it works</Button>
            </div>
          </div>
          <aside className={styles.contractPanel} aria-label="Platform contract">
            <h2 className={styles.contractHeader}>The workspace contract</h2>
            {[
              ["Shared state", "One evolving source of truth for human and agent participants."],
              ["Governed action", "Every consequential change crosses the same authority."],
              ["Complete trace", "Interactive and autonomous work remain attributable."],
            ].map(([name, text], index) => (
              <div key={name} className={styles.contractItem}>
                <span className={styles.contractNumber}>{index + 1}</span>
                <div><p className={styles.contractName}>{name}</p><p className={styles.contractText}>{text}</p></div>
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
            {fractureItems.map(([title, text]) => <article key={title} className={styles.fractureItem}><h3 className={styles.itemTitle}>{title}</h3><p className={styles.body}>{text}</p></article>)}
          </div>
          <p className={styles.warningLine}>A hallucinated answer is inconvenient. A hallucinated action is an incident.</p>
        </div>
      </section>

      <section className={`${styles.band} ${styles.alternateBand}`} aria-labelledby="contract-title">
        <div className={styles.inner}>
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIndex}>02 · Product contract</div>
            <h2 id="contract-title" className={styles.sectionTitle}>One workspace. Two participation modes. The same authority throughout.</h2>
          </header>
          <div className={styles.modeGrid}>
            <article className={styles.mode}>
              <div className={styles.modeLabel}>Inside the interaction loop</div>
              <h3 className={styles.itemTitle}>Human and agent collaborate live</h3>
              <p className={styles.body}>They inspect evidence, shape the investigation, and propose next steps through the same evolving workspace.</p>
            </article>
            <div className={styles.modeBridge} aria-hidden="true">↔</div>
            <article className={styles.mode}>
              <div className={styles.modeLabel}>Outside the interaction loop</div>
              <h3 className={styles.itemTitle}>The agent continues autonomously</h3>
              <p className={styles.body}>It monitors, invokes tools, derives findings, and prepares decisions without creating a second source of truth.</p>
            </article>
          </div>
          <div className={styles.invariant}>
            The invariant: both modes use the same state, capabilities, policy, authority, and trace. The AI may adapt the
            experience and continue the work. It never becomes the authority.
          </div>
        </div>
      </section>

      <section id="soc-journey" className={styles.band} aria-labelledby="soc-journey-title">
        <div className={styles.inner}>
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIndex}>03 · SOC first</div>
            <h2 id="soc-journey-title" className={styles.sectionTitle}>A phishing alert becomes a continuous, governed investigation.</h2>
          </header>
          <div className={styles.journey} aria-label="SOC investigation journey">
            {journeySteps.map(([title, text, mode], index) => (
              <article key={title} className={journeyClass(mode)}>
                <div className={styles.stepNumber}>STEP {index + 1}</div><h3 className={styles.stepTitle}>{title}</h3><p className={styles.stepText}>{text}</p>
              </article>
            ))}
          </div>
          <div className={styles.trace} aria-label="Governed action trace">
            <div className={styles.traceRow}><span className={styles.traceTime}>09:42:18</span><strong className={styles.traceAccepted}>PROPOSED</strong><span>Agent derives lateral-movement finding from trusted evidence</span></div>
            <div className={styles.traceRow}><span className={styles.traceTime}>09:42:18</span><strong className={styles.traceAccepted}>VALIDATED</strong><span>Finding matches capability, schema, and investigation policy</span></div>
            <div className={styles.traceRow}><span className={styles.traceTime}>09:44:03</span><strong className={styles.traceRejected}>REJECTED</strong><span>Unsupported containment target blocked; governed fallback preserved state</span></div>
            <div className={styles.traceRow}><span className={styles.traceTime}>09:45:27</span><strong className={styles.traceAccepted}>CONFIRM</strong><span>Isolate Host returned to analyst for explicit approval</span></div>
          </div>
        </div>
      </section>

      <section className={`${styles.band} ${styles.alternateBand}`} aria-labelledby="trust-title">
        <div className={styles.inner}>
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIndex}>04 · Why trust it</div>
            <h2 id="trust-title" className={styles.sectionTitle}>Autonomy without a shadow system.</h2>
          </header>
          <div className={styles.proofGrid}>
            {proofItems.map(([title, text]) => <article key={title} className={styles.proof}><h3 className={styles.itemTitle}>{title}</h3><p className={styles.body}>{text}</p></article>)}
          </div>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="proof-path-title">
        <div className={styles.inner}>
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIndex}>05 · Choose the proof</div>
            <h2 id="proof-path-title" className={styles.sectionTitle}>Experience the collaboration, then inspect the physics behind it.</h2>
          </header>
          <div className={styles.forkGrid}>
            <article className={styles.fork}>
              <div className={styles.forkLabel}>Runtime · HX + AX</div><h3 className={styles.forkTitle}>Experience the SOC Runtime</h3>
              <p className={styles.forkText}>Watch an analyst and agent share one workspace, continue across interactive and autonomous work, and return consequential actions through the same governance boundary.</p>
              <Button appearance="primary" className={styles.button} onClick={() => openBundle("live-workspace-soc")}>Open Live Workspace</Button>
            </article>
            <article className={styles.fork}>
              <div className={styles.forkLabel}>DX + ACX · Powered by the GIK Compiler</div><h3 className={styles.forkTitle}>Author Governed Experiences</h3>
              <p className={styles.forkText}>See humans and AI coding agents define governed domains as bounded, testable blueprints: intent to tiers to a runnable bundle.</p>
              <Button appearance="secondary" className={styles.button} onClick={() => openBundle("console")}>Open Authoring Console</Button>
            </article>
          </div>
        </div>
      </section>

      <footer className={styles.expansion}>
        <div className={styles.inner}><p className={styles.expansionText}>SOC is the first high-stakes domain. The same governed substrate extends to document-heavy, policy-bound work and from interactive surfaces to headless execution.</p></div>
      </footer>
    </main>
  );
};

const projectionViews: Record<string, ProjectionView> = { samplesOverview: SamplesOverviewView };

export default projectionViews;