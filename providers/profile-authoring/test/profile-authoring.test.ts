import { test } from "vitest";
import assert from "node:assert/strict";

import type { Json } from "../../../kernel/src/index";
import { loadProfile, type LoweringRecipeArtifact, type ProfileArtifact } from "@gik/profile";
import { StepOrchestrator } from "../../step-orchestrator/src/step-orchestrator";
import { createProfileAuthoringRegistry, summarizeProfileArtifacts } from "../src/profile-authoring";
import liveCardsProfileJson from "../../../samples/profiles/live-cards/profile.json" with { type: "json" };
import liveCardsInteractionRecipeJson from "../../../samples/profiles/live-cards/interaction-to-presentation.recipe.json" with { type: "json" };
import liveCardsRuntimeRecipeJson from "../../../samples/profiles/live-cards/presentation-to-runtime.recipe.json" with { type: "json" };

const liveCardsProfileArtifact = liveCardsProfileJson as ProfileArtifact;
const liveCardsRecipeArtifacts = [
  liveCardsInteractionRecipeJson as LoweringRecipeArtifact,
  liveCardsRuntimeRecipeJson as LoweringRecipeArtifact,
] as const;

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

test("summarizeProfileArtifacts exposes the declared live-cards chain", () => {
  const summary = summarizeProfileArtifacts(liveCardsProfileArtifact, liveCardsRecipeArtifacts);
  assert.equal(summary?.id, "live-cards");
  assert.deepEqual(summary?.recipeRefs.map((ref) => ref.id), [
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
      profileArtifact: asJson(liveCardsProfileArtifact),
      recipeArtifacts: asJson([...liveCardsRecipeArtifacts]),
    },
  });
  const payload = (res?.events?.[0].payload ?? {}) as Record<string, any>;
  assert.equal(payload.profile?.id, "live-cards");
  assert.equal(payload.profileSeed?.source, "artifact");
  assert.deepEqual(payload.recipes?.map((recipe: any) => recipe.id), [
    "live-cards.interaction-to-presentation",
    "live-cards.presentation-to-runtime",
  ]);
});