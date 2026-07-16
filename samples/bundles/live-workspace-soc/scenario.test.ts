import assert from "node:assert/strict";
import { test } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";

import document from "./document.json";
import effects, { createSocEffects } from "./effect_handlers/index";
import manifest from "./manifest.json";
import state from "./state.json";

function runtime(effectHandlers = effects) {
  return loadBundleRuntime(bundleFromJson({ manifest, document, state }, { effectHandlers }));
}

function foundryFetch(reply: Record<string, unknown> | string): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.endsWith("/api/agent/ping")) return Response.json({ ok: true });
    return Response.json({
      conversationId: "conv-live",
      responseId: "resp-live",
      reply: typeof reply === "string" ? reply : JSON.stringify(reply),
    });
  };
}

function sequencedFoundryFetch(
  replies: Array<Record<string, unknown> | string>,
  requests: Array<Record<string, unknown>>
): typeof fetch {
  let replyIndex = 0;
  return async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/agent/ping")) return Response.json({ ok: true });
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const reply = replies[Math.min(replyIndex, replies.length - 1)];
    replyIndex += 1;
    return Response.json({
      conversationId: "conv-repair",
      responseId: `resp-${replyIndex}`,
      reply: typeof reply === "string" ? reply : JSON.stringify(reply),
    });
  };
}

const correlationReply = {
  schemaVersion: 1,
  operation: "suggest-exploration",
  summary: "Resolve the execution origin through passive correlation.",
  rationale: "The supplied entities remain unresolved.",
  exploration: { objective: "Trace the privileged execution origin", queries: ["Correlate token and session"], constraints: ["Passive only"] },
  findings: [],
  evidenceIds: [],
  entityIds: ["DC-01", "Host-A"],
  confidence: 0.61,
  unknowns: ["Execution origin"],
  recommendedNextStep: "Run passive correlation",
};

test("presenter pace changes one timer and suppresses duplicate act requests", async () => {
  const { controller, state: store } = runtime();
  await controller.start();
  const emit = (name: string, payload: Record<string, unknown> = {}) =>
    controller.emit("soc-workspace", name, payload);

  await emit("setPace", { pace: "auto" });
  assert.deepEqual(store.get("soc.presenter"), {
    pace: "auto",
    durationMs: 2000,
    locked: false,
    advanceToken: 0,
  });

  await controller.emit("next-act-timer-region", "press", { reason: "manual" });
  assert.deepEqual(store.get("soc.presenter"), {
    pace: "auto",
    durationMs: 2000,
    locked: true,
    advanceToken: 1,
  });

  await controller.emit("next-act-timer-region", "press", { reason: "timeout" });
  assert.equal((store.get("soc.presenter") as { advanceToken: number }).advanceToken, 1);

  await emit("finishAct");
  assert.equal((store.get("soc.presenter") as { locked: boolean }).locked, false);
  await emit("reset");
  assert.deepEqual(store.get("soc.presenter"), {
    pace: "manual",
    durationMs: 120000,
    locked: false,
    advanceToken: 0,
  });
  const resetProviders = store.get("soc.agentProviders") as Record<string, { mode: string; conversationId: string }>;
  assert.deepEqual(Object.values(resetProviders).map(({ mode, conversationId }) => ({ mode, conversationId })), [
    { mode: "mock", conversationId: "" },
    { mode: "mock", conversationId: "" },
  ]);
});

test("presentation context changes projection metadata without changing the causal journal", async () => {
  const { controller, state: store } = runtime();
  await controller.start();
  const journalBefore = store.get("soc.journal");

  await controller.emit("soc-workspace", "setPresentationContext", {
    contextId: "priya-laptop",
  });

  const presentation = store.get("soc.presentation") as {
    selectedContext: string;
    revision: number;
  };
  assert.equal(presentation.selectedContext, "priya-laptop");
  assert.equal(presentation.revision, 1);
  assert.deepEqual(store.get("soc.journal"), journalBefore);
});

