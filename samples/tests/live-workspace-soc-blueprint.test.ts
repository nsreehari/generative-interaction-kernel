import assert from "node:assert/strict";
import { test } from "vitest";
import { unwrap } from "@gik/kernel";
import { lintLoweringRecipe, type LayerRecipe, type LayerRecipeArtifact } from "@gik/profile";
import { t3ScenarioPlan } from "../scenarios/live-workspace-soc-t3/compile";
import { openSampleBlueprint } from "../shared/blueprints";

import blueprint from "../profiles/live-workspace-soc/blueprint.json" with { type: "json" };
import {
  compileSocDocument,
  compileSocPresentation,
  type SocPresentationContext,
  SOC_BLUEPRINT_PRESENTATION_PRESETS,
  socBlueprint,
  traceSocBlueprint,
} from "../bundles/live-workspace-soc/effect_handlers/blueprint";

function runtimeContext(context: {
  actor: string;
  role: string;
  device: string;
  task: string;
  disclosure: string;
  layout: string;
  frame: string;
  arrangement: string;
}): SocPresentationContext {
  return {
    actor: context.actor,
    role: context.role,
    device: context.device,
    task: context.task,
    disclosure: context.disclosure,
    layout: context.layout,
    frame: context.frame,
    arrangement: context.arrangement,
  };
}

const recipeArtifacts = blueprint.payload.recipes.map((payload) => ({
  gik: "0.1" as const,
  type: "lowering-recipe" as const,
  payload: payload as unknown as LayerRecipe,
})) as LayerRecipeArtifact[];
const runtime = openSampleBlueprint("live-workspace-soc");
const runtimeDocument = unwrap(runtime.program);
const manifest = unwrap(runtime.vocabulary);

test("SOC blueprint owns one connected four-tier lowering chain", () => {
  assert.deepEqual(
    socBlueprint.stages.map((stage) => `${stage.fromLayer.kind}->${stage.toLayer.kind}`),
    ["workflow->interaction", "interaction->presentation", "presentation->runtime-doc"]
  );
  assert.equal(socBlueprint.resources.actors instanceof Array, true);
  assert.equal("acts" in socBlueprint.resources, false);
  assert.equal(t3ScenarioPlan.steps.length, 14);
  assert.equal(SOC_BLUEPRINT_PRESENTATION_PRESETS.length, 9);
});

test("SOC recipes lint against the bundle terminal capability vocabulary", () => {
  const capabilities = manifest.capabilities;
  assert.deepEqual(
    recipeArtifacts.flatMap((artifact) => lintLoweringRecipe(artifact, capabilities)),
    []
  );
});

test("all presentation contexts lower the same substrate through every tier", () => {
  for (const context of SOC_BLUEPRINT_PRESENTATION_PRESETS) {
    const trace = traceSocBlueprint(runtimeContext(context));
    assert.equal(trace.length, 3);
    const interaction = trace[0].output as {
      interaction: string;
      parts: Array<{ name: string; concern: string; participants?: string[]; authority?: string[] }>;
    };
    assert.equal(interaction.interaction, "soc-workspace");
    assert.deepEqual(interaction.parts.map((part) => part.name), [
      "summary",
      "intent",
      "constraints",
      "hypothesis",
      "exploration",
      "evidence",
      "agent-request",
      "response",
      "authorization",
      "causal-record",
    ]);
    assert.equal(interaction.parts.find((part) => part.name === "authorization")?.concern, "governance");
    assert.deepEqual(interaction.parts.find((part) => part.name === "authorization")?.authority, ["authorize-containment"]);
    assert.equal(interaction.parts.find((part) => part.name === "evidence")?.participants?.includes("agent-correlation"), true);
    assert.equal((trace[1].output as { source: { subject: string } }).source.subject, "Privileged access anomaly during payroll cutover");
    const runtime = trace[2].output as { root: { capability: string; edges: { children: unknown[] } } };
    assert.equal(runtime.root.capability, "soc:workspace-shell");
    assert.equal(runtime.root.edges.children.length, 2);
  }
});

test("presentation contexts own distinct inspectable projection contracts", () => {
  const full = SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "full-substrate");
  const board = SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "investigation-board");
  const mobile = SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "priya-mobile");
  const response = SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "response-agent");

  assert.equal(full?.frame, "shared");
  assert.equal(full?.regions.includes("exploration"), true);
  assert.equal(board?.arrangement, "kanban");
  assert.deepEqual(board?.regions, ["intent", "constraints", "hypothesis", "exploration", "evidence", "response", "authorization", "causal-record"]);
  assert.equal(mobile?.device, "mobile");
  assert.equal(mobile?.frame, "mobile");
  assert.equal(mobile?.arrangement, "decision");
  assert.deepEqual(mobile?.regions, ["summary", "authorization", "response", "constraints", "hypothesis"]);
  assert.equal(response?.device, "agent-console");
  assert.equal(response?.regions.includes("exploration"), false);
});

