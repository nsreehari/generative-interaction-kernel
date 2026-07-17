import { mergeClasses } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";
import { SOC_BLUEPRINT_CONTEXTS, traceSocBlueprint } from "../../../profiles/live-workspace-soc/compile";
import { useStyles } from "./styles";
import type {
  Actor,
  Evidence,
  Exploration,
  Hypothesis,
  JournalEntry,
  Presentation,
  Proposal,
} from "./types";

export const AgentEnvelope: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const presentation = node.props.presentation as unknown as Presentation;
  const stage = String(node.props.stage ?? "Incident opened");
  const actors = (node.props.actors ?? []) as unknown as Actor[];
  const constraints = (node.props.constraints ?? []) as unknown as Array<{ rule: string }>;
  const explorations = (node.props.explorations ?? []) as unknown as Exploration[];
  const evidence = (node.props.evidence ?? []) as unknown as Evidence[];
  const hypothesis = node.props.hypothesis as unknown as Hypothesis;
  const proposal = (node.props.proposal ?? null) as unknown as Proposal | null;
  const journal = (node.props.journal ?? []) as unknown as JournalEntry[];

  const blueprintTrace = traceSocBlueprint(presentation.selectedContext);
  const blueprintContext = SOC_BLUEPRINT_CONTEXTS.find((item) => item.id === presentation.selectedContext) ?? SOC_BLUEPRINT_CONTEXTS[0];
  const blueprintPresentation = blueprintTrace[1].output as { layout: string; arrangement: string; regions: Array<{ name: string; group?: string; priority: string; disclosure: string; presentation?: string; materialize?: boolean }> };
  const blueprintRegions = blueprintPresentation.regions.filter((region) => region.disclosure !== "omitted" && region.presentation !== "presenter-control");
  const selectedAgent = actors.find((actor) => actor.id === blueprintContext.actor);
  const selectedAgentEntries = selectedAgent ? journal.filter((entry) => entry.actorId === selectedAgent.id) : [];
  const latestAgentEntry = selectedAgentEntries.at(-1);
  const agentRegions = (group: string) => blueprintRegions.filter((region) => region.group === group).map((region) => region.name);
  const agentRequest = presentation.selectedContext === "correlation-agent"
    ? explorations.at(-1)?.question ?? selectedAgent?.objective ?? "Awaiting an investigation task"
    : proposal ? `Prepare and govern ${proposal.action} for ${proposal.target}` : selectedAgent?.objective ?? "Awaiting a response-planning task";
  const agentResponse = presentation.selectedContext === "correlation-agent"
    ? evidence.filter((item) => item.actorId === "agent-correlation").at(-1)?.summary ?? selectedAgent?.activity ?? "No evidence contribution submitted yet."
    : proposal ? `${proposal.status}: ${proposal.action} for ${proposal.target}` : selectedAgent?.activity ?? "No response proposal submitted yet.";

  return (
    <div className={styles.agentEnvelope} aria-label="Agent participation envelope" style={{ order: 1 }}>
      <section className={styles.agentEnvelopeSection} data-agent-envelope-group="context">
        <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>01 · Context</span><strong>Participation scope</strong></div>
        <div className={styles.agentEnvelopeBody}>
          <h3 className={styles.agentEnvelopeTitle}>{selectedAgent?.name ?? blueprintContext.actor}</h3>
          <p className={styles.agentEnvelopeText}>{selectedAgent?.objective ?? "No objective assigned."}</p>
          <div className={styles.agentEnvelopeMeta}>
            <span className={styles.agentEnvelopeChip}>actor={blueprintContext.actor}</span>
            <span className={styles.agentEnvelopeChip}>role={blueprintContext.role}</span>
            <span className={styles.agentEnvelopeChip}>revision={presentation.revision}</span>
            <span className={styles.agentEnvelopeChip}>stage={stage}</span>
          </div>
          <p className={styles.agentEnvelopeText}>Authority: {selectedAgent?.authority ?? "No authority declared"}</p>
        </div>
      </section>

      <section className={styles.agentEnvelopeSection} data-agent-envelope-group="shared-state">
        <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>02 · State</span><strong>Shared with agent</strong></div>
        <div className={styles.agentEnvelopeBody}>
          <div className={styles.agentEnvelopeMeta}>{agentRegions("shared-state").map((region) => <span className={styles.agentEnvelopeChip} key={region}>{region}</span>)}</div>
          <p className={styles.agentEnvelopeText}>{hypothesis.statement} Confidence: {hypothesis.confidence}%.</p>
          {constraints[0] ? <p className={styles.agentEnvelopeText}>Constraint: {constraints[0].rule}</p> : null}
        </div>
      </section>

      <section className={styles.agentEnvelopeSection} data-agent-envelope-group="request">
        <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>03 · Request</span><strong>Task envelope</strong></div>
        <div className={styles.agentEnvelopeBody}>
          <h3 className={styles.agentEnvelopeTitle}>{blueprintContext.task}</h3>
          <p className={styles.agentEnvelopeText}>{agentRequest}</p>
          <div className={styles.agentEnvelopeMeta}>{agentRegions("request").map((region) => <span className={styles.agentEnvelopeChip} key={region}>{region}</span>)}</div>
        </div>
      </section>

      <section className={styles.agentEnvelopeSection} data-agent-envelope-group="response">
        <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>04 · Response</span><strong>Agent contribution</strong></div>
        <div className={styles.agentEnvelopeBody}>
          <p className={styles.agentEnvelopeText}>{agentResponse}</p>
          <div className={styles.agentEnvelopeMeta}>{agentRegions("response").map((region) => <span className={styles.agentEnvelopeChip} key={region}>{region}</span>)}</div>
        </div>
      </section>

      <section className={mergeClasses(styles.agentEnvelopeSection, latestAgentEntry ? styles.agentEnvelopeOutcome : undefined)} data-agent-envelope-group="governed-result">
        <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>05 · Governed result</span><strong>Shared-state outcome</strong></div>
        <div className={styles.agentEnvelopeBody}>
          <h3 className={styles.agentEnvelopeTitle}>{latestAgentEntry?.result ?? "No submitted result"}</h3>
          <p className={styles.agentEnvelopeText}>{latestAgentEntry?.summary ?? "The kernel has not committed or rejected a contribution from this agent yet."}</p>
          <div className={styles.agentEnvelopeMeta}>
            {agentRegions("governed-result").map((region) => <span className={styles.agentEnvelopeChip} key={region}>{region}</span>)}
            {latestAgentEntry?.affected.map((path) => <span className={styles.agentEnvelopeChip} key={path}>changed:{path}</span>)}
          </div>
        </div>
      </section>
    </div>
  );
};
