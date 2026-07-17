import { Button, mergeClasses } from "@fluentui/react-components";
import {
  BrainCircuit24Regular,
  ShieldLock24Regular,
  Sparkle24Regular,
} from "@fluentui/react-icons";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";
import { selectionTargetsRecord } from "./helpers";
import { usePresentationMaterialization } from "./PresentationLayout";
import { useStyles } from "./styles";
import type {
  Authorization,
  Evidence,
  Exploration,
  Hypothesis,
  Actor,
  Presentation,
  PresentationRegionFacet,
  Proposal,
} from "./types";

function facet(node: ProjectionViewProps["node"]): PresentationRegionFacet {
  return node.props.facet as unknown as PresentationRegionFacet;
}

function regionAttributes(region: string, presentation: PresentationRegionFacet) {
  return {
    "data-soc-region": region,
    "data-soc-concern": presentation.concern,
    "data-soc-group": presentation.group,
    "data-soc-priority": presentation.priority,
    "data-soc-disclosure": presentation.disclosure,
    style: { order: presentation.rank },
  };
}

export const IntentRegion: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const { activeSelection, actorNames } = usePresentationMaterialization();
  const intent = node.props.intent as unknown as { actorId?: string; statement: string } | null;
  const actorName = intent?.actorId ? actorNames.get(intent.actorId) ?? intent.actorId : undefined;
  return (
    <section {...regionAttributes("intent", facet(node))} data-soc-object-id="intent" className={mergeClasses(styles.contextBand, selectionTargetsRecord(activeSelection, ["intent"]) ? styles.causalHighlight : undefined)}>
      <div className={styles.contextLabel}>Investigation intent</div>
      <p className={mergeClasses(styles.contextText, !intent ? styles.emptyText : undefined)}>
        {intent ? <>{actorName ? <strong>{actorName}: </strong> : null}{intent.statement}</> : "Waiting for the analyst to establish intent"}
      </p>
    </section>
  );
};

export const ConstraintsRegion: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const { activeSelection, actorNames } = usePresentationMaterialization();
  const constraints = (node.props.constraints ?? []) as unknown as Array<{ actorId?: string; rule: string }>;
  const constraint = constraints[0];
  const actorName = constraint?.actorId ? actorNames.get(constraint.actorId) ?? constraint.actorId : undefined;
  return (
    <section {...regionAttributes("constraints", facet(node))} data-soc-object-id="constraints" className={mergeClasses(styles.contextBand, selectionTargetsRecord(activeSelection, ["constraints", "DC-01"]) ? styles.causalHighlight : undefined)}>
      <div className={styles.contextLabel}>Operating constraints</div>
      <p className={mergeClasses(styles.contextText, !constraint ? styles.emptyText : undefined)}>
        {constraint ? <>{actorName ? <strong>{actorName}: </strong> : null}{constraint.rule}</> : "Waiting for incident-command constraints"}
      </p>
    </section>
  );
};

export const HypothesisRegion: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const { activeSelection } = usePresentationMaterialization();
  const hypothesis = node.props.hypothesis as unknown as Hypothesis;
  return (
    <article {...regionAttributes("hypothesis", facet(node))} data-soc-object-id="hypothesis" className={mergeClasses(styles.hypothesis, selectionTargetsRecord(activeSelection, ["hypothesis", "corr-1", "Host-A"]) ? styles.causalHighlight : undefined)}>
      <div className={styles.hypothesisTop}>
        <div className={styles.hypothesisLabel}><BrainCircuit24Regular />Working hypothesis</div>
        <div className={styles.confidence}>{hypothesis.confidence}%</div>
      </div>
      <p className={styles.hypothesisText}>{hypothesis.statement}</p>
    </article>
  );
};

export const ExplorationRegion: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const { activeSelection } = usePresentationMaterialization();
  const explorations = (node.props.explorations ?? []) as unknown as Exploration[];
  return (
    <section {...regionAttributes("exploration", facet(node))} className={styles.section}>
      <h3 className={styles.sectionTitle}><Sparkle24Regular />Exploration</h3>
      {explorations.length > 0 ? <div className={styles.explorationList}>{explorations.map((item) => (
        <article data-soc-object-id={item.id} key={item.id} className={mergeClasses(styles.exploration, item.status === "superseded" ? styles.explorationMuted : undefined, selectionTargetsRecord(activeSelection, [item.id]) ? styles.causalHighlight : undefined)}>
          <div className={styles.rowTop}><strong>Revision {item.revision}</strong><span className={styles.status}>{item.status}</span></div>
          <div className={styles.detailGrid}><span>{item.windowMinutes} minute window</span><span>{item.correlationKey}</span><span>{item.safety}</span></div>
        </article>
      ))}</div> : <div className={styles.empty}>No exploration proposed yet.</div>}
    </section>
  );
};

export const EvidenceRegion: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const { activeSelection } = usePresentationMaterialization();
  const evidence = (node.props.evidence ?? []) as unknown as Evidence[];
  return (
    <section {...regionAttributes("evidence", facet(node))} className={styles.section}>
      <h3 className={styles.sectionTitle}><Sparkle24Regular />Evidence</h3>
      {evidence.length > 0 ? <div className={styles.evidenceList}>{evidence.map((item) => (
        <article data-soc-object-id={item.id} className={mergeClasses(styles.evidence, selectionTargetsRecord(activeSelection, ["evidence", item.id]) ? styles.causalHighlight : undefined)} key={item.id}>
          <div className={styles.evidenceMeta}><span>{item.source}</span><span>{item.confidence}%</span></div>
          <p className={styles.evidenceText}>{item.summary}</p>
        </article>
      ))}</div> : <div className={styles.empty}>No evidence committed yet.</div>}
    </section>
  );
};