test("lowering recipes select, order, and disclose context facets without materializing them", () => {
  for (const context of SOC_BLUEPRINT_PRESENTATION_PRESETS) {
    const presentation = compileSocPresentation(runtimeContext(context));
    const substrateRegions = presentation.regions.filter((region) => region.materialize === false);
    const visibleNames = substrateRegions.filter((region) => region.disclosure !== "omitted").map((region) => region.name);

    assert.equal(presentation.frame, context.frame);
    assert.equal(presentation.arrangement, context.arrangement);
    assert.deepEqual(visibleNames, context.regions);
    assert.equal(substrateRegions.every((region) => region.materialize === false), true);
  }

  const mobile = compileSocPresentation(runtimeContext(SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "priya-mobile")!));
  assert.deepEqual(
    mobile.regions.filter((region) => region.disclosure !== "omitted" && region.materialize === false).map((region) => [region.name, region.priority, region.disclosure]),
    [
      ["summary", "supporting", "status"],
      ["authorization", "critical", "summary"],
      ["response", "critical", "summary"],
      ["constraints", "supporting", "summary"],
      ["hypothesis", "supporting", "status"],
    ]
  );

  const board = compileSocPresentation(runtimeContext(SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "investigation-board")!));
  assert.deepEqual(
    board.regions.filter((region) => region.disclosure !== "omitted" && region.materialize === false).map((region) => [region.name, region.group]),
    [
      ["intent", "kanban-frame"],
      ["constraints", "kanban-frame"],
      ["hypothesis", "kanban-explore"],
      ["exploration", "kanban-explore"],
      ["evidence", "kanban-establish"],
      ["response", "kanban-decide"],
      ["authorization", "kanban-decide"],
      ["causal-record", "kanban-record"],
    ]
  );
});

test("human contexts lower regions into stable operational groups", () => {
  const warRoom = compileSocPresentation(runtimeContext(SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "war-room")!)).regions.filter((region) => region.disclosure !== "omitted" && region.materialize === false);
  assert.deepEqual(warRoom.map((region) => [region.name, region.concern, region.group]), [
    ["summary", "orientation", "orientation"],
    ["hypothesis", "orientation", "orientation"],
    ["response", "response", "response"],
    ["constraints", "guardrails", "guardrails"],
    ["authorization", "governance", "governance"],
    ["causal-record", "provenance", "provenance"],
  ]);
});

test("presentation lowering assigns semantic visual archetypes", () => {
  const full = compileSocPresentation(runtimeContext(SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "full-substrate")!)).regions;
  assert.deepEqual(full.map((region) => [region.name, region.presentation]), [
    ["summary", "brief"],
    ["intent", "brief"],
    ["constraints", "brief"],
    ["hypothesis", "finding"],
    ["exploration", "collection"],
    ["evidence", "collection"],
    ["agent-request", "agent-request"],
    ["response", "decision"],
    ["authorization", "decision"],
    ["causal-record", "audit"],
  ]);
});

test("agent contexts lower into context, state, request, response, and governed-result groups", () => {
  for (const contextId of ["correlation-agent", "response-agent"]) {
    const visible = compileSocPresentation(runtimeContext(SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === contextId)!)).regions.filter((region) => region.disclosure !== "omitted" && region.materialize === false);
    assert.deepEqual([...new Set(visible.map((region) => region.group))], ["context", "shared-state", "request", "response", "governed-result"]);
    assert.equal(visible.find((region) => region.name === "agent-request")?.presentation, "agent-request");
  }
});

test("substrate chrome owns only the organism runtime projection", () => {
  const body = runtimeDocument.root.edges.children.find((child) => child.id === "soc-workspace");
  assert.ok(body);
  const chrome = body.edges.children[0];
  assert.equal(chrome.capability, "soc:substrate-chrome");
  assert.deepEqual(chrome.edges.read, {
    incident: "soc.incident",
    presentation: "soc.presentation",
    journal: "soc.journal",
    facet: "soc.presentation.regionFacets.summary",
  });
  assert.deepEqual(
    chrome.edges.children.map((child) => [child.capability, child.edges.gate]),
    [
      ["soc:runtime-projection", undefined],
    ]
  );
});

test("the runtime projection owns ordered document-gated context views", () => {
  const body = runtimeDocument.root.edges.children.find((child) => child.id === "soc-workspace");
  assert.ok(body);
  const chrome = body.edges.children.find((child) => child.id === "soc-substrate-chrome");
  assert.ok(chrome);
  const runtimeProjection = chrome.edges.children.find((child) => child.id === "soc-runtime-projection");
  assert.ok(runtimeProjection);
  assert.deepEqual(runtimeProjection.props, { frame: "shared" });
  assert.deepEqual(runtimeProjection.edges.read, {
    presentation: "soc.presentation",
    frame: "soc.presentation.frame",
  });
  assert.deepEqual(
    runtimeProjection.edges.children.map((child) => [child.capability, child.edges.gate]),
    [
      ["soc:presentation-layout", undefined],
    ]
  );
  const layout = runtimeProjection.edges.children.find((child) => child.id === "soc-presentation-layout");
  assert.ok(layout);
  const regions = ["intent", "constraints", "hypothesis", "exploration", "evidence", "agent-request", "response", "authorization", "causal-record"];
  assert.deepEqual(layout.edges.children.map((child) => child.capability), regions.map(() => "soc:region-surface"));
  for (const region of regions) {
    const surface = layout.edges.children.find((child) => child.id === `soc-${region}-surface`);
    assert.ok(surface);
    assert.deepEqual(surface.props?.region, region);
    assert.deepEqual(surface.edges.children.map((child) => child.capability), [`soc:${region}-region`]);
  }
});

test("the Blueprint output remains declarative without host document patches", () => {
  const document = structuredClone(runtimeDocument);
  const children = document.root.edges.children;
  assert.equal(children.some((child) => child.id === "demo-runner-region"), false);
  assert.equal(children.some((child) => child.id === "soc-participants-region"), false);
  assert.equal(children.some((child) => child.id === "foundry-access-gate-region"), false);
  const body = children.find((child) => child.id === "soc-workspace");
  assert.ok(body);
  assert.equal(body.edges.react.length, 17);
  assert.deepEqual(compileSocDocument(runtimeContext(SOC_BLUEPRINT_PRESENTATION_PRESETS.find((context) => context.id === "war-room")!)), runtimeDocument);
});
