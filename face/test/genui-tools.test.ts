// Integration proof of the DECLARATIVE genui tool contribution: the generic face engine
// (`toolsFromProfile`) + the genui profile's declared `authoring.tools` + the genui registry
// materialize into the same five MCP tools face used to hardcode — but now face carries no genui
// vocabulary, and the tools are a data-driven projection of the genui profile artifact.

import assert from "node:assert/strict";
import { test } from "vitest";

import { toolsFromProfile } from "../src/pure/profile-tools";
import { createStatelessAgentFaceDispatcher } from "../src/projections/agentface";
import type { ProfileArtifact } from "../../packages/profile/src/profile-core";
import {
  genuiAuthoringRegistry,
  planPresentationWithRecipe,
  recipeForLayerKinds,
} from "../../samples/profiles/genui";
import liveCardsProfileJson from "../../samples/profiles/live-cards/profile.json" with { type: "json" };
import { liveCardsProfile } from "./live-cards-fixture";

const genuiTools = toolsFromProfile((liveCardsProfileJson as ProfileArtifact).payload, genuiAuthoringRegistry);
const byName = new Map(genuiTools.map((t) => [t.name, t]));
const liveCardsIToP = recipeForLayerKinds(liveCardsProfile, "interaction", "presentation");

const report = (name: string, args: Record<string, unknown>) =>
  byName.get(name)!.handler(args) as { ok: boolean; errors: { detail: string }[]; warnings: { code: string }[] };

test("declares the five genui authoring tools, all agent-safe", () => {
  assert.deepEqual(
    genuiTools.map((t) => t.name).sort(),
    ["describeInteractions", "intentToEdits", "validateIntent", "validateInteraction", "validatePresentation"]
  );
  assert.ok(genuiTools.every((t) => t.agentSafe === true));
});

test("describe (op:describe) projects the interaction catalog", () => {
  const kinds = byName.get("describeInteractions")!.handler({}) as {
    interaction: string;
    facets: { name: string; required: boolean }[];
  }[];
  assert.ok(kinds.length >= 12);
  const review = kinds.find((k) => k.interaction === "review");
  assert.ok(review && review.facets.some((f) => f.name === "summary" && f.required));
});

test("validateInteraction (op:validate) runs fully from the declarative interaction form", () => {
  assert.equal(report("validateInteraction", { spec: { interaction: "review", subject: "pr" } }).ok, true);
  assert.equal(report("validateInteraction", { spec: { interaction: "bogus", subject: "x" } }).ok, false);
  assert.equal(report("validateInteraction", { spec: { interaction: "review" } }).ok, false);
  const codes = new Set(
    report("validateInteraction", {
      spec: { interaction: "review", subject: "pr", capabilities: ["summary", "ghost"] },
    }).warnings.map((w) => w.code)
  );
  assert.ok(codes.has("synthesized-facet"));
  const dataCodes = new Set(
    report("validateInteraction", {
      spec: { interaction: "review", subject: "pr", data: { ghost: "$.ghost" } },
    }).warnings.map((w) => w.code)
  );
  assert.ok(dataCodes.has("data-for-unknown-facet"));
  const viewCodes = new Set(
    report("validateInteraction", {
      spec: { interaction: "review", subject: "pr", facetViews: { ghost: { capability: "ui:text" } } },
    }).warnings.map((w) => w.code)
  );
  assert.ok(viewCodes.has("view-for-unknown-facet"));
});

test("validatePresentation (op:validate) runs structural then the facet-survival check", () => {
  const spec = planPresentationWithRecipe(
    { interaction: "review", subject: "pr" },
    { surface: "desktop" },
    liveCardsIToP,
    liveCardsProfile.resources.taxonomy as unknown as import("../../samples/profiles/genui").InteractionTaxonomy
  );
  assert.equal(report("validatePresentation", { spec }).ok, true);

  const dropped = { ...spec, regions: spec.regions.filter((r) => r.name !== "summary") };
  const droppedReport = report("validatePresentation", { spec: dropped });
  assert.equal(droppedReport.ok, false);
  assert.ok(droppedReport.errors.some((e) => e.detail.includes("summary")));

  // structurally invalid input fails on the structural pass and skips the semantic check.
  assert.equal(report("validatePresentation", { spec: { layout: "stack" } }).ok, false);
});

test("validateIntent (op:validate, no layer) checks shape + targets", () => {
  assert.equal(report("validateIntent", { intent: { goal: "triage", priorities: ["summary"] } }).ok, true);
  assert.equal(report("validateIntent", { intent: { priorities: "nope" } }).ok, false);
  const codes = new Set(
    report("validateIntent", {
      intent: { priorities: ["ghost"] },
      interaction: { interaction: "review", subject: "pr" },
    }).warnings.map((w) => w.code)
  );
  assert.ok(codes.has("intent-target-unknown"));
});

test("intentToEdits (op:project) projects the sanctioned override channel", async () => {
  const edits = (await byName.get("intentToEdits")!.handler({ intent: { priorities: ["summary", "detail"] } })) as {
    priority: Record<string, string>;
    order: string[];
  };
  assert.equal(edits.priority.summary, "primary");
  assert.equal(edits.priority.detail, "secondary");
  assert.deepEqual(edits.order, ["summary", "detail"]);
});

test("the stateless AgentFace composes platform + genui tools when the contribution is passed", () => {
  const dispatcher = createStatelessAgentFaceDispatcher(genuiTools);
  const names = new Set(dispatcher.listTools().map((t) => t.name));
  assert.ok(names.has("describeCatalog"), "platform tool present");
  assert.ok(names.has("describeInteractions"), "genui contribution present");
  const call = dispatcher.callTool("validateInteraction", { spec: { interaction: "review", subject: "pr" } }) as {
    ok: boolean;
  };
  assert.equal(call.ok, true);
});