test("mixed-team scenario preserves attributable steps and commander authority", async () => {
  const { controller, state: store } = runtime();
  await controller.start();
  const emit = (name: string, actorId: string) => controller.emit("soc-workspace", name, {}, actorId);

  await emit("establishIntent", "human-morgan");
  await emit("addConstraint", "human-priya");
  await emit("suggestExploration", "agent-correlation");
  await emit("amendExploration", "human-morgan");
  await emit("replanExploration", "agent-correlation");
  await emit("commitPartialFindings", "agent-correlation");
  await emit("proposeDc01", "agent-response");
  await emit("completeCorrelation", "agent-correlation");
  await emit("proposeHostA", "agent-response");
  await emit("reviseResponse", "human-morgan");
  await emit("calculateResponse", "agent-response");
  await emit("recommendContainment", "human-morgan");

  const actorStatus = (actorId: string) => {
    const actors = store.get("soc.actors") as Array<{ id: string; status: string }>;
    return actors.find((actor) => actor.id === actorId)?.status;
  };
  assert.equal((store.get("soc.proposal") as { target: string }).target, "Host-A");
  assert.equal((store.get("soc.authorization") as { status: string }).status, "pending");
  assert.equal(actorStatus("agent-correlation"), "complete");
  assert.equal(actorStatus("agent-response"), "waiting");
  assert.equal(actorStatus("human-priya"), "input-awaited");
  assert.equal(store.get("soc.act"), 12);
  assert.equal((store.get("soc.journal") as unknown[]).length, 12);

  await emit("authorizeContainment", "human-morgan");
  assert.equal((store.get("soc.authorization") as { status: string }).status, "pending");

  await emit("authorizeContainment", "human-priya");
  assert.equal((store.get("soc.authorization") as { status: string; actorId: string }).actorId, "human-priya");
  assert.equal(actorStatus("human-priya"), "active");
  assert.equal(actorStatus("agent-response"), "waiting");
  assert.equal(store.get("soc.act"), 13);
  assert.equal((store.get("soc.presenter") as { locked: boolean }).locked, false);
  await emit("executeContainment", "agent-response");

  assert.equal(store.get("soc.incident.status"), "Contained");
  assert.equal(store.get("soc.act"), 14);
  assert.equal(actorStatus("agent-response"), "complete");
  const journal = store.get("soc.journal") as Array<{ actorId: string; result: string }>;
  assert.deepEqual(journal.slice(-2).map(({ actorId, result }) => ({ actorId, result })), [
    { actorId: "human-priya", result: "authorized" },
    { actorId: "agent-response", result: "executed" },
  ]);
});

test("live Correlation Agent lowers validated output and records its conversation", async () => {
  const { controller, state: store } = runtime(createSocEffects(foundryFetch(correlationReply), () => "test-key"));
  await controller.start();

  await controller.emit("soc-workspace", "setAgentMode", {
    agentId: "agent-correlation",
    mode: "live",
  });
  await controller.emit("soc-workspace", "suggestExploration", {}, "agent-correlation");

  const exploration = (store.get("soc.explorations") as Array<{ question: string }>)[0];
  const provider = (store.get("soc.agentProviders") as Record<string, { lastProvider: string; conversationId: string }>)["agent-correlation"];
  const journal = store.get("soc.journal") as Array<{ provider: string; responseId: string }>;
  assert.equal(exploration.question, "Trace the privileged execution origin");
  assert.equal(provider.lastProvider, "live");
  assert.equal(provider.conversationId, "conv-live");
  assert.equal(journal.at(-1)?.provider, "live");
  assert.equal(journal.at(-1)?.responseId, "resp-live");
  assert.equal(JSON.stringify(store.get("soc")).includes("test-key"), false);
});

test("SOC requests Foundry access only while a participant agent uses Live mode", async () => {
  const { controller, state: store } = runtime(createSocEffects(foundryFetch(correlationReply), () => ""));
  await controller.start();
  await controller.emit("soc-workspace", "reset", {});

  assert.equal(store.get("soc.foundry.required"), false);
  await controller.emit("soc-workspace", "setAgentMode", { agentId: "agent-correlation", mode: "live" });
  assert.equal(store.get("soc.foundry.required"), true);

  await controller.emit("foundry-access-gate-region", "accessResolved", {
    key: "access-key",
    agentNames: ["SOC-Correlation-Agent", "SOC-Response-Agent"],
  });
  assert.equal(store.get("soc.foundry.key"), "access-key");
  assert.deepEqual(store.get("soc.foundry.agentNames"), ["SOC-Correlation-Agent", "SOC-Response-Agent"]);
  const providers = store.get("soc.agentProviders") as Record<string, { status: string }>;
  assert.equal(providers["agent-correlation"].status, "ready");

  await controller.emit("soc-workspace", "setAgentMode", { agentId: "agent-correlation", mode: "mock" });
  assert.equal(store.get("soc.foundry.required"), false);
});

