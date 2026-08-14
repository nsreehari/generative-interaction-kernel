import assert from "node:assert/strict";
import { test } from "vitest";
import registry from "../blueprints/registry.json" with { type: "json" };
import { openSampleBlueprint, resolveSampleBlueprintSource } from "./blueprints";

test("every registered sample opens through terminal materialization", { timeout: 10_000 }, () => {
  for (const id of registry.blueprints) {
    const runtime = openSampleBlueprint(id);
    assert.equal(runtime.blueprintId, id);
    assert.equal(runtime.definition.payload.tiers.length, 1, `${id} did not resolve to one terminal tier`);
    assert.deepEqual(runtime.definition.payload.recipes, [], `${id} retained lowering recipes at runtime`);
  }
});

test("sample opener preserves direct-runtime Blueprints", () => {
  const source = resolveSampleBlueprintSource("samples-overview");
  const runtime = openSampleBlueprint("samples-overview");

  assert.equal(runtime.blueprintId, "samples-overview");
  assert.deepEqual(runtime.definition, source);
});

test("sample opener materializes vocabulary-lowering to its terminal runtime", () => {
  const runtime = openSampleBlueprint("vocabulary-lowering");

  assert.deepEqual(runtime.definition.payload.tiers, [
    { id: "runtime", kind: "runtime-document" },
  ]);
  assert.deepEqual(runtime.definition.payload.recipes, []);
  assert.equal(runtime.definition.payload.cells?.["query-input"]?.kind, "runtime-cell");
  assert.deepEqual(runtime.definition.payload.projections?.presentation?.roots, ["query-input"]);
});

test("sample opener selects representation and implementation from external context", () => {
  const runtime = openSampleBlueprint("portfolio-tracker-2tiers", {
    view: "mobile",
    attention: "glanceable",
    marketMode: "mock",
  });

  assert.deepEqual(runtime.definition.payload.tiers, [
    { id: "runtime-document", kind: "runtime-document" },
  ]);
  assert.deepEqual(runtime.definition.payload.recipes, []);
  assert.equal(runtime.definition.payload.cells?.["portfolio-workspace"]?.view?.props?.subtitle, "Mobile · Glanceable");
  assert.equal(runtime.definition.payload.services?.["portfolio-market-data"]?.kind, "deterministic-agent");
});