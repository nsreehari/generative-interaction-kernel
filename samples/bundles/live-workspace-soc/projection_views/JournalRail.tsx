import React from "react";
import { Button, mergeClasses } from "@fluentui/react-components";
import { CheckmarkCircle20Regular, Clock20Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import { GrowingContainer } from "../../../../adapters/react/src/primitives/registry";
import { selectionFromTimelineItem, type DemoSelection, type TimelineItem } from "../../../shared/demo-runner";
import { socJournalTimelineItem } from "./helpers";
import { useStyles } from "./styles";
import type { Actor, Incident, JournalEntry } from "./types";

export const JournalRail: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const incident = node.props.incident as unknown as Incident;
  const actors = (node.props.actors ?? []) as unknown as Actor[];
  const journal = (node.props.journal ?? []) as unknown as JournalEntry[];
  const demoEnabled = node.props.demoEnabled === true;
  const demoTimeline = (node.props.demoTimeline ?? []) as unknown as TimelineItem[];
  const demoSelection = (node.props.demoSelection ?? undefined) as unknown as DemoSelection | undefined;
  const selectedJournalId = typeof node.props.selectedJournalId === "string" ? node.props.selectedJournalId : null;
  const journalMode = node.props.journalMode === "ledger" ? "ledger" : "journal";
  const latestEntry = journal.at(-1);
  const selectedEntry = selectedJournalId
    ? journal.find((item) => item.id === selectedJournalId) ?? latestEntry
    : latestEntry;
  const timelineItems = demoEnabled ? demoTimeline : journal.map(socJournalTimelineItem);
  const visibleTimelineItems = journalMode === "journal"
    ? timelineItems.filter((item) => item.source === "organism")
    : timelineItems;
  const selectedTimelineItem = demoSelection
    ? timelineItems.find((item) => item.id === demoSelection.itemId)
    : selectedEntry ? socJournalTimelineItem(selectedEntry) : timelineItems.at(-1);
  const actorNames = new Map(actors.map((item) => [item.id, item.name]));

  const selectTimelineItem = (item: TimelineItem) => {
    if (demoEnabled) emit("selectTimeline", { selection: selectionFromTimelineItem(item) });
    else emit("selectJournal", { id: item.operationRecordId ?? item.id });
  };

  const clearTimelineSelection = () => {
    if (demoEnabled) emit("clearTimelineSelection", {});
    else emit("selectJournal", { id: null });
  };

  return (
    <aside className={styles.journalRail} aria-label="Journal and ledger">
      <div className={styles.journalSticky}>
        <header className={styles.journalHeader}>
          <div><div className={styles.eyebrow}>Causal record</div><strong>Journal / Ledger</strong></div>
          <div className={styles.journalTabs}>
            {(demoSelection || selectedJournalId) ? <Button size="small" appearance="subtle" onClick={clearTimelineSelection}>Latest</Button> : null}
            <Button size="small" appearance={journalMode === "journal" ? "primary" : "subtle"} onClick={() => emit("setJournalMode", { mode: "journal" })}>Journal</Button>
            <Button size="small" appearance={journalMode === "ledger" ? "primary" : "subtle"} onClick={() => emit("setJournalMode", { mode: "ledger" })}>Ledger</Button>
          </div>
        </header>
        <GrowingContainer className={styles.journalList} ariaLabel="Journal timeline">
          {visibleTimelineItems.length === 0 ? <div className={styles.empty}><Clock20Regular /><p>The first attributable action will appear here.</p></div> : visibleTimelineItems.map((item) => (
            <button type="button" aria-pressed={selectedTimelineItem?.id === item.id} aria-label={`${item.status}: ${item.title}`} onClick={() => selectTimelineItem(item)} key={item.id} className={mergeClasses(styles.journalEntry, selectedTimelineItem?.id === item.id ? styles.journalEntryActive : undefined)}>
              <span className={styles.journalTime}>{item.timestamp ?? `#${item.sequence ?? "-"}`}</span>
              <div>
                <div className={styles.journalResult}>{journalMode === "ledger" ? `${item.source === "scenario" ? "Scenario instruction" : "SOC outcome"} · ` : ""}{item.status}{item.actorRef ? ` · ${actorNames.get(item.actorRef.id) ?? item.actorRef.id}` : ""}</div>
                <div className={styles.journalSummary}>{item.summary}</div>
                {journalMode === "ledger" ? <div className={styles.ledgerMeta}>item={item.scenarioStepId ?? item.operationRecordId ?? item.id}<br />focus={item.focusRefs.map((ref) => `${ref.kind}:${ref.id}`).join(", ")}{item.correlationId ? <><br />correlation={item.correlationId}</> : null}</div> : null}
              </div>
            </button>
          ))}
          {incident.status === "Contained" ? <div className={styles.fallback}><CheckmarkCircle20Regular /> <strong>Host-A contained under commander authority.</strong></div> : null}
        </GrowingContainer>
      </div>
    </aside>
  );
};