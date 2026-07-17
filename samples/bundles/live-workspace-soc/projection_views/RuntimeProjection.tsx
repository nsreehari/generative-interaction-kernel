import { Button, mergeClasses } from "@fluentui/react-components";
import {
  BrainCircuit24Regular,
  DataTrending24Regular,
  ShieldLock24Regular,
  Sparkle24Regular,
} from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { SOC_BLUEPRINT_CONTEXTS, traceSocBlueprint } from "../../../profiles/live-workspace-soc/compile";
import {
  selectionFromTimelineItem,
  type DemoSelection,
  type TimelineItem,
} from "../../../shared/demo-runner";
import { selectionTargetsRecord, socJournalTimelineItem, socPresentationSpec } from "./helpers";
import { useStyles } from "./styles";
import type {
  Actor,
  Authorization,
  Evidence,
  Exploration,
  Hypothesis,
  JournalEntry,
  Presentation,
  Proposal,
  SubstrateRegion,
} from "./types";

export const RuntimeProjection: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const presentation = node.props.presentation as unknown as Presentation;
  const actors = (node.props.actors ?? []) as unknown as Actor[];
  const explorations = (node.props.explorations ?? []) as unknown as Exploration[];
  const evidence = (node.props.evidence ?? []) as unknown as Evidence[];
  const hypothesis = node.props.hypothesis as unknown as Hypothesis;
  const proposal = (node.props.proposal ?? null) as unknown as Proposal | null;
  const authorization = (node.props.authorization ?? null) as unknown as Authorization | null;
  const journal = (node.props.journal ?? []) as unknown as JournalEntry[];
  const demoEnabled = node.props.demoEnabled === true;
  const demoTimeline = (node.props.demoTimeline ?? []) as unknown as TimelineItem[];
  const demoSelection = (node.props.demoSelection ?? undefined) as unknown as DemoSelection | undefined;
  const intent = node.props.intent as unknown as { statement: string } | null;
  const constraints = (node.props.constraints ?? []) as unknown as Array<{ rule: string }>;
  const stage = String(node.props.stage ?? "Incident opened");
  const selectedJournalId = typeof node.props.selectedJournalId === "string" ? node.props.selectedJournalId : null;

  const latestEntry = journal[journal.length - 1];
  const selectedEntry = selectedJournalId
    ? journal.find((item) => item.id === selectedJournalId) ?? latestEntry
    : latestEntry;
  const organismTimeline = journal.map(socJournalTimelineItem);
  const timelineItems = demoEnabled ? demoTimeline : organismTimeline;
  const selectedTimelineItem = demoSelection
    ? timelineItems.find((item) => item.id === demoSelection.itemId)
    : selectedEntry ? socJournalTimelineItem(selectedEntry) : timelineItems.at(-1);
  const activeSelection = demoSelection ?? (selectedTimelineItem ? selectionFromTimelineItem(selectedTimelineItem) : undefined);
  const actorNames = new Map(actors.map((item) => [item.id, item.name]));
  const selectedContext = presentation.contexts.find((item) => item.id === presentation.selectedContext) ?? presentation.contexts[0];
  const presentationSpec = socPresentationSpec(presentation.selectedContext);
  const hasRegion = (region: SubstrateRegion) => presentationSpec.regions.includes(region);
  const showInvestigation = hasRegion("exploration") || hasRegion("evidence");
  const showResponse = hasRegion("response");
  const projectionFrameClass = presentationSpec.frame === "mobile" ? styles.frameMobile
    : presentationSpec.frame === "laptop" ? styles.frameLaptop
    : presentationSpec.frame === "pager" ? styles.framePager
    : presentationSpec.frame === "workstation" ? styles.frameWorkstation
    : presentationSpec.frame === "agent-console" ? styles.frameAgent
    : undefined;
  const regionOrder = (...regions: SubstrateRegion[]) => Math.min(...regions.map((region) => {
    const index = presentationSpec.regions.indexOf(region);
    return index < 0 ? 50 : index;
  }));
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
    <div className={mergeClasses(styles.contextProjection, projectionFrameClass)} data-soc-viewpoint={presentation.selectedContext}>
      <header className={styles.viewpointIdentity} style={{ order: -2 }}>
        <div>
          <div className={styles.eyebrow}>{selectedContext.audience}</div>
          <h2 className={styles.viewpointName}>{selectedContext.label}</h2>
        </div>
        <span className={styles.viewpointDevice}>{presentationSpec.frame} · {presentationSpec.arrangement}</span>
      </header>
      <header className={styles.sharedHeader} style={{ order: regionOrder("summary") }}>
        <div>
          <div className={styles.eyebrow}>One governed operational state</div>
          <h2 className={styles.sharedTitle}>Shared investigation</h2>
          <p className={styles.sharedSubhead}>Every contribution changes or challenges the same incident record.</p>
        </div>
        <span className={styles.pill}><DataTrending24Regular />{journal.length} attributable changes</span>
      </header>

      {presentationSpec.frame === "agent-console" ? <div className={styles.agentEnvelope} aria-label="Agent participation envelope" style={{ order: 1 }}>
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
      </div> : <>
      {hasRegion("intent") || hasRegion("constraints") ? <div style={{ order: regionOrder("intent", "constraints") }} className={mergeClasses(styles.contextRow, hasRegion("intent") && hasRegion("constraints") ? undefined : styles.contextRowSingle)}>
        {hasRegion("intent") ? <div data-soc-object-id="intent" className={mergeClasses(styles.contextBand, selectionTargetsRecord(activeSelection, ["intent"]) ? styles.causalHighlight : undefined)}>
          <div className={styles.contextLabel}>Morgan's intent</div>
          <p className={mergeClasses(styles.contextText, !intent ? styles.emptyText : undefined)}>{intent?.statement ?? "Waiting for the analyst to establish intent"}</p>
        </div> : null}
        {hasRegion("constraints") ? <div data-soc-object-id="constraints" className={mergeClasses(styles.contextBand, selectionTargetsRecord(activeSelection, ["constraints", "DC-01"]) ? styles.causalHighlight : undefined)}>
          <div className={styles.contextLabel}>Priya's operating constraint</div>
          <p className={mergeClasses(styles.contextText, constraints.length === 0 ? styles.emptyText : undefined)}>{constraints[0]?.rule ?? "Waiting for incident-command constraints"}</p>
        </div> : null}
      </div> : null}

      {hasRegion("hypothesis") ? <article style={{ order: regionOrder("hypothesis") }} data-soc-object-id="hypothesis" className={mergeClasses(styles.hypothesis, selectionTargetsRecord(activeSelection, ["hypothesis", "corr-1", "Host-A"]) ? styles.causalHighlight : undefined)}>
        <div className={styles.hypothesisTop}>
          <div className={styles.hypothesisLabel}><BrainCircuit24Regular />Working hypothesis</div>
          <div className={styles.confidence}>{hypothesis.confidence}%</div>
        </div>
        <p className={styles.hypothesisText}>{hypothesis.statement}</p>
      </article> : null}

      {showInvestigation ? <section style={{ order: regionOrder("exploration", "evidence") }} className={styles.section}>
          <h3 className={styles.sectionTitle}><Sparkle24Regular />{hasRegion("exploration") ? "Exploration and evidence" : "Evidence summary"}</h3>
          {hasRegion("exploration") && explorations.length > 0 ? <div className={styles.explorationList}>{explorations.map((item) => (
            <article data-soc-object-id={item.id} key={item.id} className={mergeClasses(styles.exploration, item.status === "superseded" ? styles.explorationMuted : undefined, selectionTargetsRecord(activeSelection, [item.id]) ? styles.causalHighlight : undefined)}>
              <div className={styles.rowTop}><strong>Revision {item.revision}</strong><span className={styles.status}>{item.status}</span></div>
              <div className={styles.detailGrid}><span>{item.windowMinutes} minute window</span><span>{item.correlationKey}</span><span>{item.safety}</span></div>
            </article>
          ))}</div> : hasRegion("exploration") ? <div className={styles.empty}>No exploration proposed yet.</div> : null}
          {hasRegion("evidence") && evidence.length > 0 ? <div className={styles.evidenceList}>{evidence.map((item) => (
            <article data-soc-object-id={item.id} className={mergeClasses(styles.evidence, selectionTargetsRecord(activeSelection, ["evidence", item.id]) ? styles.causalHighlight : undefined)} key={item.id}>
              <div className={styles.evidenceMeta}><span>{item.source}</span><span>{item.confidence}%</span></div>
              <p className={styles.evidenceText}>{item.summary}</p>
            </article>
          ))}</div> : null}
      </section> : null}

      {showResponse ? <section style={{ order: regionOrder("response") }} className={styles.section}>
          <h3 className={styles.sectionTitle}><ShieldLock24Regular />Governed response</h3>
          {proposal ? <article data-soc-object-id={proposal.id} className={mergeClasses(styles.proposal, proposal.status === "rejected" ? styles.proposalRejected : undefined, proposal.status === "executed" ? styles.proposalExecuted : undefined, selectionTargetsRecord(activeSelection, [proposal.id, "proposal-dc01", "proposal-host-a", "rec-1", "authorization", "DC-01", "Host-A"]) ? styles.causalHighlight : undefined)}>
            <div className={styles.rowTop}><span className={styles.status}>{proposal.status}</span><span>{proposal.target}</span></div>
            <h4 className={styles.proposalTitle}>{proposal.action}</h4>
            {proposal.reason ? <p className={styles.proposalText}>{proposal.reason}</p> : null}
            {proposal.fallback ? <div className={styles.fallback}><strong>Safe fallback applied</strong><br />{proposal.fallback}</div> : null}
            {proposal.sequence ? <p className={styles.proposalText}>{proposal.sequence.join(" → ")}</p> : null}
            {proposal.blastRadius ? <div className={styles.metrics}><span>Blast radius: {proposal.blastRadius}</span><span>Payroll: {proposal.payrollDependency}</span><span>{proposal.reversible ? "Reversible" : "Irreversible"}</span></div> : null}
          </article> : <div className={styles.empty}>Response is holding until evidence supports a bounded action.</div>}
      </section> : null}

      {hasRegion("authorization") ? <section style={{ order: regionOrder("authorization") }} data-soc-object-id="authorization" className={mergeClasses(styles.contextBand, selectionTargetsRecord(activeSelection, ["authorization", "rec-1", "Host-A"]) ? styles.causalHighlight : undefined)}>
        <div className={styles.contextLabel}>Commander authority</div>
        <p className={styles.contextText}>{authorization?.status === "pending" ? "Host-A isolation is ready for Incident Commander authorization." : authorization?.status === "authorized" ? "Containment has Incident Commander authorization." : "No consequential action is awaiting authorization."}</p>
        {authorization?.status === "pending" ? <Button appearance="primary" icon={<ShieldLock24Regular />} onClick={() => emit("authorizeContainment", {}, "human-priya")}>Authorize Host-A isolation</Button> : null}
      </section> : null}

      {hasRegion("causal-record") ? <section style={{ order: regionOrder("causal-record") }} className={styles.contextBand}>
        <div className={styles.contextLabel}>Relevant causal record</div>
        <p className={styles.contextText}>{selectedTimelineItem ? `${selectedTimelineItem.actorRef ? actorNames.get(selectedTimelineItem.actorRef.id) ?? selectedTimelineItem.actorRef.id : selectedTimelineItem.source}: ${selectedTimelineItem.summary}` : "The first attributable action will appear here."}</p>
      </section> : null}
      </>}
    </div>
  );
};
