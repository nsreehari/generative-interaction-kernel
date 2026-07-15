import assert from "node:assert/strict";
import { test } from "vitest";
import { lintLoweringRecipe, type LayerRecipeArtifact } from "@gik/profile";

import runtimeDocument from "../../bundles/live-workspace-soc/document.json" with { type: "json" };
import manifest from "../../bundles/live-workspace-soc/manifest.json" with { type: "json" };
import interactionRecipe from "./interaction-to-presentation.recipe.json" with { type: "json" };
import runtimeRecipe from "./presentation-to-runtime.recipe.json" with { type: "json" };
import workflowRecipe from "./workflow-to-interaction.recipe.json" with { type: "json" };
import {
  compileSocDocument,
  SOC_BLUEPRINT_CONTEXTS,
  socBlueprint,
  traceSocBlueprint,
} from "./compile";

const recipeArtifacts = [workflowRecipe, interactionRecipe, runtimeRecipe] as LayerRecipeArtifact[];

test("SOC blueprint owns one connected four-tier lowering chain", () => {
  assert.deepEqual(
    socBlueprint.stages.map((stage) => `${stage.fromLayer.kind}->${stage.toLayer.kind}`),
    ["workflow->interaction", "interaction->presentation", "presentation->runtime-doc"]
  );
  assert.equal(socBlueprint.resources.actors instanceof Array, true);
  assert.equal((socBlueprint.resources.acts as unknown[]).length, 14);
  assert.equal(SOC_BLUEPRINT_CONTEXTS.length, 8);
});

test("SOC recipes lint against the bundle terminal capability vocabulary", () => {
  const capabilities = manifest.payload.capabilities;
  assert.deepEqual(
    recipeArtifacts.flatMap((artifact) => lintLoweringRecipe(artifact, capabilities)),
    []
  );
});

test("all presentation contexts lower the same substrate through every tier", () => {
  for (const context of SOC_BLUEPRINT_CONTEXTS) {
    const trace = traceSocBlueprint(context.id);
    assert.equal(trace.length, 3);
    assert.equal((trace[0].output as { interaction: string }).interaction, "soc-workspace");
    assert.equal((trace[1].output as { source: { subject: string } }).source.subject, "Privileged access anomaly during payroll cutover");
    assert.equal((trace[2].output as { root: { capability: string } }).root.capability, "soc:workspace");
  }
});

test("presentation contexts own distinct inspectable projection contracts", () => {
  const full = SOC_BLUEPRINT_CONTEXTS.find((context) => context.id === "full-substrate");
  const mobile = SOC_BLUEPRINT_CONTEXTS.find((context) => context.id === "priya-mobile");
  const response = SOC_BLUEPRINT_CONTEXTS.find((context) => context.id === "response-agent");

  assert.equal(full?.frame, "shared");
  assert.equal(full?.regions.includes("exploration"), true);
  assert.equal(mobile?.device, "mobile");
  assert.equal(mobile?.frame, "mobile");
  assert.equal(mobile?.arrangement, "decision");
  assert.deepEqual(mobile?.regions, ["summary", "constraints", "hypothesis", "response", "authorization"]);
  assert.equal(response?.device, "agent-console");
  assert.equal(response?.regions.includes("exploration"), false);
});

test("the checked-in runtime document is the war-room blueprint output", () => {
  assert.deepEqual(compileSocDocument("war-room"), runtimeDocument.payload);
});
