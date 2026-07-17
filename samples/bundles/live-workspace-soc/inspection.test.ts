import assert from "node:assert/strict";
import { test } from "vitest";

import { mapSocParticipantStatus, projectSocParticipants } from "./inspection";
import type { Actor, AgentProvider } from "./projection_views/types";

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
