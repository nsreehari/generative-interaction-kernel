import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  fixedLoweringMetaGraphBlueprint,
  lowerWithFixedMetaGraph,
  materializeBlueprint,
  parseBlueprintJson,
  type VocabularyLoweringRecipeDefinition,
} from "../src/index";

const sampleUrl = new URL("../../samples/blueprints/vocabulary-lowering/blueprint.json", import.meta.url);

test("the package owns one fixed three-Cell lowering meta-graph", () => {
  const metaGraph = fixedLoweringMetaGraphBlueprint();

  assert.equal(metaGraph.payload.structureMode, "fixed");
  assert.deepEqual(Object.keys(metaGraph.payload.cells ?? {}), [
    "resolve-stage",
    "apply-vocabulary-patch",
    "emit-blueprint",
  ]);
});

test("the fixed meta-graph lowers the two-tier vocabulary recipe to an executable terminal Blueprint", () => {
  const authored = parseBlueprintJson<VocabularyLoweringRecipeDefinition>(readFileSync(sampleUrl, "utf8"));
  const authoredSnapshot = structuredClone(authored);
  const terminal = lowerWithFixedMetaGraph(authored);
  const materialized = materializeBlueprint({ blueprint: authored });

  assert.deepEqual(terminal.payload.tiers, [{ id: "runtime", kind: "runtime-document" }]);
  assert.deepEqual(terminal.payload.recipes, []);
  assert.deepEqual(terminal.payload.projections?.presentation?.roots, ["query-input"]);
  assert.equal(Object.keys(terminal.payload.cells ?? {}).length, 3);
  assert.deepEqual(materialized.payload.terminalBlueprint, terminal);
  assert.equal(materialized.payload.program.type, "program");
  assert.deepEqual(authored, authoredSnapshot);
});

test("the same fixed meta-graph folds an arbitrary ordered tier chain", () => {
  const authored = parseBlueprintJson<VocabularyLoweringRecipeDefinition>(readFileSync(sampleUrl, "utf8"));
  const [recipe] = authored.payload.recipes;
  authored.payload.tiers.splice(1, 0, { id: "presentation", kind: "presentation-model" });
  authored.payload.recipes = [
    {
      id: "intent-to-presentation",
      from: "intent",
      to: "presentation",
      patch: recipe.patch.slice(0, 2),
    },
    {
      id: "presentation-to-runtime",
      from: "presentation",
      to: "runtime",
      patch: recipe.patch.slice(2),
    },
  ];

  const materialized = materializeBlueprint({ blueprint: authored });

  assert.deepEqual(materialized.payload.terminalBlueprint.payload.tiers, [
    { id: "runtime", kind: "runtime-document" },
  ]);
  assert.deepEqual(materialized.payload.terminalBlueprint.payload.recipes, []);
  assert.deepEqual(materialized.payload.terminalBlueprint.payload.projections?.presentation?.roots, ["query-input"]);
});

test("materialization rejects a recipe without deterministic vocabulary operations", () => {
  const authored = parseBlueprintJson(readFileSync(sampleUrl, "utf8"));
  delete (authored.payload.recipes[0] as Partial<VocabularyLoweringRecipeDefinition>).patch;

  assert.throws(
    () => materializeBlueprint({ blueprint: authored }),
    /requires a non-empty vocabulary patch/,
  );
});
