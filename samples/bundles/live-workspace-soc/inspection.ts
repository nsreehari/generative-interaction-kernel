import type { InspectionParticipant, ParticipantStatus } from "../../shared/control-inspection";
import type { Actor, AgentProvider } from "./projection_views/types";

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
