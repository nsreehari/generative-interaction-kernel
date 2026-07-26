import assert from "node:assert/strict";
import { test } from "vitest";
import type { Json } from "@gik/kernel";
import { bundleFromJson, loadBundleRuntime, SharedContextStore } from "@gik/react";
import { t3ScenarioPlan } from "../scenarios/live-workspace-soc-t3/compile";
import { socExecutiveScenarioPlan } from "../scenarios/live-workspace-soc-executive/compile";
import { openSampleBlueprint } from "../shared/blueprints";
import catalog from "../scenarios/catalog.json";
import socBlueprint from "../blueprints/live-workspace-soc/blueprint.json";
import { selectionFromTimelineItem, type ScenarioPlan, type TimelineItem } from "../shared/demo-runner";
import { selectionTargetsActor, selectionTargetsRecord } from "../bundles/live-workspace-soc/projection_views";

import effects, {
  createSocEffects,
  socOrganismEffects,
} from "../bundles/live-workspace-soc/effect_handlers";
import runnerDocument from "../bundles/demo-runner/program.json";
import runnerEffects from "../bundles/demo-runner/effect_handlers";
import runnerManifest from "../bundles/demo-runner/vocabulary.json";
import runnerState from "../bundles/demo-runner/state.json";

function runtime(effectHandlers = effects) {
  const { vocabulary, program, state } = openSampleBlueprint("live-workspace-soc");
  return loadBundleRuntime(bundleFromJson({
    vocabulary: structuredClone(vocabulary),
    program: structuredClone(program),
    state: structuredClone(state),
  }, { effectHandlers }));
}

function demoRuntimes(scenarioPlan: ScenarioPlan = t3ScenarioPlan) {
  const { vocabulary, program, state } = openSampleBlueprint("live-workspace-soc");
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
    inspection: { presentation: { selectedContext: "full-substrate" } },
    presentationContext: { id: "full-substrate", arrangement: "inspection" },
    presentationPresetId: "full-substrate",
  } }]);
  const contexts = { demo: shared, control: shared };
  const soc = loadBundleRuntime(bundleFromJson({
    vocabulary: structuredClone(vocabulary),
    program: structuredClone(program),
    state: structuredClone(state),
  }, { effectHandlers: createSocEffects() }), contexts);
  const runnerSeed = structuredClone(runnerState) as Record<string, unknown>;
  runnerSeed.runner = {
    plan: scenarioPlan,
    catalog: [],
    entry: null,
    presentationPresets: [
      { id: "full-substrate", label: "Full substrate", context: { id: "full-substrate", arrangement: "inspection" } },
      { id: "war-room", label: "War room", context: { id: "war-room", arrangement: "war-room" } },
    ],
  };
  const runner = loadBundleRuntime(bundleFromJson({
    vocabulary: structuredClone(runnerManifest),
    program: structuredClone(runnerDocument),
    state: runnerSeed,
  }, { effectHandlers: runnerEffects }), contexts);
  return { shared, soc, runner };
}

test("SOC organism and demo runner expose independent effect surfaces", () => {
  assert.deepEqual(Object.keys(runnerEffects).sort(), [
    "finishAct",
    "requestNextAct",
    "resetDemo",
    "selectDemo",
    "setPace",
    "setPresentationContext",
  ]);
  assert.equal("establishIntent" in socOrganismEffects, true);
  assert.equal("authorizeContainment" in socOrganismEffects, true);
  assert.equal("requestNextAct" in socOrganismEffects, false);
  assert.equal("setPace" in socOrganismEffects, false);
});

test("demo runner selects and publishes a named presentation context", async () => {
  const { shared, runner } = demoRuntimes();
  await runner.controller.start();

  await runner.controller.emit("presentation-context-dropdown-region", "select", { value: "war-room" });

  assert.equal(shared.get("control.presentationPresetId"), "war-room");
  assert.deepEqual(shared.get("control.presentationContext"), { id: "war-room", arrangement: "war-room" });
  assert.equal(shared.get("control.inspection.presentation.selectedContext"), "war-room");
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

test("SOC presentation presets carry region facets consistent with the blueprint context catalog", () => {
  type Facet = { visible: boolean; rank: number; disclosure: string; group: string };
  type PresetPresentation = {
    selectedContext: string;
    frame: string;
    arrangement: string;
    regionFacets: Record<string, Facet>;
  };
  const presets = (catalog.targets["live-workspace-soc"].presentationPresets ?? []) as Array<{
    id: string;
    context: { soc: { presentation: PresetPresentation } };
  }>;
  const contextCatalog = socBlueprint.payload.runtime.state.soc.presentation.contexts as Array<{
    id: string;
    frame: string;
    arrangement: string;
    regions: string[];
  }>;

  assert.ok(presets.length > 0, "expected SOC presentation presets");
  for (const preset of presets) {
    const presentation = preset.context.soc.presentation;
    const def = contextCatalog.find((entry) => entry.id === preset.id);
    assert.ok(def, `no context catalog entry for preset ${preset.id}`);
    assert.equal(presentation.selectedContext, preset.id);
    assert.equal(presentation.frame, def!.frame);
    assert.equal(presentation.arrangement, def!.arrangement);
    // Visible regions, ordered by rank, match the catalog's region list exactly.
    const visible = Object.entries(presentation.regionFacets)
      .filter(([, facet]) => facet.visible)
      .sort((a, b) => a[1].rank - b[1].rank)
      .map(([name]) => name);
    assert.deepEqual(visible, def!.regions);
    // Regions outside the context are ranked out of the way and omitted.
    for (const [, facet] of Object.entries(presentation.regionFacets)) {
      if (!facet.visible) {
        assert.equal(facet.rank, 50);
        assert.equal(facet.disclosure, "omitted");
      }
    }
  }

  // Spot-check the Priya laptop command view.
  const priyaLaptop = presets.find((preset) => preset.id === "priya-laptop")!.context.soc.presentation;
  assert.equal(priyaLaptop.frame, "laptop");
  assert.equal(priyaLaptop.arrangement, "command");
  assert.equal(priyaLaptop.regionFacets.authorization.disclosure, "summary");
  assert.equal(priyaLaptop.regionFacets.exploration.visible, false);
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

