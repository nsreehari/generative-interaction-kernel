import assert from "node:assert/strict";
import { test } from "vitest";
import type { Json } from "@gik/kernel";
import { bundleFromJson, loadBundleRuntime, SharedContextStore } from "@gik/react";
import { t3ScenarioPlan } from "../../scenarios/live-workspace-soc-t3/compile";
import { socExecutiveScenarioPlan } from "../../scenarios/live-workspace-soc-executive/compile";
import { selectionFromTimelineItem, type ScenarioPlan, type TimelineItem } from "../../shared/demo-runner";
import { selectionTargetsActor, selectionTargetsRecord } from "./projection_views";

import document from "./document.json";
import effects, {
  createSocEffects,
  socOrganismEffects,
} from "./effect_handlers/index";
import runnerDocument from "../demo-runner/document.json";
import runnerEffects from "../demo-runner/effect_handlers/index";
import runnerManifest from "../demo-runner/manifest.json";
import runnerState from "../demo-runner/state.json";
import manifest from "./manifest.json";
import state from "./state.json";

function runtime(effectHandlers = effects) {
  return loadBundleRuntime(bundleFromJson({
    manifest: structuredClone(manifest),
    document: structuredClone(document),
    state: structuredClone(state),
  }, { effectHandlers }));
}

