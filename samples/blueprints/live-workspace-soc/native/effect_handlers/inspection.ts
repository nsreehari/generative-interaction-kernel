import type { BlueprintInspection, InspectionParticipant, OrganismInspection, ParticipantStatus } from "./control-inspection";
import { socJournalTimelineItem } from "../projection_views/helpers";
import type { Actor, AgentProvider, Incident, JournalEntry, Presentation } from "../projection_views/types";

export function mapSocParticipantStatus(status: string): ParticipantStatus {
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
      return "input-required";
    case "sleeping":
    case "idle":
      return "inactive";
    case "complete":
    case "completed":
    case "done":
      return "completed";
    case "failed":
    case "fallback":
      return "error";
    case "active":
      return "active";
    default:
      return "available";
  }
}

export function projectSocParticipants(
  actors: readonly Actor[],
  providers: Readonly<Record<string, AgentProvider>>,
): InspectionParticipant[] {
  return actors.map((actor) => {
    return {
      id: actor.id,
      kind: actor.kind,
      name: actor.name,
      role: actor.role,
      status: mapSocParticipantStatus(actor.status),
      capabilities: actor.authority ? [actor.authority.replace(/^May /, "Can ")] : undefined,
      focusRef: { namespace: "soc", kind: "actor", id: actor.id },
      settings: undefined,
    };
  });
}

export function projectSocBlueprint(presentation: Presentation): BlueprintInspection {
  const context = presentation.contexts.find((item) => item.id === presentation.selectedContext) ?? presentation.contexts[0];
  const visibleRegions = Object.entries(presentation.regionFacets)
    .filter(([, facet]) => facet.visible)
    .sort(([, left], [, right]) => left.rank - right.rank);
  return {
    title: "Runtime Blueprint",
    description: "The organism is authored directly as Cells and a presentation projection.",
    status: "Blueprint validated",
    contextIds: presentation.contexts.map((item) => item.id),
    selectedContext: context?.id ?? presentation.selectedContext,
    fields: [
      { label: "Audience", value: context?.audience ?? "" },
      { label: "Focus", value: context?.focus ?? "" },
      { label: "Frame", value: presentation.frame },
      { label: "Arrangement", value: presentation.arrangement },
      { label: "Reading order", value: visibleRegions.map(([name]) => name).join(" → ") },
    ],
    stages: [{
      kind: "runtime Blueprint",
      tier: "runtime-doc",
      recipe: "none",
      summary: "Cells project directly to the Kernel document",
    }],
    resources: [{ label: "Projection contexts", value: String(presentation.contexts.length) }],
  };
}

export function projectSocInspection(
  actors: readonly Actor[],
  providers: Readonly<Record<string, AgentProvider>>,
  presentation: Presentation,
  journal: readonly JournalEntry[],
  incident: Incident,
): OrganismInspection {
  return {
    participants: projectSocParticipants(actors, providers),
    presentation: {
      selectedContext: presentation.selectedContext,
      contexts: presentation.contexts,
    },
    blueprint: projectSocBlueprint(presentation),
    timeline: journal.map(socJournalTimelineItem),
    status: incident.status === "Contained"
      ? { kind: "success", message: "Host-A contained under commander authority." }
      : null,
  };
}
