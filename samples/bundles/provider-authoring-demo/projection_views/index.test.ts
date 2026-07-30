import assert from "node:assert/strict";
import { test } from "vitest";

import { buildProviderAuthoringPlan } from "./providerAuthoringDemoLeaves";

test("graph-driven mode builds Cell impact and exploration args without a Blueprint artifact seed", () => {
  const plan = buildProviderAuthoringPlan({
    mode: "graph-driven",
    objective: "Portfolio review authoring",
    surface: "copilot",
    changedSource: "portfolio",
    stream: "mpc",
    blueprintSeedName: "samples-overview",
  });

  assert.equal(plan.blueprintSeed, null);
  assert.deepEqual(plan.cellImpact.stages[0], ["capitalGain", "marketPrices"]);
  assert.ok(plan.explorationFrontier.unlocked.includes("engineering"));
  assert.equal("blueprintArtifact" in plan.args, false);
});

test("blueprint-artifact mode includes the samples-overview seed and artifact-backed args", () => {
  const plan = buildProviderAuthoringPlan({
    mode: "blueprint-artifact",
    objective: "Portfolio review authoring",
    surface: "desktop",
    changedSource: "portfolio",
    stream: "bpc",
    blueprintSeedName: "samples-overview",
  });

  assert.equal(plan.blueprintSeed?.summary?.id, "samples-overview");
  assert.deepEqual(plan.blueprintSeed?.summary?.recipes, []);
  assert.equal(typeof plan.args.blueprint, "object");
  assert.ok(plan.explorationFrontier.unlocked.includes("medicine"));
  assert.ok(!plan.explorationFrontier.unlocked.includes("engineering"));
});