function demoRuntimes(scenarioPlan: ScenarioPlan = t3ScenarioPlan) {
  const shared = SharedContextStore.create(["demo", "control"]);
  shared.apply([{ op: "set", path: "demo", value: {
    enabled: true,
    act: 0,
    presenter: { pace: "auto", durationMs: 2000, locked: false, advanceToken: 0 },
    request: null,
    timeline: [],
    selection: null,
  } }, { op: "set", path: "control", value: {
    request: null,
    receipt: null,
    commands: {},
  } }]);
  const contexts = { demo: shared, control: shared };
  const soc = loadBundleRuntime(bundleFromJson({
    manifest: structuredClone(manifest),
    document: structuredClone(document),
    state: structuredClone(state),
  }, { effectHandlers: createSocEffects() }), contexts);
  const runnerSeed = structuredClone(runnerState) as Record<string, unknown>;
  runnerSeed.runner = { plan: scenarioPlan, catalog: [], entry: null };
  const runner = loadBundleRuntime(bundleFromJson({
    manifest: structuredClone(runnerManifest),
    document: structuredClone(runnerDocument),
    state: runnerSeed,
  }, { effectHandlers: runnerEffects }), contexts);
  return { shared, soc, runner };
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

test("SOC organism and demo runner expose independent effect surfaces", () => {
  assert.deepEqual(Object.keys(runnerEffects).sort(), [
    "finishAct",
    "requestNextAct",
    "resetDemo",
    "selectDemo",
    "setPace",
  ]);
  assert.equal("establishIntent" in socOrganismEffects, true);
  assert.equal("authorizeContainment" in socOrganismEffects, true);
  assert.equal("requestNextAct" in socOrganismEffects, false);
  assert.equal("setPace" in socOrganismEffects, false);
});

test("runner command mailbox advances only after the SOC effect acknowledges it", async () => {
  const { shared, soc, runner } = demoRuntimes();
  await soc.controller.start();
  await runner.controller.start();

  await runner.controller.emit("presenter-pace-toggle-region", "toggle", {
    pressed: true,
    value: "auto",
  });
  assert.deepEqual(shared.get("demo.presenter"), {
    pace: "auto",
    durationMs: 2000,
    locked: false,
    advanceToken: 0,
  });

  await runner.controller.emit("next-act-timer-region", "press", { reason: "manual" });
  assert.deepEqual(shared.get("demo.presenter"), {
    pace: "auto",
    durationMs: 2000,
    locked: true,
    advanceToken: 1,
  });
  assert.equal(shared.get("control.receipt"), null);
  await soc.controller.resync();
  assert.deepEqual(shared.get("control.receipt.token"), 1);
  assert.deepEqual(shared.get("control.receipt.command"), "establishIntent");
  assert.deepEqual(shared.get("control.receipt.status"), "completed");
  assert.equal(soc.state.get("soc.intent.statement"), "Determine the execution origin, contain safely, preserve evidence.");
  await runner.controller.resync();
  await runner.controller.emit("demo-runner", "finishAct");
  const correlated = shared.get("demo.timeline") as unknown as TimelineItem[];
  assert.deepEqual(correlated.map((item) => item.source), ["scenario", "organism"]);
  assert.equal(correlated[0].correlationId, correlated[1].correlationId);
  assert.equal(shared.get("demo.act"), 1);
  assert.equal(shared.get("demo.presenter.locked"), false);
});

test("executive scenario uses the same runner timeline and semantic focus broker", async () => {
  const { shared, soc, runner } = demoRuntimes(socExecutiveScenarioPlan);
  await soc.controller.start();
  await runner.controller.start();

  for (const [index, step] of socExecutiveScenarioPlan.steps.slice(0, 3).entries()) {
    await runner.controller.emit("next-act-timer-region", "press", { reason: "manual" });
    assert.equal(shared.get("demo.presenter.locked"), true);
    for (const command of step.commands ?? []) {
      await soc.controller.resync();
      const request = shared.get("demo.request") as { token: number; command: string };
      assert.equal(request.command, command);
      assert.equal(shared.get("control.receipt.token"), request.token);
      assert.equal(shared.get("control.receipt.command"), command);
      assert.equal(shared.get("control.receipt.status"), "completed");
      await runner.controller.resync();
      await runner.controller.emit("demo-runner", "finishAct");
    }
    assert.equal(shared.get("demo.act"), index + 1);
  }

  const timelineBeforeGate = shared.get("demo.timeline") as unknown as TimelineItem[];
  assert.equal(timelineBeforeGate[0].title, "Frame the protected business objective");
  assert.equal(timelineBeforeGate.length, 15);
  assert.equal(timelineBeforeGate.filter((item) => item.source === "scenario").length, 3);
  assert.equal(timelineBeforeGate.filter((item) => item.source === "organism").length, 12);
  for (const organismItem of timelineBeforeGate.filter((item) => item.source === "organism")) {
    assert.ok(timelineBeforeGate.some((item) => item.source === "scenario" && item.correlationId === organismItem.correlationId));
  }

  const selection = selectionFromTimelineItem(timelineBeforeGate[0]);
  shared.apply([{ op: "set", path: "demo.selection", value: selection as unknown as Json }]);
  assert.deepEqual(shared.get("demo.selection"), selection);
  assert.equal(selectionTargetsRecord(selection, ["intent"]), true);
  assert.equal(selectionTargetsRecord(selection, ["constraints"]), true);
  assert.equal(selectionTargetsRecord(selection, ["authorization"]), false);

  await runner.controller.emit("next-act-timer-region", "press", { reason: "manual" });
  assert.equal((shared.get("demo.request") as { command: string }).command, "$human-gate");
  assert.equal(shared.get("demo.act"), 3);
  await soc.controller.emit("soc-workspace", "authorizeContainment", {}, "human-priya");
  const gateRequest = shared.get("demo.request") as { token: number };
  assert.equal(shared.get("control.receipt.token"), gateRequest.token);
  assert.equal(shared.get("control.receipt.command"), "$human-gate");
  assert.equal(shared.get("control.receipt.status"), "completed");
  await runner.controller.resync();
  await runner.controller.emit("demo-runner", "finishAct");
  assert.equal(shared.get("demo.act"), 4);

  await runner.controller.emit("next-act-timer-region", "press", { reason: "manual" });
  await soc.controller.resync();
  await runner.controller.resync();
  await runner.controller.emit("demo-runner", "finishAct");
  assert.equal(shared.get("demo.act"), 5);
  assert.equal(shared.get("demo.presenter.locked"), true);
  assert.equal(soc.state.get("soc.incident.status"), "Contained");

  const completedTimeline = shared.get("demo.timeline") as unknown as TimelineItem[];
  assert.equal(completedTimeline.length, 19);
  const gateScenario = completedTimeline.find((item) => item.scenarioStepId === "authorize");
  const gateOrganism = completedTimeline.find((item) => item.operationRecordId === "j-13");
  assert.equal(gateScenario?.status, "complete");
  assert.equal(gateScenario?.correlationId, gateOrganism?.correlationId);
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
    frame: string;
    arrangement: string;
    regionFacets: Record<string, {
      visible: boolean;
      rank: number;
      priority: string;
      disclosure: string;
      concern: string;
      group: string;
      presentation: string;
    }>;
  };
  assert.equal(presentation.selectedContext, "priya-laptop");
  assert.equal(presentation.revision, 1);
  assert.equal(presentation.frame, "laptop");
  assert.equal(presentation.arrangement, "command");
  assert.deepEqual(presentation.regionFacets.authorization, {
    visible: true,
    rank: 5,
    priority: "supporting",
    disclosure: "summary",
    concern: "governance",
    group: "governance",
    presentation: "decision",
  });
  assert.deepEqual(presentation.regionFacets.exploration, {
    visible: false,
    rank: 50,
    priority: "supporting",
    disclosure: "omitted",
    concern: "investigation",
    group: "investigation",
    presentation: "collection",
  });

  await controller.emit("soc-workspace", "setPresentationContext", {
    contextId: "investigation-board",
  });
  const board = store.get("soc.presentation") as typeof presentation;
  assert.equal(board.selectedContext, "investigation-board");
  assert.equal(board.revision, 2);
  assert.equal(board.frame, "shared");
  assert.equal(board.arrangement, "kanban");
  assert.equal(board.regionFacets.summary.visible, false);
  assert.deepEqual(
    ["intent", "constraints", "hypothesis", "exploration", "evidence", "response", "authorization", "causal-record"]
      .map((region) => [region, board.regionFacets[region].rank, board.regionFacets[region].group]),
    [
      ["intent", 0, "kanban-frame"],
      ["constraints", 1, "kanban-frame"],
      ["hypothesis", 2, "kanban-explore"],
      ["exploration", 3, "kanban-explore"],
      ["evidence", 4, "kanban-establish"],
      ["response", 5, "kanban-decide"],
      ["authorization", 6, "kanban-decide"],
      ["causal-record", 7, "kanban-record"],
    ],
  );
  assert.equal(store.get("control.inspection.presentation.selectedContext"), "investigation-board");
  assert.equal(store.get("control.inspection.blueprint.selectedContext"), "investigation-board");
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
  assert.equal((store.get("soc.journal") as unknown[]).length, 12);

  await emit("authorizeContainment", "human-morgan");
  assert.equal((store.get("soc.authorization") as { status: string }).status, "pending");

  await emit("authorizeContainment", "human-priya");
  assert.equal((store.get("soc.authorization") as { status: string; actorId: string }).actorId, "human-priya");
  assert.equal(actorStatus("human-priya"), "active");
  assert.equal(actorStatus("agent-response"), "waiting");
  await emit("executeContainment", "agent-response");

  assert.equal(store.get("soc.incident.status"), "Contained");
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

  assert.equal(store.get("soc.foundry.required"), false);
  await controller.emit("soc-workspace", "setAgentMode", { agentId: "agent-correlation", mode: "live" });
  assert.equal(store.get("soc.foundry.required"), true);

  await controller.emit("foundry-access-gate-region", "accessResolved", {
    key: "access-key",
    agentNames: ["SOC-Correlation-Agent", "SOC-Response-Agent"],
  });
  assert.equal(store.get("soc.foundry.key"), null);
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