test("invalid live output falls back visibly to the canonical Mock turn", async () => {
  const { controller, state: store } = runtime(createSocEffects(foundryFetch("not-json"), () => "test-key"));
  await controller.start();
  await controller.emit("soc-workspace", "setAgentMode", { agentId: "agent-correlation", mode: "live" });
  await controller.emit("soc-workspace", "suggestExploration", {}, "agent-correlation");

  const provider = (store.get("soc.agentProviders") as Record<string, { mode: string; status: string; lastProvider: string; fallbackReason: string }>)["agent-correlation"];
  assert.equal(provider.mode, "live");
  assert.equal(provider.status, "fallback");
  assert.equal(provider.lastProvider, "mock");
  assert.match(provider.fallbackReason, /JSON object/);
  assert.equal((store.get("soc.explorations") as Array<{ question: string }>)[0].question, "Where did the privileged session execute?");
});

test("invalid live output is repaired once in the same conversation before lowering", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const fetch = sequencedFoundryFetch(["not-json", correlationReply], requests);
  const { controller, state: store } = runtime(createSocEffects(fetch, () => "test-key"));
  await controller.start();
  await controller.emit("soc-workspace", "setAgentMode", { agentId: "agent-correlation", mode: "live" });
  await controller.emit("soc-workspace", "suggestExploration", {}, "agent-correlation");

  assert.equal(requests.length, 2);
  assert.equal(requests[1].conversationId, "conv-repair");
  assert.match(String(requests[1].message), /Validation errors:/);
  assert.match(String(requests[1].message), /json-object-required/);
  assert.match(String(requests[1].message), /Expected shape:/);
  const provider = (store.get("soc.agentProviders") as Record<string, { lastProvider: string; validationAttempts: number; repaired: boolean; responseId: string }>) ["agent-correlation"];
  assert.equal(provider.lastProvider, "live");
  assert.equal(provider.validationAttempts, 2);
  assert.equal(provider.repaired, true);
  assert.equal(provider.responseId, "resp-2");
  assert.equal((store.get("soc.explorations") as Array<{ question: string }>)[0].question, "Trace the privileged execution origin");
});

test("invalid correction falls back after exactly one repair attempt", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const fetch = sequencedFoundryFetch(["not-json", "still-not-json"], requests);
  const { controller, state: store } = runtime(createSocEffects(fetch, () => "test-key"));
  await controller.start();
  await controller.emit("soc-workspace", "setAgentMode", { agentId: "agent-correlation", mode: "live" });
  await controller.emit("soc-workspace", "suggestExploration", {}, "agent-correlation");

  const provider = (store.get("soc.agentProviders") as Record<string, { lastProvider: string; validationAttempts: number; repaired: boolean; fallbackReason: string; conversationId: string }>) ["agent-correlation"];
  assert.equal(requests.length, 2);
  assert.equal(provider.lastProvider, "mock");
  assert.equal(provider.validationAttempts, 2);
  assert.equal(provider.repaired, false);
  assert.equal(provider.conversationId, "conv-repair");
  assert.match(provider.fallbackReason, /after correction/);
});

test("live Response Agent assessment cannot bypass the local DC-01 policy", async () => {
  const responseReply = {
    schemaVersion: 1,
    operation: "assess-policy-candidate",
    summary: "The protected target requires commander review.",
    proposal: { targetEntityId: "DC-01", objective: "Assess DC-01 isolation", sequence: [], constraints: ["Commander authorization"], blastRadius: "Payroll cutover", operationalDependencies: ["Payroll"], reversible: false, rollbackConsiderations: [], evidenceReady: false, evidenceIds: [] },
    assessment: { policyCompatibility: "incompatible", recommendation: "reject", reasons: ["Protected dependency"] },
    confidence: 0.97,
    unknowns: [],
  };
  const { controller, state: store } = runtime(createSocEffects(foundryFetch(responseReply), () => "test-key"));
  await controller.start();
  await controller.emit("soc-workspace", "setAgentMode", { agentId: "agent-response", mode: "live" });
  await controller.emit("soc-workspace", "proposeDc01", {}, "agent-response");

  const proposal = store.get("soc.proposal") as { status: string; target: string; liveAssessment: string };
  assert.equal(proposal.status, "rejected");
  assert.equal(proposal.target, "DC-01");
  assert.equal(proposal.liveAssessment, responseReply.summary);
});