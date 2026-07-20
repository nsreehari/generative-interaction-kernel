import type { BlueprintInspection, InspectionParticipant, OrganismInspection, ParticipantStatus } from "../../shared/control-inspection";
import { SOC_BLUEPRINT_PRESENTATION_PRESETS, socBlueprint, traceSocBlueprint } from "../../profiles/live-workspace-soc/compile";
import { socJournalTimelineItem } from "./projection_views/helpers";
import type { Actor, AgentProvider, Incident, JournalEntry, Presentation } from "./projection_views/types";

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
    const provider = providers[actor.id];
    const message = provider?.fallbackReason
      || (provider?.mode === "live" && provider.conversationId ? "Live conversation active" : undefined);
    return {
      id: actor.id,
      kind: actor.kind,
      name: actor.name,
      role: actor.role,
      status: mapSocParticipantStatus(actor.status),
      capabilities: actor.authority ? [actor.authority.replace(/^May /, "Can ")] : undefined,
      focusRef: { namespace: "soc", kind: "actor", id: actor.id },
      settings: provider ? [{
        id: "provider-mode",
        kind: "toggle",
        label: "provider mode",
        value: provider.mode,
        offLabel: "Mock",
        offValue: "mock",
        onLabel: "Live",
        onValue: "live",
        status: provider.status === "fallback" ? "error" : "ready",
        message,
      }] : undefined,
    };
  });
}

export function projectSocBlueprint(selectedContext: string): BlueprintInspection {
  const trace = traceSocBlueprint(selectedContext);
  const context = SOC_BLUEPRINT_PRESENTATION_PRESETS.find((item) => item.id === selectedContext) ?? SOC_BLUEPRINT_PRESENTATION_PRESETS[0];
  const presentation = trace[1].output as { arrangement: string; regions: Array<{ name: string; group?: string; priority: string; disclosure: string }> };
  const visibleRegions = presentation.regions.filter((region) => region.disclosure !== "omitted");
  const summaries = trace.map((item) => {
    const output = item.output as Record<string, unknown>;
    if (item.toKind === "interaction") {
      return `interaction=${String(output.interaction)}\ncapabilities=${JSON.stringify(output.capabilities ?? [])}`;
    }
    if (item.toKind === "presentation") {
      return `arrangement=${String(output.arrangement)}\nreading-order=${visibleRegions.map((region) => region.name).join(" → ")}\ngroups=${[...new Set(visibleRegions.map((region) => region.group ?? "ungrouped"))].join(" → ")}`;
    }
    const root = output.root as { capability?: string; edges?: { children?: unknown[] } } | undefined;
    return `root=${root?.capability ?? "unknown"}\nchildren=${root?.edges?.children?.length ?? 0} · terminal document matches bundle`;
  });

  return {
    title: "Intent to runnable bundle",
    description: "The selected context runs through the organism's authored tiers and terminal document contract.",
    status: "Blueprint and lowering recipes validated",
    contextIds: SOC_BLUEPRINT_PRESENTATION_PRESETS.map((item) => item.id),
    selectedContext: context.id,
    fields: [
      { label: "Role", value: context.role },
      { label: "Device / frame", value: `${context.device} / ${context.frame}` },
      { label: "Task", value: context.task },
      { label: "Disclosure", value: context.disclosure },
      { label: "Layout", value: context.layout },
      { label: "Arrangement", value: presentation.arrangement },
      { label: "Lowered reading order", value: visibleRegions.map((region) => region.name).join(" → ") },
      { label: "Group / priority / disclosure", value: visibleRegions.map((region) => `${region.name}: ${region.group ?? "ungrouped"} / ${region.priority} / ${region.disclosure}`).join(" · ") },
    ],
    stages: trace.map((item, index) => ({
      kind: `${item.fromKind} → ${item.toKind}`,
      tier: `${item.fromLayerId} → ${item.toLayerId}`,
      recipe: String(socBlueprint.stages[index].recipe.id),
      summary: summaries[index],
    })),
    resources: [
      { label: "Actors", value: String((socBlueprint.resources.actors as unknown[]).length) },
      { label: "Projection presets", value: String(SOC_BLUEPRINT_PRESENTATION_PRESETS.length) },
      { label: "Authority rule", value: String((socBlueprint.resources.authorityPolicy as { requiredRole: string }).requiredRole) },
    ],
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
    blueprint: projectSocBlueprint(presentation.selectedContext),
    timeline: journal.map(socJournalTimelineItem),
    status: incident.status === "Contained"
      ? { kind: "success", message: "Host-A contained under commander authority." }
      : null,
  };
}
