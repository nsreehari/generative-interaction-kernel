import assert from "node:assert/strict";
import { test } from "vitest";

import { openSampleBlueprint } from "../shared/blueprints";
import { mapSocParticipantStatus, projectSocInspection, projectSocParticipants } from "../bundles/live-workspace-soc/effect_handlers/inspection";
import type { Actor, AgentProvider, Incident, JournalEntry, Presentation } from "../bundles/live-workspace-soc/projection_views/types";

const initialState = openSampleBlueprint("live-workspace-soc").state as unknown as {
  soc: Record<string, unknown>;
};

test("SOC participant statuses lower to the neutral inspection vocabulary", () => {
  assert.equal(mapSocParticipantStatus("active"), "active");
  assert.equal(mapSocParticipantStatus("running"), "working");
  assert.equal(mapSocParticipantStatus("needs-review"), "input-required");
  assert.equal(mapSocParticipantStatus("complete"), "completed");
  assert.equal(mapSocParticipantStatus("fallback"), "error");
  assert.equal(mapSocParticipantStatus("domain-specific-state"), "available");
});

test("SOC projects human and agent data into neutral participants and settings", () => {
  const actors: Actor[] = [
    { id: "human-1", kind: "human", name: "Human", role: "Reviewer", status: "active", objective: "Review", authority: "May approve" },
    { id: "agent-1", kind: "agent", name: "Agent", role: "Research", status: "waiting", objective: "Research", authority: "May investigate" },
  ];
  const providers: Record<string, AgentProvider> = {
    "agent-1": { mode: "live", status: "fallback", agentName: "internal-name", conversationId: "", responseId: "", lastProvider: "mock", fallbackReason: "Unavailable" },
  };

  const participants = projectSocParticipants(actors, providers);
  assert.deepEqual(participants[0], {
    id: "human-1",
    kind: "human",
    name: "Human",
    role: "Reviewer",
    status: "active",
    capabilities: ["Can approve"],
    focusRef: { namespace: "soc", kind: "actor", id: "human-1" },
    settings: undefined,
  });
  assert.equal(participants[1].status, "waiting");
  assert.deepEqual(participants[1].settings, [{
    id: "provider-mode",
    kind: "toggle",
    label: "provider mode",
    value: "live",
    offLabel: "Mock",
    offValue: "mock",
    onLabel: "Live",
    onValue: "live",
    status: "error",
    message: "Unavailable",
  }]);
});

test("SOC publishes presentation, blueprint, and timeline through neutral inspection", () => {
  const soc = initialState.soc;
  const inspection = projectSocInspection(
    soc.actors as Actor[],
    soc.agentProviders as unknown as Record<string, AgentProvider>,
    soc.presentation as unknown as Presentation,
    soc.journal as JournalEntry[],
    soc.incident as Incident,
  );

  assert.equal(inspection.presentation?.selectedContext, "full-substrate");
  assert.equal(inspection.presentation?.contexts.length, 9);
  assert.equal(inspection.blueprint?.selectedContext, "full-substrate");
  assert.equal(inspection.blueprint?.stages.length, 3);
  assert.equal(inspection.blueprint?.resources.find((item) => item.label === "Projection presets")?.value, "9");
  assert.deepEqual(inspection.timeline, []);
  assert.equal(inspection.status, null);
});
