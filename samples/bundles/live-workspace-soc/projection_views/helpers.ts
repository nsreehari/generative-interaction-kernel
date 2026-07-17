import { compileSocPresentation, SOC_BLUEPRINT_CONTEXTS } from "../../../profiles/live-workspace-soc/compile";
import {
  selectionContainsFocus,
  selectionFromTimelineItem,
  type DemoSelection,
  type FocusRef,
  type FocusTarget,
  type TimelineItem,
} from "../../../shared/demo-runner";
import type { JournalEntry, ParticipantPresence, SocPresentationSpec } from "./types";

export function socPresentationSpec(contextId: string): SocPresentationSpec {
  const context = SOC_BLUEPRINT_CONTEXTS.find((item) => item.id === contextId) ?? SOC_BLUEPRINT_CONTEXTS.find((item) => item.id === "war-room");
  if (!context) throw new Error("The SOC blueprint must define a war-room presentation context");
  const presentation = compileSocPresentation(context.id);
  return {
    frame: context.frame as SocPresentationSpec["frame"],
    arrangement: presentation.arrangement as SocPresentationSpec["arrangement"],
    regions: presentation.regions
      .filter((region) => region.disclosure !== "omitted" && region.materialize === false)
      .map((region) => region.name as SocPresentationSpec["regions"][number]),
  };
}

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

export function socJournalSelection(entry: JournalEntry | undefined): DemoSelection | undefined {
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

export function selectionTargetsRecord(selection: DemoSelection | undefined, objectIds: readonly string[]): boolean {
  return selectionContainsFocus(selection, objectIds.map((id) => socFocusRef("record", id)));
}

export function selectionTargetsActor(selection: DemoSelection | undefined, actorId: string): boolean {
  return selectionContainsFocus(selection, [socFocusRef("actor", actorId)]);
}
