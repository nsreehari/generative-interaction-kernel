import assert from "node:assert/strict";
import { test } from "vitest";

import { buildProviderAuthoringPlan } from "./index";

test("graph-driven mode builds consequence/exploratory args without a profile artifact seed", () => {
  const plan = buildProviderAuthoringPlan({
    mode: "graph-driven",
    objective: "Portfolio review authoring",
    surface: "copilot",
    changedSource: "portfolio",
    stream: "mpc",
    profileSeedName: "live-cards",
  });

  assert.equal(plan.profileSeed, null);
  assert.deepEqual(plan.consequenceActivation.parallelStages[0], ["capitalGain", "marketPrices"]);
  assert.ok(plan.exploratoryFrontier.unlocked.includes("engineering"));
  assert.equal("profileArtifact" in plan.args, false);
});

test("profile-artifact mode includes the live-cards profile seed and artifact-backed args", () => {
  const plan = buildProviderAuthoringPlan({
    mode: "profile-artifact",
    objective: "Portfolio review authoring",
    surface: "desktop",
    changedSource: "portfolio",
    stream: "bpc",
    profileSeedName: "live-cards",
  });

  assert.equal(plan.profileSeed?.summary?.id, "live-cards");
  assert.deepEqual(plan.profileSeed?.summary?.recipes.map((recipe) => recipe.id), [
    "live-cards.interaction-to-presentation",
    "live-cards.presentation-to-runtime",
  ]);
  assert.equal(typeof plan.args.blueprint, "object");
  assert.ok(plan.exploratoryFrontier.unlocked.includes("medicine"));
  assert.ok(!plan.exploratoryFrontier.unlocked.includes("engineering"));
});