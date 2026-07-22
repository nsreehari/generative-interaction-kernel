import { test } from "vitest";
import assert from "node:assert/strict";

import type { Json } from "../../../kernel/src/index";
import { StepOrchestrator } from "../../step-orchestrator/src/step-orchestrator";
import { createProfileAuthoringRegistry, summarizeBlueprint } from "../src/profile-authoring";
import { liveCardsBlueprint } from "../../../samples/catalog/profile-catalog";

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

test("summarizeBlueprint exposes the declared live-cards chain", () => {
  const summary = summarizeBlueprint(liveCardsBlueprint);
  assert.equal(summary?.id, "live-cards");
  assert.deepEqual(summary?.recipes.map((recipe) => recipe.id), [
    "live-cards.interaction-to-presentation",
    "live-cards.presentation-to-runtime",
  ]);
});

test("profile authoring registry composes profile and recipes from graph outputs", async () => {
  const orch = new StepOrchestrator(createProfileAuthoringRegistry());
  const res = await orch.invoke({
    kind: "invoke",
    node: "authoring-node",
    tool: "authorProfilePlan",
    args: {
      objective: "portfolio-review",
      surface: "copilot",
      changedSource: "portfolio",
      consequence: { triggered: ["portfolio"], parallelStages: [["capitalGain", "marketPrices"]], blocked: [] },
      exploratory: { unlocked: ["tenthComplete", "choose12th", "engineering"] },
    },
  });
  const payload = (res?.events?.[0].payload ?? {}) as Record<string, any>;
  assert.equal(res?.events?.[0].name, "authorProfilePlan:planned");
  assert.equal(payload.profile?.id, "portfolio-review-copilot");
  assert.equal(Array.isArray(payload.recipes), true);
  assert.equal(payload.stepHistory?.length, 3);
});

test("artifact-backed authoring mode proposes the profile's concrete recipe chain", async () => {
  const orch = new StepOrchestrator(createProfileAuthoringRegistry());
  const res = await orch.invoke({
    kind: "invoke",
    node: "authoring-node",
    tool: "authorProfilePlan",
    args: {
      objective: "review board",
      surface: "desktop",
      changedSource: "portfolio",
      consequence: { triggered: ["portfolio"], parallelStages: [["capitalGain", "marketPrices"]], blocked: [] },
      exploratory: { unlocked: ["tenthComplete", "choose12th", "engineering"] },
      blueprint: asJson(liveCardsBlueprint),
    },
  });
  const payload = (res?.events?.[0].payload ?? {}) as Record<string, any>;
  assert.equal(payload.profile?.id, "live-cards");
  assert.equal(payload.profileSeed?.source, "blueprint");
  assert.deepEqual(payload.recipes?.map((recipe: any) => recipe.id), [
    "live-cards.interaction-to-presentation",
    "live-cards.presentation-to-runtime",
  ]);
});