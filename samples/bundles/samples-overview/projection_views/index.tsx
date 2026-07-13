import React from "react";
import { Button, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";

const useStyles = makeStyles({
  page: { display: "grid", gap: tokens.spacingVerticalXL, color: "var(--text)" },
  hero: {
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundImage: `radial-gradient(circle at top left, ${tokens.colorBrandBackground2} 0%, ${tokens.colorNeutralBackground3} 48%, ${tokens.colorNeutralBackground4} 100%)`,
    ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke2),
    boxShadow: tokens.shadow16,
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.8fr) minmax(260px, 1fr)",
    gap: tokens.spacingHorizontalL,
    alignItems: "start",
  },
  eyebrow: {
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightBold,
    color: "var(--accent)",
    marginBottom: tokens.spacingVerticalS,
  },
  heroTitle: {
    margin: `0 0 ${tokens.spacingVerticalS}`,
    fontSize: tokens.fontSizeHero800,
    lineHeight: 1.08,
    maxWidth: "720px",
  },
  lead: {
    margin: 0,
    lineHeight: 1.65,
    fontSize: tokens.fontSizeBase300,
    maxWidth: "760px",
  },
  sublead: {
    margin: `${tokens.spacingVerticalM} 0 0`,
    lineHeight: 1.62,
    color: "var(--muted)",
  },
  ctaRow: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalL },
  button: {
    borderRadius: tokens.borderRadiusCircular,
    fontWeight: tokens.fontWeightSemibold,
    boxShadow: tokens.shadow4,
  },
  statsColumn: { display: "grid", gap: tokens.spacingVerticalS },
  statCard: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusLarge,
    ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  statValue: { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightBold, lineHeight: 1.15 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: tokens.spacingHorizontalL,
  },
  card: {
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusXLarge,
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    backgroundImage: `linear-gradient(180deg, ${tokens.colorNeutralBackground1} 0%, ${tokens.colorNeutralBackground2} 100%)`,
    boxShadow: tokens.shadow8,
  },
  section: {
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
    borderRadius: tokens.borderRadiusXLarge,
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    backgroundColor: "var(--panel)",
    boxShadow: tokens.shadow8,
  },
  sectionTitle: { marginTop: 0, marginBottom: tokens.spacingVerticalM, fontSize: tokens.fontSizeBase400 },
  code: {
    margin: 0,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackgroundInverted,
    color: tokens.colorNeutralForegroundInverted,
    whiteSpace: "pre-wrap",
    fontSize: tokens.fontSizeBase200,
    lineHeight: 1.45,
    ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStrokeOnBrand2),
  },
  stepTitle: { margin: `0 0 ${tokens.spacingVerticalXS}` },
  bodyText: { margin: 0, lineHeight: 1.5 },
  laneGrid: { display: "grid", gap: tokens.spacingVerticalM },
  lane: {
    display: "grid",
    gridTemplateColumns: "180px minmax(0, 1fr)",
    gap: tokens.spacingHorizontalL,
    alignItems: "start",
  },
  laneLabel: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorBrandStroke1),
    color: tokens.colorBrandForeground2,
    fontWeight: tokens.fontWeightSemibold,
  },
  laneCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: tokens.spacingHorizontalM,
  },
  flowCard: { minHeight: "116px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: tokens.fontSizeBase200 },
  cell: {
    borderTopWidth: tokens.strokeWidthThin,
    borderTopStyle: "solid",
    borderTopColor: "var(--line)",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalS}`,
    textAlign: "left",
    verticalAlign: "top",
  },
  pill: {
    display: "inline-block",
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalS,
  },
  strongParagraph: { margin: `0 0 ${tokens.spacingVerticalXS}`, lineHeight: 1.5 },
});

const customerScript = `GenUI is a declarative interaction platform, and this sample set is the quickest way to understand its product surface.
Start in the browser host: it mounts authored bundles and lets you move between focused experiences without changing infrastructure.

Console is the operational view for profile governance: inspect profiles, validate them, preview them, and manage editable local copies beside read-only repo examples.

Reactive Demo is the narrow proof that declarative state stays inspectable: you can see both the computed results and the dependency graph that produced them.

Provider Authoring Demo shows the planning layer: consequence graphs, exploratory graphs, and step orchestration combined into a higher-level authoring workflow.

Workbench is the studio view: shape an interaction, build a live session, inspect the lowered output, and iterate across the same runtime.

Outside the browser, the other sample hosts show the remaining adoption boundaries: authoring tools only, one live runtime exposed to external clients, or direct kernel embedding inside backend services.`;

const bundleLinks = [
  { id: "samples-overview", label: "Stay On Overview" },
  { id: "console", label: "Open Console" },
  { id: "reactive-demo", label: "Open Reactive Demo" },
  { id: "provider-authoring-demo", label: "Open Provider Authoring Demo" },
  { id: "workbench", label: "Open Workbench" },
];

const browserBundles = [
  {
    name: "Console",
    promise: "Profile governance and lifecycle",
    summary: "Operational surface for inspecting profiles, validating them, previewing them, and managing browser-stored editable copies.",
  },
  {
    name: "Reactive Demo",
    promise: "Reactive state and graph explanation",
    summary: "Explains how declarative computed state behaves by showing both derived values and the graph behind them.",
  },
  {
    name: "Provider Authoring Demo",
    promise: "Assisted profile authoring",
    summary: "Shows how planning signals can be composed into a guided profile-and-recipe authoring experience.",
  },
  {
    name: "Workbench",
    promise: "Integrated studio",
    summary: "The richest end-to-end sample: shape the interaction, run the session, and inspect the generated output in one place.",
  },
];

const browserLane = [
  {
    name: "Samples Overview",
    emphasis: "Orientation",
    summary: "Start here for the product brief, adoption map, and recommended entry points.",
  },
  {
    name: "Console",
    emphasis: "Operate",
    summary: "Manage the profile lifecycle: inspect, validate, preview, and store local copies.",
  },
  {
    name: "Reactive Demo",
    emphasis: "Explain",
    summary: "See how declarative state derives results and how its dependency graph stays inspectable.",
  },
  {
    name: "Provider Authoring Demo",
    emphasis: "Plan",
    summary: "Use graph-driven signals to assemble an authoring workflow around profiles and recipes.",
  },
  {
    name: "Workbench",
    emphasis: "Build",
    summary: "Work inside the studio-style flow: shape the interaction, run it, and inspect the output.",
  },
];

const outwardLane = [
  {
    name: "agent-host",
    emphasis: "Tools only",
    summary: "Expose authoring and validation tools over MCP without a live runtime in the middle.",
  },
  {
    name: "control-host",
    emphasis: "Live runtime",
    summary: "Expose one running system outward through SSE render stream and MCP projections.",
  },
  {
    name: "backend-host",
    emphasis: "Embed",
    summary: "Drop the kernel directly into service code when UI hosting is not the concern.",
  },
];

const hostShapes = [
  {
    name: "apps/host",
    when: "You need a browser renderer/container for bundles.",
    value: "One generic host that can run many browser sample bundles by id.",
  },
  {
    name: "agent-host",
    when: "You want authoring and validation tools only.",
    value: "Stateless MCP surface with no live kernel runtime.",
  },
  {
    name: "control-host",
    when: "You want one authoritative runtime exposed outward.",
    value: "One live runtime surfaced as SSE render stream plus agent/control MCP projections.",
  },
  {
    name: "backend-host",
    when: "You want kernel infrastructure inside service code.",
    value: "Direct kernel embedding with backend orchestration and no browser shell.",
  },
];

const personas = [
  {
    who: "Frontend / product engineer",
    start: "Start with Samples Overview, then Console, then Workbench.",
    reason: "This gives you the orientation first, then the operational view, then the richer studio-style experience.",
  },
  {
    who: "Profile / recipe author",
    start: "Start with Console, then Provider Authoring Demo.",
    reason: "You see both the profile lifecycle and the higher-level planning seams around authoring decisions.",
  },
  {
    who: "Platform / runtime engineer",
    start: "Start with control-host, then backend-host.",
    reason: "Those samples show live runtime hosting versus direct kernel embedding.",
  },
  {
    who: "Copilot / agent integrator",
    start: "Start with agent-host, then Provider Authoring Demo.",
    reason: "You can separate authoring-tool exposure from any live runtime concerns.",
  },
];

function openBundle(bundleId: string) {
  const current = new URL(window.location.href);
  current.searchParams.set("bundle", bundleId);
  window.location.assign(current.toString());
}

const SamplesOverviewView: ProjectionView = () => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div>
            <div className={styles.eyebrow}>GenUI Sample Portfolio</div>
            <h2 className={styles.heroTitle}>
              Declarative interaction, shown as a product surface instead of a code dump.
            </h2>
            <p className={styles.lead}>
              GenUI is easiest to understand when you see the same platform at a few deliberate boundaries:
              browser rendering, profile operations, authoring guidance, live runtime hosting, and direct backend embedding.
            </p>
            <p className={styles.sublead}>
              Use this page when the right question is not “how is the repo wired?” but “what would I show an
              external product engineer in the first five minutes?”
            </p>
            <div className={styles.ctaRow}>
              <Button appearance="primary" className={styles.button} onClick={() => openBundle("samples-overview")}>
                Start Here: Product Overview
              </Button>
              <Button appearance="secondary" className={styles.button} onClick={() => openBundle("console")}>
                First Hands-On Stop: Console
              </Button>
              <Button appearance="secondary" className={styles.button} onClick={() => openBundle("workbench")}>
                Deep Dive: Workbench
              </Button>
              <Button appearance="secondary" className={styles.button} onClick={() => openBundle("provider-authoring-demo")}>
                Authoring Story
              </Button>
              <Button appearance="secondary" className={styles.button} onClick={() => openBundle("reactive-demo")}>
                Reactive State Story
              </Button>
            </div>
          </div>
          <div className={styles.statsColumn}>
            <div className={styles.statCard}>
              <div className={styles.eyebrow}>Browser samples</div>
              <div className={styles.statValue}>5</div>
              <div>Overview, Console, Reactive Demo, Provider Authoring Demo, Workbench</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.eyebrow}>Other host shapes</div>
              <div className={styles.statValue}>3</div>
              <div>Agent-only, live runtime host, and backend embedding</div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>1. 60-second customer script</h3>
        <pre className={styles.code}>{customerScript}</pre>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Suggested walkthrough</h3>
        <div className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.pill}>Step 1</div>
            <h4 className={styles.stepTitle}>Frame the product</h4>
            <p className={styles.bodyText}>
              Stay on this overview page to explain the platform boundary story before jumping into any specific sample.
            </p>
          </article>
          <article className={styles.card}>
            <div className={styles.pill}>Step 2</div>
            <h4 className={styles.stepTitle}>Show the operational surface</h4>
            <p className={styles.bodyText}>
              Open Console to show profile governance, validation, preview, and local editable copies.
            </p>
          </article>
          <article className={styles.card}>
            <div className={styles.pill}>Step 3</div>
            <h4 className={styles.stepTitle}>Choose the deeper proof</h4>
            <p className={styles.bodyText}>
              Use Workbench for the studio story, Provider Authoring Demo for planning, or Reactive Demo for inspectable derived state.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>2. How the samples fit together</h3>
        <div className={styles.laneGrid}>
          <div className={styles.lane}>
            <div className={styles.laneLabel}>Browser host lane</div>
            <div className={styles.laneCards}>
              {browserLane.map((item) => (
                <article key={item.name} className={mergeClasses(styles.card, styles.flowCard)}>
                  <div className={styles.pill}>{item.emphasis}</div>
                  <h4 className={styles.stepTitle}>{item.name}</h4>
                  <p className={styles.bodyText}>{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
          <div className={styles.lane}>
            <div className={styles.laneLabel}>Outward host lane</div>
            <div className={styles.laneCards}>
              {outwardLane.map((item) => (
                <article key={item.name} className={mergeClasses(styles.card, styles.flowCard)}>
                  <div className={styles.pill}>{item.emphasis}</div>
                  <h4 className={styles.stepTitle}>{item.name}</h4>
                  <p className={styles.bodyText}>{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Browser bundles</h3>
        <div className={styles.grid}>
          {browserBundles.map((bundle) => (
            <article key={bundle.name} className={styles.card}>
              <div className={styles.pill}>{bundle.promise}</div>
              <h4 className={styles.stepTitle}>{bundle.name}</h4>
              <p className={styles.bodyText}>{bundle.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Sample host shapes</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.cell}>Host</th>
              <th className={styles.cell}>Choose it when</th>
              <th className={styles.cell}>What it demonstrates</th>
            </tr>
          </thead>
          <tbody>
            {hostShapes.map((row) => (
              <tr key={row.name}>
                <td className={styles.cell}><strong>{row.name}</strong></td>
                <td className={styles.cell}>{row.when}</td>
                <td className={styles.cell}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>3. Where a developer should start</h3>
        <div className={styles.grid}>
          {personas.map((persona) => (
            <article key={persona.who} className={styles.card}>
              <h4 className={styles.stepTitle}>{persona.who}</h4>
              <p className={styles.strongParagraph}><strong>Start with:</strong> {persona.start}</p>
              <p className={styles.bodyText}>{persona.reason}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

const projectionViews: Record<string, ProjectionView> = {
  samplesOverview: SamplesOverviewView,
};

export default projectionViews;