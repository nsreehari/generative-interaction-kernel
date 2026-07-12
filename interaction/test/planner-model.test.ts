// Gap 1 — the model-backed presentation planner seam, proven offline. Verifies: a recorded model plan
// replays deterministically and passes the Presentation DSL schema; a valid model plan flows through
// unchanged; an invalid model plan and an unrecorded (missed) input both fall back to the deterministic
// reference planner; and the cassette key is canonical (insensitive to context property order). No live
// model is involved — the record/replay cassette stands in, so the plumbing is fully verifiable offline.

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  defaultPresentationPlanner,
  isValidPresentationSpec,
  modelBackedPlanner,
  recordKey,
  replayPlannerModel,
  type InteractionSpec,
  type PlannerCassetteEntry,
  type PlannerFallbackReason,
  type PresentationContext,
} from "../src/index";

const cassette: PlannerCassetteEntry[] = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/planner-cassette.json", import.meta.url)), "utf8")
);

const investigate = cassette[0];
const compare = cassette[1];
const invalid = cassette[2]; // arrangement "carousel" — not a valid Presentation DSL arrangement.

test("replay: a recorded plan replays deterministically and is schema-valid", async () => {
  const model = replayPlannerModel(cassette);
  const out = await model.plan(investigate.interaction, investigate.context);
  assert.deepEqual(out, investigate.plan); // model output flows through, not the deterministic planner
  assert.ok(isValidPresentationSpec(out));
});

test("model-backed: a valid model plan is accepted unchanged", async () => {
  const plan = modelBackedPlanner(replayPlannerModel(cassette));
  const out = await plan(compare.interaction, compare.context);
  assert.deepEqual(out, compare.plan);
  assert.equal(out.source.interaction, compare.interaction.interaction);
  assert.equal(out.regions.filter((r) => r.priority === "primary").length, 1); // exactly one lead region
});

test("model-backed: an invalid model plan falls back to the deterministic planner", async () => {
  const reasons: PlannerFallbackReason[] = [];
  const plan = modelBackedPlanner(replayPlannerModel(cassette), {
    onFallback: (reason) => reasons.push(reason),
  });
  const out = await plan(invalid.interaction, invalid.context);
  assert.deepEqual(out, defaultPresentationPlanner(invalid.interaction, invalid.context));
  assert.deepEqual(reasons, ["invalid-output"]);
  assert.ok(isValidPresentationSpec(out)); // the fallback is always valid
});

test("model-backed: an unrecorded input falls back (model miss)", async () => {
  const reasons: PlannerFallbackReason[] = [];
  const plan = modelBackedPlanner(replayPlannerModel(cassette), {
    onFallback: (reason) => reasons.push(reason),
  });
  const spec: InteractionSpec = { interaction: "review", subject: "pull-request" };
  const ctx: PresentationContext = { surface: "web", space: "regular" };
  const out = await plan(spec, ctx);
  assert.deepEqual(out, defaultPresentationPlanner(spec, ctx));
  assert.deepEqual(reasons, ["model-error"]);
});

test("model-backed: validate=false lets an invalid plan through (the schema gate is what triggers fallback)", async () => {
  const plan = modelBackedPlanner(replayPlannerModel(cassette), { validate: false });
  const out = await plan(invalid.interaction, invalid.context);
  assert.deepEqual(out, invalid.plan); // not the fallback — proves validation is the gate
});

test("recordKey is canonical: context property order does not change the key", () => {
  const spec: InteractionSpec = { interaction: "investigate", subject: "incident" };
  const a: PresentationContext = { surface: "desktop", space: "expanded", attention: "focused" };
  const b: PresentationContext = { attention: "focused", surface: "desktop", space: "expanded" };
  assert.equal(recordKey(spec, a), recordKey(spec, b));
});
