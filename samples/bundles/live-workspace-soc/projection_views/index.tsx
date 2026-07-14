import React from "react";
import { Button, makeStyles, shorthands, tokens } from "@fluentui/react-components";
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
  Stop24Filled,
} from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";

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

const useStyles = makeStyles({
  workspace: {
    minHeight: "100vh",
    minWidth: 0,
    overflowX: "hidden",
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
    "@media (max-width: 720px)": { gridTemplateColumns: "1fr", alignItems: "start" },
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
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));

  const nextAction = React.useMemo(() => {
    if (act === 1) return { label: "Assemble agent team", event: "parallel", actorId: "agent-triage" };
    if (act === 2) return { label: "Test containment boundary", event: "overreach", actorId: "agent-response" };
    if (act === 3) return { label: "Continue autonomously", event: "autonomous", actorId: "analyst-morgan" };
    if (act === 4) return { label: "Return governed findings", event: "requestContainment", actorId: "agent-response" };
    if (proposal?.authorityResult === "confirmation-required") return { label: "Approve Host-A isolation", event: "approve", actorId: "analyst-morgan" };
    return null;
  }, [act, proposal?.authorityResult]);

  React.useEffect(() => {
    if (!autoPlay || !nextAction || nextAction.event === "approve") return;
    const timer = window.setTimeout(() => emit(nextAction.event, {}, nextAction.actorId), 1500);
    return () => window.clearTimeout(timer);
  }, [autoPlay, emit, nextAction]);

  React.useEffect(() => {
    if (autoPlay && (!nextAction || nextAction.event === "approve")) setAutoPlay(false);
  }, [autoPlay, nextAction]);

  const reset = () => {
    setAutoPlay(false);
    setShowLedger(false);
    setShowAgentEye(false);
    emit("reset", {}, "analyst-morgan");
  };

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
          <Button appearance="secondary" icon={autoPlay ? <Stop24Filled /> : <Play24Filled />} onClick={() => setAutoPlay((value) => !value)}>{autoPlay ? "Pause tour" : "Guided autoplay"}</Button>
          {nextAction ? <Button appearance="primary" icon={<ChevronRight20Regular />} onClick={() => emit(nextAction.event, {}, nextAction.actorId)}>{nextAction.label}</Button> : null}
        </div>
      </header>

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

          <section aria-labelledby="evidence-heading">
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
            <section className={`${styles.proposal} ${proposal.authorityResult === "rejected+fallback" ? styles.proposalRejected : proposal.authorityResult === "executed" ? styles.proposalExecuted : styles.proposalPending}`} aria-label="Governed proposal">
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

          <section className={styles.response} aria-label="Response plan">
            <div>
              <h2 className={styles.responseTitle}>{proposal?.authorityResult === "executed" ? `${incident.target} is contained` : proposal?.authorityResult === "confirmation-required" ? "Response requires your confirmation" : "Response is holding for sufficient evidence"}</h2>
              <p className={styles.responseText}>{proposal?.authorityResult === "executed" ? "The governed action completed and remains fully attributable." : "No containment action can execute without policy validation and the analyst's confirmation."}</p>
            </div>
            <Button appearance={proposal?.authorityResult === "confirmation-required" ? "primary" : "secondary"} icon={<ShieldLock24Regular />} disabled={proposal?.authorityResult !== "confirmation-required"} onClick={() => emit("approve", {}, "analyst-morgan")}>Isolate {incident.target}</Button>
          </section>
        </section>

        <aside className={styles.rail} aria-label="Agent team and governance">
          <section className={styles.panel}>
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