export const ResponseRegion: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const { activeSelection } = usePresentationMaterialization();
  const proposal = (node.props.proposal ?? null) as unknown as Proposal | null;
  return (
    <section {...regionAttributes("response", facet(node))} className={styles.section}>
      <h3 className={styles.sectionTitle}><ShieldLock24Regular />Governed response</h3>
      {proposal ? <article data-soc-object-id={proposal.id} className={mergeClasses(styles.proposal, proposal.status === "rejected" ? styles.proposalRejected : undefined, proposal.status === "executed" ? styles.proposalExecuted : undefined, selectionTargetsRecord(activeSelection, [proposal.id, "proposal-dc01", "proposal-host-a", "rec-1", "authorization", "DC-01", "Host-A"]) ? styles.causalHighlight : undefined)}>
        <div className={styles.rowTop}><span className={styles.status}>{proposal.status}</span><span>{proposal.target}</span></div>
        <h4 className={styles.proposalTitle}>{proposal.action}</h4>
        {proposal.reason ? <p className={styles.proposalText}>{proposal.reason}</p> : null}
        {proposal.fallback ? <div className={styles.fallback}><strong>Safe fallback applied</strong><br />{proposal.fallback}</div> : null}
        {proposal.sequence ? <p className={styles.proposalText}>{proposal.sequence.join(" → ")}</p> : null}
        {proposal.blastRadius ? <div className={styles.metrics}><span>Blast radius: {proposal.blastRadius}</span><span>Payroll: {proposal.payrollDependency}</span><span>{proposal.reversible ? "Reversible" : "Irreversible"}</span></div> : null}
      </article> : <div className={styles.empty}>Response is holding until evidence supports a bounded action.</div>}
    </section>
  );
};

export const AuthorizationRegion: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const { activeSelection } = usePresentationMaterialization();
  const authorization = (node.props.authorization ?? null) as unknown as Authorization | null;
  return (
    <section {...regionAttributes("authorization", facet(node))} data-soc-object-id="authorization" className={mergeClasses(styles.contextBand, selectionTargetsRecord(activeSelection, ["authorization", "rec-1", "Host-A"]) ? styles.causalHighlight : undefined)}>
      <div className={styles.contextLabel}>Commander authority</div>
      <p className={styles.contextText}>{authorization?.status === "pending" ? "Host-A isolation is ready for Incident Commander authorization." : authorization?.status === "authorized" ? "Containment has Incident Commander authorization." : "No consequential action is awaiting authorization."}</p>
      {authorization?.status === "pending" ? <Button appearance="primary" icon={<ShieldLock24Regular />} onClick={() => emit("authorizeContainment", {}, "human-priya")}>Authorize Host-A isolation</Button> : null}
    </section>
  );
};

export const CausalRecordRegion: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const { actorNames, selectedTimelineItem } = usePresentationMaterialization();
  return (
    <section {...regionAttributes("causal-record", facet(node))} className={styles.contextBand}>
      <div className={styles.contextLabel}>Relevant causal record</div>
      <p className={styles.contextText}>{selectedTimelineItem ? `${selectedTimelineItem.actorRef ? actorNames.get(selectedTimelineItem.actorRef.id) ?? selectedTimelineItem.actorRef.id : selectedTimelineItem.source}: ${selectedTimelineItem.summary}` : "The first attributable action will appear here."}</p>
    </section>
  );
};

export const AgentRequestRegion: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const presentation = node.props.presentation as unknown as Presentation;
  const actors = (node.props.actors ?? []) as unknown as Actor[];
  const explorations = (node.props.explorations ?? []) as unknown as Exploration[];
  const proposal = (node.props.proposal ?? null) as unknown as Proposal | null;
  const selectedAgent = actors.find((actor) => actor.id === (presentation.selectedContext === "correlation-agent" ? "agent-correlation" : "agent-response"));
  const request = presentation.selectedContext === "correlation-agent"
    ? explorations.at(-1)?.question ?? selectedAgent?.objective ?? "Awaiting an investigation task"
    : proposal ? `Prepare and govern ${proposal.action} for ${proposal.target}` : selectedAgent?.objective ?? "Awaiting a response-planning task";

  return (
    <section {...regionAttributes("agent-request", facet(node))} className={styles.agentRequestSection}>
      <div className={styles.agentRequestLabel}><span className={styles.agentRequestKind}>Task envelope</span><strong>{selectedAgent?.name ?? "Selected agent"}</strong></div>
      <div className={styles.agentRequestBody}>
        <p className={styles.agentRequestText}>{request}</p>
        <div className={styles.agentRequestMeta}>
          <span className={styles.agentRequestChip}>actor={selectedAgent?.id ?? "unassigned"}</span>
          <span className={styles.agentRequestChip}>authority={selectedAgent?.authority ?? "none"}</span>
        </div>
      </div>
    </section>
  );
};