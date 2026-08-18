import { test } from "vitest";
import assert from "node:assert/strict";

import type { Json } from "../../../kernel/src/index";
import { StepOrchestrator } from "../../step-orchestrator/src/step-orchestrator";
import { createBlueprintAuthoringRegistry, summarizeBlueprint } from "../src/blueprint-authoring";
import blueprintStudioBlueprint from "../../../samples/blueprints/blueprint-studio/blueprint.json" with { type: "json" };

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

test("summarizeBlueprint exposes the canonical runtime Blueprint", () => {
  const summary = summarizeBlueprint(blueprintStudioBlueprint);
  assert.equal(summary?.id, "blueprint-studio");
  assert.deepEqual(summary?.recipes, [{
    id: "studio-domain-to-presentation",
    from: "studio-domain",
    to: "studio-presentation",
  }]);
});

test("blueprint authoring registry composes blueprint and recipes from graph outputs", async () => {
  const orch = new StepOrchestrator(createBlueprintAuthoringRegistry());
  const res = await orch.invoke({
    kind: "invoke",
    node: "authoring-node",
    control: { tool: "authorBlueprintPlan" },
    data: {
      objective: "portfolio-review",
      surface: "copilot",
      changedSource: "portfolio",
      cellImpact: { changedCells: ["portfolio"], stages: [["capitalGain", "marketPrices"]], blockers: [] },
      exploration: { unlocked: ["tenthComplete", "choose12th", "engineering"] },
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
    control: { tool: "authorBlueprintPlan" },
    data: {
      objective: "review board",
      surface: "desktop",
      changedSource: "portfolio",
      cellImpact: { changedCells: ["portfolio"], stages: [["capitalGain", "marketPrices"]], blockers: [] },
      exploration: { unlocked: ["tenthComplete", "choose12th", "engineering"] },
      blueprint: asJson(blueprintStudioBlueprint),
    },
  });
  const payload = (res?.events?.[0].payload ?? {}) as Record<string, any>;
  assert.equal(payload.blueprint?.id, "blueprint-studio");
  assert.equal(payload.blueprintSeed?.source, "blueprint");
  assert.deepEqual(payload.recipes?.map(({ id, from, to }: Record<string, unknown>) => ({ id, from, to })), [{
    id: "studio-domain-to-presentation",
    from: "studio-domain",
    to: "studio-presentation",
  }]);
});