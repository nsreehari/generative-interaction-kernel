import React from "react";
import { Button, Spinner, mergeClasses } from "@fluentui/react-components";
import {
  CheckmarkCircle20Regular,
  ChevronDown20Regular,
  ChevronUp20Regular,
  Clock20Regular,
  Person24Regular,
  QuestionCircle20Regular,
  ShieldLock24Regular,
  Sparkle24Regular,
  WeatherMoon20Regular,
} from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import type { DemoSelection } from "../../../shared/demo-runner";
import { participantPresence, selectionTargetsActor, socJournalSelection } from "./helpers";
import { useStyles } from "./styles";
import type { Actor, AgentProvider, Authorization, JournalEntry } from "./types";

function ParticipantPresenceIcon({ status }: { status: string }): React.ReactElement {
  const styles = useStyles();
  const presence = participantPresence(status);
  const className = mergeClasses(
    styles.presence,
    presence === "working" ? styles.presenceWorking : undefined,
    presence === "input-awaited" ? styles.presenceAttention : undefined,
    presence === "complete" ? styles.presenceComplete : undefined
  );

  if (presence === "working") return <span className={className} title="Working"><Spinner size="tiny" /></span>;
  if (presence === "waiting") return <span className={className} title="Waiting"><Clock20Regular /></span>;
  if (presence === "input-awaited") return <span className={className} title="Input awaited"><QuestionCircle20Regular /></span>;
  if (presence === "sleeping") return <span className={className} title="Sleeping"><WeatherMoon20Regular /></span>;
  if (presence === "complete") return <span className={className} title="Complete"><CheckmarkCircle20Regular /></span>;
  return <span className={className} title="Available"><CheckmarkCircle20Regular /></span>;
}

export const Participants: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const actors = (node.props.actors ?? []) as unknown as Actor[];
  const agentProviders = (node.props.agentProviders ?? {}) as unknown as Record<string, AgentProvider>;
  const authorization = (node.props.authorization ?? null) as unknown as Authorization | null;
  const journal = (node.props.journal ?? []) as unknown as JournalEntry[];
  const demoSelection = (node.props.demoSelection ?? undefined) as unknown as DemoSelection | undefined;
  const selectedJournalId = typeof node.props.selectedJournalId === "string" ? node.props.selectedJournalId : null;
  const participantsExpanded = node.props.expanded === true;
  const selectedEntry = selectedJournalId
    ? journal.find((item) => item.id === selectedJournalId) ?? journal.at(-1)
    : journal.at(-1);
  const activeSelection = demoSelection ?? socJournalSelection(selectedEntry);
  const providerSwitches = React.Children.toArray(children);
  let providerSwitchIndex = 0;

  return (
    <section className={styles.participantDrawer} aria-label="Participant drawer">
      <button
        type="button"
        className={styles.participantDrawerToggle}
        aria-expanded={participantsExpanded}
        aria-controls="soc-participants"
        onClick={() => emit("toggleDrawer", { expanded: !participantsExpanded })}
      >
        <span className={styles.participantDrawerTitle}><Person24Regular />Participants</span>
        <span className={styles.participantSummaries} aria-hidden="true">
          {actors.map((item) => {
            const canAuthorize = item.id === "human-priya" && authorization?.status === "pending";
            const status = canAuthorize ? "input-awaited" : item.status;
            return <span className={styles.participantSummary} key={item.id}>
              <ParticipantPresenceIcon status={status} />
              <span className={styles.participantSummaryName}>{item.name}</span>
              <span>{canAuthorize ? "input awaited" : item.status.replaceAll("-", " ")}</span>
            </span>;
          })}
        </span>
        {participantsExpanded ? <ChevronDown20Regular /> : <ChevronUp20Regular />}
      </button>
      {participantsExpanded ? <div id="soc-participants" className={styles.participants} aria-label="Human and agent participants">
        {actors.map((item) => {
          const active = selectionTargetsActor(activeSelection, item.id);
          const canAuthorize = item.id === "human-priya" && authorization?.status === "pending";
          const status = canAuthorize ? "input-awaited" : item.status;
          const providerSwitch = item.kind === "agent" ? providerSwitches[providerSwitchIndex++] : undefined;
          return <article data-soc-actor-id={item.id} key={item.id} className={mergeClasses(styles.participant, active ? styles.participantActive : undefined, active ? styles.causalHighlight : undefined)}>
            <div className={styles.participantTop}>
              <div className={styles.participantIdentity}>
                <ParticipantPresenceIcon status={status} />
                <div className={styles.participantName}>{item.kind === "human" ? <Person24Regular /> : <Sparkle24Regular />}{item.name}</div>
              </div>
              <span className={styles.kind}>{item.kind.toUpperCase()}</span>
            </div>
            <div className={styles.role}>{item.role} · {canAuthorize ? "input awaited" : item.status.replaceAll("-", " ")}</div>
            <p className={styles.activity}>{item.activity ?? item.objective}</p>
            <div className={styles.authority}>{item.authority}</div>
            {item.kind === "agent" && agentProviders[item.id] ? <div className={styles.providerControls}>
              <div className={styles.providerHeader}>
                <span className={styles.providerName} title={agentProviders[item.id].agentName}>{agentProviders[item.id].agentName}</span>
                <div className={styles.providerMode}>{providerSwitch}</div>
              </div>
              <div className={styles.providerStatus}>{agentProviders[item.id].status}{agentProviders[item.id].fallbackReason ? ` · ${agentProviders[item.id].fallbackReason}` : agentProviders[item.id].conversationId ? " · conversation active" : ""}</div>
            </div> : null}
            {canAuthorize ? <Button className={styles.authorize} appearance="primary" icon={<ShieldLock24Regular />} onClick={() => emit("authorizeContainment", {}, "human-priya")}>Authorize Host-A isolation</Button> : null}
          </article>;
        })}
      </div> : null}
    </section>
  );
};