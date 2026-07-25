import { test } from "vitest";
import assert from "node:assert/strict";

import type { Json } from "../../../kernel/src/index";
import { StepOrchestrator } from "../../step-orchestrator/src/step-orchestrator";
import { createBlueprintAuthoringRegistry, summarizeBlueprint } from "../src/blueprint-authoring";
import samplesOverviewBlueprint from "../../../samples/blueprints/samples-overview/blueprint.json" with { type: "json" };

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

test("summarizeBlueprint exposes the canonical runtime Blueprint", () => {
  const summary = summarizeBlueprint(samplesOverviewBlueprint);
  assert.equal(summary?.id, "samples-overview");
  assert.deepEqual(summary?.recipes, []);
});

test("blueprint authoring registry composes blueprint and recipes from graph outputs", async () => {
  const orch = new StepOrchestrator(createBlueprintAuthoringRegistry());
  const res = await orch.invoke({
    kind: "invoke",
    node: "authoring-node",
    tool: "authorBlueprintPlan",
    args: {
      objective: "portfolio-review",
      surface: "copilot",
      changedSource: "portfolio",
      consequence: { triggered: ["portfolio"], parallelStages: [["capitalGain", "marketPrices"]], blocked: [] },
      exploratory: { unlocked: ["tenthComplete", "choose12th", "engineering"] },
    },
  });
  const payload = (res?.events?.[0].payload ?? {}) as Record<string, any>;
  assert.equal(res?.events?.[0].name, "authorBlueprintPlan:planned");
  assert.equal(payload.blueprint?.id, "portfolio-review-copilot");
  assert.equal(Array.isArray(payload.recipes), true);
  assert.equal(payload.stepHistory?.length, 3);
});

test("artifact-backed authoring mode proposes the blueprint's concrete recipe chain", async () => {
  const orch = new StepOrchestrator(createBlueprintAuthoringRegistry());
  const res = await orch.invoke({
    kind: "invoke",
    node: "authoring-node",
    tool: "authorBlueprintPlan",
    args: {
      objective: "review board",
      surface: "desktop",
      changedSource: "portfolio",
      consequence: { triggered: ["portfolio"], parallelStages: [["capitalGain", "marketPrices"]], blocked: [] },
      exploratory: { unlocked: ["tenthComplete", "choose12th", "engineering"] },
      blueprint: asJson(samplesOverviewBlueprint),
    },
  });
  const payload = (res?.events?.[0].payload ?? {}) as Record<string, any>;
  assert.equal(payload.blueprint?.id, "samples-overview");
  assert.equal(payload.blueprintSeed?.source, "blueprint");
  assert.deepEqual(payload.recipes, []);
});