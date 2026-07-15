import React from "react";
import { Button, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  ArrowReset24Regular,
  BrainCircuit24Regular,
  CheckmarkCircle20Regular,
  ChevronRight20Regular,
  Clock20Regular,
  Eye20Regular,
  PeopleTeam24Regular,
  Play24Filled,
  ShieldLock24Regular,
} from "@fluentui/react-icons";
import { useCountdownTimer, type ProjectionView } from "@gik/react";

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  target: string;
}

interface Actor {
  id: string;
  name: string;
  role: string;
  status: string;
  activity: string;
  authority?: string;
}

interface Evidence {
  id: string;
  sourceActorId: string;
  kind: string;
  summary: string;
  confidence: number;
  time: string;
}

interface Hypothesis {
  statement: string;
  confidence: number;
}

interface Proposal {
  id: string;
  actorId: string;
  action: string;
  target: string;
  authorityResult: string;
  reason: string;
  fallback?: string;
  approvedBy?: string;
}

interface LedgerEntry {
  time: string;
  actorId: string;
  result: string;
  summary: string;
}

const GUIDED_STEP_MS = 3000;

const useStyles = makeStyles({
  workspace: {
    minHeight: "100vh",
    minWidth: 0,
    overflowX: "clip",
    backgroundColor: "var(--bg)",
    color: "var(--text)",
  },
  commandBar: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: tokens.spacingHorizontalL,
    padding: `${tokens.spacingVerticalM} clamp(16px, 4vw, 52px)`,
    borderBottom: `${tokens.strokeWidthThin} solid var(--line)`,
    backgroundColor: "var(--panel)",
    position: "sticky",
    top: 0,
    zIndex: 5,
    "@media (max-width: 720px)": { position: "relative", gridTemplateColumns: "1fr", alignItems: "start" },
  },
  commandIdentity: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, minWidth: 0 },
  backButton: { flexShrink: 0 },
  incidentText: { minWidth: 0 },
  eyebrow: {
    color: "var(--muted)",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0",
  },
  incidentTitle: {
    margin: `${tokens.spacingVerticalXXS} 0 0`,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    fontWeight: tokens.fontWeightSemibold,
    overflowWrap: "anywhere",
  },
  commandMeta: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  advanceMode: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    padding: "2px",
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "var(--panel-2)",
  },
  guide: {
    position: "sticky",
    top: "79px",
    zIndex: 4,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: tokens.spacingHorizontalL,
    alignItems: "center",
    padding: `${tokens.spacingVerticalM} clamp(16px, 4vw, 52px)`,
    borderBottom: `${tokens.strokeWidthThin} solid var(--line)`,
    backgroundColor: "var(--panel-2)",
    "@media (max-width: 720px)": { top: 0, gridTemplateColumns: "1fr", gap: tokens.spacingHorizontalS },
  },
  guideCopy: { minWidth: 0 },
  guideKicker: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, color: "var(--accent)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  guideLiveDot: { width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "var(--accent)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)" },
  guideTitle: { margin: `${tokens.spacingVerticalXXS} 0`, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  guideText: { margin: 0, color: "var(--muted)", lineHeight: tokens.lineHeightBase200 },
  guideTarget: { color: "var(--text)", fontWeight: tokens.fontWeightSemibold },
  guideSteps: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, flexWrap: "wrap" },
  guideStep: {
    width: "28px",
    height: "28px",
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    border: `${tokens.strokeWidthThin} solid var(--line)`,
    color: "var(--muted)",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightBold,
  },
  guideStepDone: { backgroundColor: "var(--accent)", color: "var(--bg)", ...shorthands.borderColor("var(--accent)") },
  guideStepCurrent: { color: "var(--accent)", ...shorthands.borderColor("var(--accent)"), outline: "2px solid var(--accent)", outlineOffset: "1px" },
  guideProgressTrack: { gridColumn: "1 / -1", height: "3px", overflow: "hidden", backgroundColor: "var(--line)" },
  guideProgress: { width: "100%", height: "100%", transformOrigin: "left", backgroundColor: "var(--accent)", transform: "scaleX(0)" },
  guidePaused: { width: "100%", height: "100%", backgroundColor: "var(--accent)" },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    minHeight: "30px",
    padding: `0 ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid var(--line)`,
    backgroundColor: "var(--panel-2)",
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  modePill: { color: "var(--accent)", ...shorthands.borderColor("var(--accent)") },
  body: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
    gap: tokens.spacingHorizontalXL,
    width: "min(1500px, 100%)",
    margin: "0 auto",
    padding: `clamp(20px, 4vw, 48px) clamp(16px, 4vw, 52px)`,
    boxSizing: "border-box",
    "@media (max-width: 960px)": { gridTemplateColumns: "1fr" },
  },
  main: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalXL },
  rail: { minWidth: 0, display: "grid", alignContent: "start", gap: tokens.spacingVerticalL },
  sectionHeading: { margin: 0, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  sectionSubhead: { margin: `${tokens.spacingVerticalXS} 0 0`, color: "var(--muted)" },
  hypothesis: {
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderLeftWidth: "4px",
    borderLeftColor: "var(--accent)",
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
    backgroundColor: "var(--panel)",
  },
  hypothesisHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM },
  hypothesisLabel: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, fontWeight: tokens.fontWeightSemibold },
  confidence: { color: "var(--accent)", fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightBold },
  hypothesisText: { margin: `${tokens.spacingVerticalM} 0 0`, fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500 },
  evidenceGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: tokens.spacingHorizontalM },
  evidenceCard: {
    minWidth: 0,
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    backgroundColor: "var(--panel)",
  },
  evidenceMeta: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS, color: "var(--muted)", fontSize: tokens.fontSizeBase100 },
  evidenceKind: { color: "var(--text)", fontWeight: tokens.fontWeightSemibold },
  evidenceText: { margin: `${tokens.spacingVerticalM} 0`, lineHeight: tokens.lineHeightBase300 },
  evidenceFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS, fontSize: tokens.fontSizeBase200 },
  actorAttribution: { color: "var(--accent)", fontWeight: tokens.fontWeightSemibold },
  response: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: tokens.spacingHorizontalL,
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
    backgroundColor: "var(--panel-2)",
    "@media (max-width: 620px)": { gridTemplateColumns: "1fr" },
  },
  responseTitle: { margin: 0, fontSize: tokens.fontSizeBase400 },
  responseText: { margin: `${tokens.spacingVerticalXS} 0 0`, color: "var(--muted)" },
  proposal: {
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderLeftWidth: "4px",
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
    backgroundColor: "var(--panel)",
  },
  proposalRejected: { borderLeftColor: "var(--bad)" },
  proposalPending: { borderLeftColor: "var(--accent)" },
  proposalExecuted: { borderLeftColor: "var(--good)" },
  proposalTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM, flexWrap: "wrap" },
  proposalResult: { fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase", color: "var(--accent)" },
  rejectedResult: { color: "var(--bad)" },
  proposalTitle: { margin: `${tokens.spacingVerticalS} 0`, fontSize: tokens.fontSizeBase400 },
  proposalReason: { margin: 0, color: "var(--muted)", lineHeight: tokens.lineHeightBase300 },
  fallback: { marginTop: tokens.spacingVerticalM, padding: tokens.spacingVerticalS, backgroundColor: "var(--panel-2)", borderRadius: tokens.borderRadiusMedium },
  panel: {
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "var(--panel)",
    overflow: "hidden",
  },
  panelHeader: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, padding: tokens.spacingVerticalM, borderBottom: `${tokens.strokeWidthThin} solid var(--line)`, fontWeight: tokens.fontWeightSemibold },
  actorList: { display: "grid" },
  actor: { display: "grid", gridTemplateColumns: "36px minmax(0, 1fr)", gap: tokens.spacingHorizontalS, padding: tokens.spacingVerticalM, borderBottom: `${tokens.strokeWidthThin} solid var(--line)` },
  avatar: { width: "36px", height: "36px", display: "grid", placeItems: "center", borderRadius: "50%", backgroundColor: "var(--panel-2)", color: "var(--accent)", fontWeight: tokens.fontWeightBold },
  actorTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalXS },
  actorName: { fontWeight: tokens.fontWeightSemibold },
  actorRole: { color: "var(--muted)", fontSize: tokens.fontSizeBase100 },
  actorActivity: { marginTop: tokens.spacingVerticalXS, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
  authority: { marginTop: tokens.spacingVerticalXS, color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
  status: { display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalXXS, color: "var(--accent)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold },
  pulse: { width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "currentColor" },
  receipt: { margin: tokens.spacingVerticalM, padding: tokens.spacingVerticalM, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel-2)" },
  receiptTop: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, color: "var(--accent)", fontWeight: tokens.fontWeightSemibold },
  receiptText: { margin: `${tokens.spacingVerticalS} 0 0`, color: "var(--muted)", lineHeight: tokens.lineHeightBase200 },
  panelAction: { width: "100%", justifyContent: "space-between", borderRadius: 0 },
  detail: { padding: tokens.spacingVerticalM, borderTop: `${tokens.strokeWidthThin} solid var(--line)`, backgroundColor: "var(--panel-2)" },
  ledger: { display: "grid", gap: tokens.spacingVerticalS },
  ledgerRow: { display: "grid", gridTemplateColumns: "58px minmax(0, 1fr)", gap: tokens.spacingHorizontalS, fontSize: tokens.fontSizeBase100 },
  ledgerTime: { color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace },
  ledgerResult: { fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  ledgerSummary: { marginTop: tokens.spacingVerticalXXS, color: "var(--muted)" },
  agentEye: { margin: 0, maxHeight: "320px", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
  empty: { padding: tokens.spacingVerticalXL, border: `${tokens.strokeWidthThin} dashed var(--line)`, borderRadius: tokens.borderRadiusMedium, color: "var(--muted)", textAlign: "center" },
  spotlight: {
    position: "relative",
    outline: "2px solid var(--accent)",
    outlineOffset: "3px",
    boxShadow: "0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent)",
  },
  spotlightLabel: {
    position: "absolute",
    top: "-12px",
    right: tokens.spacingHorizontalM,
    zIndex: 2,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "var(--accent)",
    color: "var(--bg)",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightBold,
    textTransform: "uppercase",
    boxShadow: tokens.shadow8,
  },
});

function openOverview() {
  const url = new URL(window.location.href);
  url.searchParams.set("bundle", "samples-overview");
  window.location.href = url.toString();
}

const LiveWorkspaceSoc: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const incident = node.props.incident as unknown as Incident;
  const actors = (node.props.actors ?? []) as unknown as Actor[];
  const evidence = (node.props.evidence ?? []) as unknown as Evidence[];
  const hypothesis = node.props.hypothesis as unknown as Hypothesis;
  const mode = String(node.props.mode ?? "Collaborative");
  const stage = String(node.props.stage ?? "Investigate");
  const act = Number(node.props.act ?? 1);
  const proposal = (node.props.proposal ?? null) as unknown as Proposal | null;
  const ledger = (node.props.ledger ?? []) as unknown as LedgerEntry[];
  const [showLedger, setShowLedger] = React.useState(false);
  const [showAgentEye, setShowAgentEye] = React.useState(false);
  const [autoPlay, setAutoPlay] = React.useState(false);
  const actorsRef = React.useRef<HTMLElement | null>(null);
  const evidenceRef = React.useRef<HTMLElement | null>(null);
  const proposalRef = React.useRef<HTMLElement | null>(null);
  const responseRef = React.useRef<HTMLElement | null>(null);
  const emitRef = React.useRef(emit);
  emitRef.current = emit;
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));

  const guide = React.useMemo(() => {
    if (act === 1) return { title: "Ready to assemble the team", text: "Four bounded agents are waiting to join the same incident state.", target: "Watch Agent team", focus: "actors" };
    if (act === 2) return { title: "Agents investigated in parallel", text: "Identity, Endpoint, and Triage contributed attributed evidence; confidence rose from 32% to 91%.", target: "Watch Evidence + Agent team", focus: "evidence" };
    if (act === 3) return { title: "Governance blocked unsafe overreach", text: "Response proposed isolating DC-01. Policy rejected it and applied a safe fallback without losing the proposal.", target: "Watch Governed proposal", focus: "proposal" };
    if (act === 4) return { title: "Agents continued beyond the screen", text: "The mode changed to Autonomous while the same evidence, actors, authority, and trace continued evolving.", target: "Watch mode + new evidence", focus: "evidence" };
    if (proposal?.authorityResult === "confirmation-required") return { title: "Guided tour paused for the human", text: "The agents returned an evidence-backed Host-A proposal. Automation stops here because only the analyst can authorize containment.", target: "Your action: Approve Host-A isolation", focus: "response" };
    return { title: "Containment completed under authority", text: "The analyst approved the bounded action; Host-A changed to Contained and the decision remains attributable.", target: "Watch final response receipt", focus: "response" };
  }, [act, proposal?.authorityResult]);

  const nextAction = React.useMemo(() => {
    if (act === 1) return { label: "Assemble agent team", event: "parallel", actorId: "agent-triage" };
    if (act === 2) return { label: "Test containment boundary", event: "overreach", actorId: "agent-response" };
    if (act === 3) return { label: "Continue autonomously", event: "autonomous", actorId: "analyst-morgan" };
    if (act === 4) return { label: "Return governed findings", event: "requestContainment", actorId: "agent-response" };
    if (proposal?.authorityResult === "confirmation-required") return { label: "Approve Host-A isolation", event: "approve", actorId: "analyst-morgan" };
    return null;
  }, [act, proposal?.authorityResult]);

  const autoTimer = useCountdownTimer({
    durationMs: GUIDED_STEP_MS,
    running: autoPlay && !!nextAction && nextAction.event !== "approve",
    resetKey: nextAction ? `${nextAction.event}:${nextAction.actorId}` : "none",
    onElapsed: () => {
      if (nextAction && nextAction.event !== "approve") {
        emitRef.current(nextAction.event, {}, nextAction.actorId);
      }
    },
  });

  React.useEffect(() => {
    if (autoPlay && (!nextAction || nextAction.event === "approve")) setAutoPlay(false);
  }, [autoPlay, nextAction]);

  React.useEffect(() => {
    if (!autoPlay && act === 1) return;
    const target = guide.focus === "actors" ? actorsRef.current : guide.focus === "evidence" ? evidenceRef.current : guide.focus === "proposal" ? proposalRef.current : responseRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    const spotlightAnimation = target?.animate(
      [
        { transform: "scale(1)", filter: "brightness(1)" },
        { transform: "scale(1.012)", filter: "brightness(1.08)", offset: 0.45 },
        { transform: "scale(1)", filter: "brightness(1)" },
      ],
      { duration: 900, easing: "ease-out" }
    );
    return () => spotlightAnimation?.cancel();
  }, [act, guide.focus]);

  const reset = () => {
    setAutoPlay(false);
    setShowLedger(false);
    setShowAgentEye(false);
    emit("reset", {}, "analyst-morgan");
  };

  const spotlightClass = (focus: string) =>
    guide.focus === focus
      ? styles.spotlight
      : undefined;

  return (
    <main className={styles.workspace}>
      <header className={styles.commandBar}>
        <div className={styles.commandIdentity}>
          <Button className={styles.backButton} appearance="subtle" icon={<ArrowLeft24Regular />} aria-label="Return to overview" onClick={openOverview} />
          <div className={styles.incidentText}>
            <div className={styles.eyebrow}>{incident.id} · Live Workspace : SOC</div>
            <h1 className={styles.incidentTitle}>{incident.title}</h1>
          </div>
        </div>
        <div className={styles.commandMeta}>
          <span className={styles.pill}><ShieldLock24Regular />{incident.severity} · {incident.status}</span>
          <span className={`${styles.pill} ${styles.modePill}`}><PeopleTeam24Regular />{mode}</span>
          <Button appearance="subtle" icon={<ArrowReset24Regular />} aria-label="Reset scenario" onClick={reset} />
          <div className={styles.advanceMode} role="group" aria-label="Tour advance mode">
            <Button appearance={autoPlay ? "subtle" : "primary"} aria-pressed={!autoPlay} onClick={() => setAutoPlay(false)}>Manual next</Button>
            <Button appearance={autoPlay ? "primary" : "subtle"} aria-pressed={autoPlay} icon={<Play24Filled />} disabled={!nextAction || nextAction.event === "approve"} onClick={() => setAutoPlay(true)}>Auto next{autoPlay ? ` · ${autoTimer.remainingSeconds}` : ""}</Button>
          </div>
          {!autoPlay && nextAction ? <Button appearance="primary" icon={<ChevronRight20Regular />} onClick={() => emit(nextAction.event, {}, nextAction.actorId)}>{nextAction.event === "approve" ? nextAction.label : `Next · ${nextAction.label}`}</Button> : null}
        </div>
      </header>

      <section className={styles.guide} aria-live="polite" aria-label="Guided tour">
        <div className={styles.guideCopy}>
          <div className={styles.guideKicker}>{autoPlay ? <span className={styles.guideLiveDot} /> : null}{proposal?.authorityResult === "confirmation-required" ? "Paused at human boundary" : autoPlay ? "Auto next · follow the highlight" : nextAction ? `Manual next · Act ${Math.min(act, 5)} of 5` : "Tour complete"}</div>
          <h2 className={styles.guideTitle}>{guide.title}</h2>
          <p className={styles.guideText}>{guide.text} <span className={styles.guideTarget}>{guide.target}.</span></p>
        </div>
        <div className={styles.guideSteps} aria-label={`Act ${Math.min(act, 5)} of 5`}>
          {[1, 2, 3, 4, 5].map((step) => <span key={step} className={`${styles.guideStep} ${step < act || proposal?.authorityResult === "executed" ? styles.guideStepDone : step === act ? styles.guideStepCurrent : ""}`}>{step < act || proposal?.authorityResult === "executed" ? "✓" : step}</span>)}
        </div>
        <div className={styles.guideProgressTrack} aria-hidden="true">
          <div className={proposal?.authorityResult === "confirmation-required" ? styles.guidePaused : styles.guideProgress} style={proposal?.authorityResult === "confirmation-required" ? undefined : { transform: `scaleX(${Math.min(act, 5) / 5})` }} />
        </div>
      </section>

      <div className={styles.body}>
        <section className={styles.main} aria-label="Shared investigation">
          <header>
            <div className={styles.eyebrow}>Current act · {stage}</div>
            <h2 className={styles.sectionHeading}>Shared investigation</h2>
            <p className={styles.sectionSubhead}>Four specialists are building one evidence-backed understanding of the incident.</p>
          </header>

          <article className={styles.hypothesis}>
            <div className={styles.hypothesisHeader}>
              <div className={styles.hypothesisLabel}><BrainCircuit24Regular />Working hypothesis</div>
              <div className={styles.confidence}>{hypothesis.confidence}%</div>
            </div>
            <p className={styles.hypothesisText}>{hypothesis.statement}</p>
          </article>

          <section ref={evidenceRef} className={spotlightClass("evidence")} aria-labelledby="evidence-heading">
            {guide.focus === "evidence" ? <span className={styles.spotlightLabel}>Watch here</span> : null}
            <h2 id="evidence-heading" className={styles.sectionHeading}>Evidence converging now</h2>
            <p className={styles.sectionSubhead}>Each contribution is attributed to the agent that produced it.</p>
            <div className={styles.evidenceGrid}>
              {evidence.length === 0 ? <div className={styles.empty}>Agents are ready. Assemble the team to begin parallel investigation.</div> : evidence.map((item) => (
                <article className={styles.evidenceCard} key={item.id}>
                  <div className={styles.evidenceMeta}><span className={styles.evidenceKind}>{item.kind}</span><span>{item.time}</span></div>
                  <p className={styles.evidenceText}>{item.summary}</p>
                  <div className={styles.evidenceFooter}><span className={styles.actorAttribution}>{actorNames.get(item.sourceActorId)}</span><span>{item.confidence}% confidence</span></div>
                </article>
              ))}
            </div>
          </section>

          {proposal ? (
            <section ref={proposalRef} className={mergeClasses(styles.proposal, proposal.authorityResult === "rejected+fallback" ? styles.proposalRejected : proposal.authorityResult === "executed" ? styles.proposalExecuted : styles.proposalPending, spotlightClass("proposal"))} aria-label="Governed proposal">
              {guide.focus === "proposal" ? <span className={styles.spotlightLabel}>Watch here</span> : null}
              <div className={styles.proposalTop}>
                <span className={styles.actorAttribution}>{actorNames.get(proposal.actorId) ?? proposal.actorId}</span>
                <span className={`${styles.proposalResult} ${proposal.authorityResult === "rejected+fallback" ? styles.rejectedResult : ""}`}>{proposal.authorityResult}</span>
              </div>
              <h2 className={styles.proposalTitle}>{proposal.action}</h2>
              <p className={styles.proposalReason}>{proposal.reason}</p>
              {proposal.fallback ? <div className={styles.fallback}><strong>Safe fallback applied:</strong> {proposal.fallback}</div> : null}
              {proposal.authorityResult === "executed" ? <div className={styles.fallback}><strong>Approved by:</strong> {proposal.approvedBy}</div> : null}
            </section>
          ) : null}

          <section ref={responseRef} className={mergeClasses(styles.response, spotlightClass("response"))} aria-label="Response plan">
            {guide.focus === "response" ? <span className={styles.spotlightLabel}>{proposal?.authorityResult === "confirmation-required" ? "Your action" : "Watch here"}</span> : null}
            <div>
              <h2 className={styles.responseTitle}>{proposal?.authorityResult === "executed" ? `${incident.target} is contained` : proposal?.authorityResult === "confirmation-required" ? "Response requires your confirmation" : "Response is holding for sufficient evidence"}</h2>
              <p className={styles.responseText}>{proposal?.authorityResult === "executed" ? "The governed action completed and remains fully attributable." : "No containment action can execute without policy validation and the analyst's confirmation."}</p>
            </div>
            <Button appearance={proposal?.authorityResult === "confirmation-required" ? "primary" : "secondary"} icon={<ShieldLock24Regular />} disabled={proposal?.authorityResult !== "confirmation-required"} onClick={() => emit("approve", {}, "analyst-morgan")}>Isolate {incident.target}</Button>
          </section>
        </section>

        <aside className={styles.rail} aria-label="Agent team and governance">
          <section ref={actorsRef} className={mergeClasses(styles.panel, spotlightClass("actors"))}>
            {guide.focus === "actors" ? <span className={styles.spotlightLabel}>Watch here</span> : null}
            <div className={styles.panelHeader}><PeopleTeam24Regular />Agent team · {actors.filter((actor) => actor.status === "working").length} active</div>
            <div className={styles.actorList}>
              {actors.map((actor) => (
                <article className={styles.actor} key={actor.id}>
                  <div className={styles.avatar}>{actor.name.slice(0, 1)}</div>
                  <div>
                    <div className={styles.actorTop}><span className={styles.actorName}>{actor.name}</span><span className={styles.status}><i className={styles.pulse} />{actor.status}</span></div>
                    <div className={styles.actorRole}>{actor.role}</div>
                    <div className={styles.actorActivity}>{actor.activity}</div>
                    <div className={styles.authority}>authority · {actor.authority ?? "bounded"}</div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><ShieldLock24Regular />Authority active</div>
            <div className={styles.receipt}>
              <div className={styles.receiptTop}><CheckmarkCircle20Regular />{ledger.length} governed events</div>
              <p className={styles.receiptText}>Every contribution and authority decision remains attributable in one ledger.</p>
            </div>
            <Button className={styles.panelAction} appearance="subtle" icon={<Clock20Regular />} iconPosition="before" onClick={() => setShowLedger((value) => !value)}>Forensic ledger <ChevronRight20Regular /></Button>
            {showLedger ? <div className={`${styles.detail} ${styles.ledger}`}>{ledger.map((entry, index) => <div className={styles.ledgerRow} key={`${entry.time}-${index}`}><span className={styles.ledgerTime}>{entry.time}</span><div><div className={styles.ledgerResult}>{entry.result} · {actorNames.get(entry.actorId) ?? entry.actorId}</div><div className={styles.ledgerSummary}>{entry.summary}</div></div></div>)}</div> : null}
            <Button className={styles.panelAction} appearance="subtle" icon={<Eye20Regular />} iconPosition="before" onClick={() => setShowAgentEye((value) => !value)}>Agent's-eye view <ChevronRight20Regular /></Button>
            {showAgentEye ? <div className={styles.detail}><pre className={styles.agentEye}>{JSON.stringify({ mode, actors: actors.map(({ id, status, authority }) => ({ id, status, authority })), entities: [incident.target, "DC-01"], proposal, trace: ledger }, null, 2)}</pre></div> : null}
          </section>
        </aside>
      </div>
    </main>
  );
};

export default { workspace: LiveWorkspaceSoc };
