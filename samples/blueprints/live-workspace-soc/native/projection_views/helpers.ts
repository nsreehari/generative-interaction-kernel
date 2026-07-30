import {
  selectionContainsFocus,
  selectionFromTimelineItem,
  type ControlSelection,
  type FocusRef,
  type FocusTarget,
  type TimelineItem,
} from "../../../../shared/control-focus";
import type { JournalEntry, ParticipantPresence } from "./types";

export function participantPresence(status: string): ParticipantPresence {
  switch (status) {
    case "working":
    case "running":
      return "working";
    case "waiting":
    case "queued":
      return "waiting";
    case "needs-review":
    case "input-awaited":
    case "awaiting-input":
      return "input-awaited";
    case "sleeping":
    case "idle":
      return "sleeping";
    case "complete":
    case "completed":
    case "done":
      return "complete";
    default:
      return "active";
  }
}

function socFocusRef(kind: FocusRef["kind"], id: string, relation?: FocusRef["relation"]): FocusRef {
  return { namespace: "soc", kind, id, relation };
}

export function socJournalTimelineItem(entry: JournalEntry): TimelineItem {
  const actorRef = socFocusRef("actor", entry.actorId, "origin");
  return {
    id: entry.id,
    source: "organism",
    title: entry.result,
    summary: entry.summary,
    status: entry.result,
    operationRecordId: entry.id,
    timestamp: entry.time,
    actorRef,
    focusRefs: [
      actorRef,
      ...entry.affected.map((id) => socFocusRef("record", id, "affected")),
    ],
  };
}

export function socJournalSelection(entry: JournalEntry | undefined): ControlSelection | undefined {
  return entry ? selectionFromTimelineItem(socJournalTimelineItem(entry)) : undefined;
}

export function isCausallyAffected(entry: JournalEntry | undefined, objectIds: readonly string[]): boolean {
  return selectionContainsFocus(
    socJournalSelection(entry),
    objectIds.map((id) => socFocusRef("record", id))
  );
}

export function isActorSelected(entry: JournalEntry | undefined, actorId: string): boolean {
  return selectionContainsFocus(
    socJournalSelection(entry),
    [socFocusRef("actor", actorId)]
  );
}

export const SOC_FOCUS_TARGETS: FocusTarget[] = [
  ...["intent", "constraints", "hypothesis", "exploration", "evidence", "proposal-dc01", "proposal-host-a", "rec-1", "authorization", "DC-01", "Host-A"].map((id) => ({
    ref: socFocusRef("record", id),
    regionId: id,
    behavior: "highlight" as const,
  })),
  ...["human-morgan", "human-priya", "agent-correlation", "agent-response"].map((id) => ({
    ref: socFocusRef("actor", id),
    regionId: `participant:${id}`,
    behavior: "select" as const,
  })),
];

export function selectionTargetsRecord(selection: ControlSelection | undefined, objectIds: readonly string[]): boolean {
  return selectionContainsFocus(selection, objectIds.map((id) => socFocusRef("record", id)));
}

export function selectionTargetsActor(selection: ControlSelection | undefined, actorId: string): boolean {
  return selectionContainsFocus(selection, [socFocusRef("actor", actorId)]);
}
