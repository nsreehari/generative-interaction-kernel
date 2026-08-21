import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { unwrap } from "@gik/kernel";
import {
  createBlueprint,
  fixedLoweringMetaGraphBlueprint,
  lowerWithFixedMetaGraph,
  materializeBlueprint,
  parseBlueprintJson,
  runFixedLoweringMetaGraph,
  type VocabularyLoweringRecipeDefinition,
  type RepresentationLoweringRecipeDefinition,
} from "../src/index";

const sampleUrl = new URL("./fixtures/vocabulary-lowering.blueprint.json", import.meta.url);

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
  assert.deepEqual(terminal.payload.presentation, {
    slots: ["query-input", { id: "children", region: "query-input" }],
    root: "query-input",
  });
  assert.equal(Object.keys(terminal.payload.cells ?? {}).length, 3);
  assert.deepEqual(materialized.payload.terminalBlueprint, terminal);
  assert.ok(unwrap(materialized.payload.program).root);
  assert.deepEqual(authored, authoredSnapshot);
});

test("lowering executes all fixed compiler Cells through Kernel token flow", () => {
  const authored = parseBlueprintJson<VocabularyLoweringRecipeDefinition>(readFileSync(sampleUrl, "utf8"));

  const result = runFixedLoweringMetaGraph(authored);

  assert.deepEqual(Object.keys(result.execution.nodes), [
    "resolve-stage",
    "apply-vocabulary-patch",
    "emit-blueprint",
  ]);
  assert.equal(result.execution.tokens["lowering:stage"].producedBy, "resolve-stage");
  assert.equal(result.execution.tokens["lowering:artifact"].producedBy, "apply-vocabulary-patch");
  assert.equal(result.execution.tokens["compiled:artifact"].producedBy, "emit-blueprint");
  assert.deepEqual(result.execution.tokens["compiled:artifact"].value, result.blueprint);
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
  assert.deepEqual(materialized.payload.terminalBlueprint.payload.presentation, {
    slots: ["query-input", { id: "children", region: "query-input" }],
    root: "query-input",
  });
});

test("materialization rejects a recipe without deterministic vocabulary operations", () => {
  const authored = parseBlueprintJson(readFileSync(sampleUrl, "utf8"));
  delete (authored.payload.recipes[0] as Partial<VocabularyLoweringRecipeDefinition>).patch;

  assert.throws(
    () => materializeBlueprint({ blueprint: authored }),
    /must have required property 'patch'/,
  );
});

test("the lowering-recipe schema rejects a headless representation flag", () => {
  assert.throws(
    () => createBlueprint<RepresentationLoweringRecipeDefinition>({
      id: "invalid-representation",
      kind: "test",
      version: "1",
      tiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-program" }],
      recipes: [{
        id: "intent-to-runtime",
        from: "intent",
        to: "runtime",
        representations: [{ id: "worker", headless: true } as never],
        fallback: "worker",
      }],
      runtime: { namespaces: ["state"], capabilities: {} },
      cells: {
        worker: {
          id: "worker",
          events: { run: { payloadSchema: { type: "object" } } },
          behavior: { on: { run: [{ do: "assign", target: "state.done", args: { value: true } }] } },
        },
      },
    }),
    /must NOT have additional properties/,
  );
});

test("representation append merges sparse parent and slot composition", () => {
  const authored = createBlueprint<RepresentationLoweringRecipeDefinition>({
    id: "composition-append",
    kind: "test",
    version: "1",
    tiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-document" }],
    recipes: [{
      id: "intent-to-runtime",
      from: "intent",
      to: "runtime",
      representations: [
        {
          id: "base",
          presentation: {
            slots: [
              "root",
              { id: "header", region: "root" },
              { id: "content", region: "root" },
            ],
            root: "root",
          },
          views: {
            heading: { main: { region: "header" } },
            primary: { main: { region: "content" } },
          },
        },
        {
          id: "extended",
          extends: "base",
          presentationAppend: [
            { id: "actions", region: "root" },
          ],
          views: {
            secondary: { main: { region: "content" } },
            save: { main: { region: "actions" } },
          },
        },
      ],
      fallback: "extended",
    }],
    runtime: { namespaces: ["state"], capabilities: {} },
    cells: Object.fromEntries(["root", "heading", "primary", "secondary", "save"].map((id) => [
      id,
      { id, potentialViews: { main: { capability: "ui:text" } } },
    ])),
  });

  const terminal = lowerWithFixedMetaGraph(authored);

  assert.deepEqual(terminal.payload.presentation, {
    slots: [
      "root",
      { id: "header", region: "root" },
      { id: "content", region: "root" },
      { id: "actions", region: "root" },
    ],
    root: "root",
  });
  assert.equal(terminal.payload.cells?.heading.potentialViews?.main.region, "header");
  assert.equal(terminal.payload.cells?.primary.potentialViews?.main.region, "content");
  assert.equal(terminal.payload.cells?.secondary.potentialViews?.main.region, "content");
  assert.equal(terminal.payload.cells?.save.potentialViews?.main.region, "actions");
});

test("a representation decorator uses JSONata to add loading UI around source-backed Cells", () => {
  const authored = createBlueprint<RepresentationLoweringRecipeDefinition>({
    id: "source-backed-decoration",
    kind: "test",
    version: "1",
    tiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-document" }],
    recipes: [{
      id: "intent-to-runtime",
      from: "intent",
      to: "runtime",
      representations: [{
        id: "screen",
        views: {
          board: { main: { capability: "primitive:container" } },
          remote: { main: { capability: "ui:text", region: "board" } },
          local: { main: { capability: "ui:text", region: "board" } },
        },
        presentation: {
          slots: ["board"],
          root: "board",
        },
        decorators: [{
          select: "cells[sources].id",
          before: {
            capability: "fluent:spinner",
            props: { label: "Loading" },
            visibility: "systemInputs.numSourcesRunning > 0",
          },
        }],
      }],
      fallback: "screen",
    }],
    runtime: { capabilities: {} },
    services: {
      "remote-service": {
        kind: "mock-service",
        version: "1",
        operations: {
          read: {
            operation: "read",
            contract: "remote/v1",
            settlement: { transform: { kind: "jsonata", expr: "response" } },
          },
        },
      },
    },
    cells: {
      board: { id: "board" },
      remote: {
        id: "remote",
        systemInputs: ["numSourcesRunning"],
        sources: [{
          id: "remote.source",
          service: "remote-service",
          operation: "read",
        }],
      },
      local: { id: "local" },
    },
  });

  const materialized = materializeBlueprint({ blueprint: authored });
  const root = unwrap(materialized.payload.program).root!;
  const remote = root.edges?.children?.[0];
  const local = root.edges?.children?.[1];

  assert.ok(unwrap(materialized.payload.vocabulary).capabilities?.["fluent:spinner"]);
  assert.deepEqual(unwrap(materialized.payload.vocabulary).externals?.projectionViews?.fluent, {
    from: "fluent",
    use: ["spinner"],
  });
  assert.equal(remote?.capability, "gik:presentation-fragment");
  assert.equal(remote?.edges?.children?.[0]?.capability, "fluent:spinner");
  assert.equal(
    remote?.edges?.children?.[0]?.edges?.gate,
    '($count(($lookup(blueprintRunState.cells, "remote").sources)[lastRequestedToken != null and lastRequestedToken != lastCompletedToken])) > 0',
  );
  assert.equal(remote?.edges?.children?.[1]?.id, "remote--main--in-board");
  assert.equal(local?.id, "local--main--in-board");
});
