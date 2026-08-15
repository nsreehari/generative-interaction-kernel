import assert from "node:assert/strict";
import { test } from "vitest";
import { getSampleBlueprintCatalog, openSampleBlueprint, resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";

test("every registered sample opens through terminal materialization", () => {
  for (const id of getSampleBlueprintCatalog().blueprints) {
    const runtime = openSampleBlueprint(id);
    assert.equal(runtime.blueprintId, id);
    assert.equal(runtime.definition.payload.tiers.length, 1, `${id} did not resolve to one terminal tier`);
    assert.deepEqual(runtime.definition.payload.recipes, [], `${id} retained lowering recipes at runtime`);
  }
}, 60_000);

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
  const runtime = openSampleBlueprint("portfolio-tracker-new", {
    "intelligence-model": "mock",
    view: "mobile",
  });

  assert.deepEqual(runtime.definition.payload.tiers, [
    { id: "portfolio-presentation", kind: "runtime-document" },
  ]);
  assert.deepEqual(runtime.definition.payload.recipes, []);
  assert.equal(runtime.definition.payload.cells?.board?.view?.capability, "primitive:container");
  assert.equal(runtime.definition.payload.cells?.board?.view?.props?.ariaLabel, "Portfolio tracker");
  assert.equal(runtime.definition.payload.services?.["portfolio-market-data"]?.kind, "deterministic-agent");
});