import assert from "node:assert/strict";
import { test } from "vitest";
import { lintLoweringRecipe, type LayerRecipeArtifact } from "@gik/profile";
import { t3ScenarioPlan } from "../../scenarios/live-workspace-soc-t3/compile";

import runtimeDocument from "../../bundles/live-workspace-soc/document.json" with { type: "json" };
import manifest from "../../bundles/live-workspace-soc/manifest.json" with { type: "json" };
import interactionRecipe from "./interaction-to-presentation.recipe.json" with { type: "json" };
import runtimeRecipe from "./presentation-to-runtime.recipe.json" with { type: "json" };
import workflowRecipe from "./workflow-to-interaction.recipe.json" with { type: "json" };
import {
  compileSocDocument,
  compileSocPresentation,
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
  assert.equal("acts" in socBlueprint.resources, false);
  assert.equal(t3ScenarioPlan.steps.length, 14);
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
    const runtime = trace[2].output as { root: { capability: string; edges: { children: unknown[] } } };
    assert.equal(runtime.root.capability, "soc:workspace-shell");
    assert.equal(runtime.root.edges.children.length, 3);
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
  assert.deepEqual(mobile?.regions, ["summary", "authorization", "response", "constraints", "hypothesis"]);
  assert.equal(response?.device, "agent-console");
  assert.equal(response?.regions.includes("exploration"), false);
});

test("lowering recipes select, order, and disclose context facets without materializing them", () => {
  for (const context of SOC_BLUEPRINT_CONTEXTS) {
    const presentation = compileSocPresentation(context.id);
    const substrateRegions = presentation.regions.filter((region) => region.materialize === false);
    const visibleNames = substrateRegions.filter((region) => region.disclosure !== "omitted").map((region) => region.name);

    assert.equal(presentation.arrangement, context.arrangement);
    assert.deepEqual(visibleNames, context.regions);
    assert.equal(substrateRegions.every((region) => region.materialize === false), true);
  }

  const mobile = compileSocPresentation("priya-mobile");
  assert.deepEqual(
    mobile.regions.filter((region) => region.disclosure !== "omitted" && region.materialize === false).map((region) => [region.name, region.priority, region.disclosure]),
    [
      ["summary", "supporting", "decision-summary"],
      ["authorization", "critical", "decision-summary"],
      ["response", "critical", "decision-summary"],
      ["constraints", "supporting", "decision-summary"],
      ["hypothesis", "supporting", "decision-summary"],
    ]
  );
});

test("agent contexts lower into context, state, request, response, and governed-result groups", () => {
  for (const contextId of ["correlation-agent", "response-agent"]) {
    const visible = compileSocPresentation(contextId).regions.filter((region) => region.disclosure !== "omitted" && region.materialize === false);
    assert.deepEqual([...new Set(visible.map((region) => region.group))], ["context", "shared-state", "request", "response", "governed-result"]);
    assert.equal(visible.find((region) => region.name === "agent-request")?.presentation, "agent-request");
  }
});

test("the base runtime preserves the organism Blueprint output behind host integration edges", () => {
  const runtime = structuredClone(runtimeDocument.payload);
  const children = runtime.root.edges.children;
  const runnerIndex = children.findIndex((child) => child.id === "demo-runner-region");
  assert.notEqual(runnerIndex, -1);
  assert.deepEqual(children.splice(runnerIndex, 1), [{
    capability: "ui:embed",
    id: "demo-runner-region",
    props: { app: "demo-runner", unframed: true },
    edges: { gate: "demo.enabled = true" },
  }]);
  const accessGateIndex = children.findIndex((child) => child.id === "foundry-access-gate-region");
  assert.notEqual(accessGateIndex, -1);
  assert.deepEqual(children.splice(accessGateIndex, 1), [{
    capability: "foundry:access-modal",
    id: "foundry-access-gate-region",
    props: { proxyBaseUrl: "https://sz-foundry-proxy.azurewebsites.net" },
    edges: {
      read: { required: "soc.foundry.required" },
      on: {
        accessResolved: [{ do: "invoke", args: { tool: "acceptSocFoundryAccess" } }],
        accessCleared: [{ do: "invoke", args: { tool: "clearSocFoundryAccess" } }],
      },
    },
  }]);
  const body = children.find((child) => child.id === "soc-workspace");
  assert.ok(body);
  assert.equal(body.edges.react.length, 14);
  delete body.edges.react;
  delete body.edges.on.reset;
  delete body.edges.on.selectTimeline;
  delete body.edges.on.clearTimelineSelection;
  delete body.edges.read.demoEnabled;
  delete body.edges.read.demoTimeline;
  delete body.edges.read.demoSelection;

  const journal = body.edges.children.find((child) => child.id === "soc-journal-region");
  assert.ok(journal);
  delete journal.edges.on.selectTimeline;
  delete journal.edges.on.clearTimelineSelection;
  delete journal.edges.read.demoEnabled;
  delete journal.edges.read.demoTimeline;
  delete journal.edges.read.demoSelection;

  const participants = children.find((child) => child.id === "soc-participants-region");
  assert.ok(participants);
  delete participants.edges.read.demoSelection;
  assert.deepEqual(compileSocDocument("war-room"), runtime);
});
