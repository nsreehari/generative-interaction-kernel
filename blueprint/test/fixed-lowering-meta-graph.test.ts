import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { unwrap } from "gik-kernel";
import {
  createBlueprint,
  fixedLoweringMetaGraphBlueprint,
  lowerWithFixedMetaGraph,
  materializeBlueprint,
  parseBlueprintJson,
  runFixedLoweringMetaGraph,
  type ProjectionLoweringRecipeDefinition,
} from "../src/index";

const sampleUrl = new URL("./fixtures/representation-lowering.blueprint.json", import.meta.url);

test("the package owns one fixed three-Cell lowering meta-graph", () => {
  const metaGraph = fixedLoweringMetaGraphBlueprint();

  assert.equal(metaGraph.payload.structureMode, "fixed");
  assert.deepEqual(Object.keys(metaGraph.payload.cells ?? {}), [
    "resolve-stage",
    "apply-vocabulary-patch",
    "emit-blueprint",
  ]);
});
test("the fixed meta-graph lowers both two-tier axes to an executable terminal Blueprint", () => {
  const authored = parseBlueprintJson(readFileSync(sampleUrl, "utf8"));
  const authoredSnapshot = structuredClone(authored);
  const terminal = lowerWithFixedMetaGraph(authored);
  const materialized = materializeBlueprint({ blueprint: authored });

  assert.deepEqual(terminal.payload.serviceTiers, [{ id: "runtime", kind: "runtime-document" }]);
  assert.deepEqual(terminal.payload.serviceRecipes, []);
  assert.deepEqual(terminal.payload.projectionTiers, [{ id: "runtime", kind: "runtime-document", capabilities: [] }]);
  assert.deepEqual(terminal.payload.projectionRecipes, []);
  assert.deepEqual(terminal.payload.presentation, {
    slots: ["query-input", { id: "children", region: "query-input" }],
    root: "query-input",
    allowedCapabilities: ["sample:query-input", "sample:results", "sample:summary"],
  });
  // The service axis selected the implementation seam; the projection axis selected the views.
  assert.deepEqual(
    terminal.payload.cells?.["query-input"].behavior,
    { on: { submit: [{ do: "assign", target: "search.submitted", args: { value: true } }] } },
  );
  assert.equal(Object.keys(terminal.payload.cells ?? {}).length, 3);
  assert.deepEqual(materialized.payload.terminalBlueprint, terminal);
  assert.ok(unwrap(materialized.payload.program).root);
  assert.deepEqual(authored, authoredSnapshot);
});

test("lowering executes all fixed compiler Cells through Kernel token flow", () => {
  const authored = parseBlueprintJson(readFileSync(sampleUrl, "utf8"));

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

test("the same fixed meta-graph folds an arbitrary ordered tier chain on each axis", () => {
  const authored = parseBlueprintJson(readFileSync(sampleUrl, "utf8"));
  const [projectionRecipe] = authored.payload.projectionRecipes;
  authored.payload.projectionTiers.splice(1, 0, {
    id: "presentation",
    kind: "presentation-model",
    capabilities: [],
  });
  authored.payload.projectionRecipes = [
    {
      id: "intent-to-presentation",
      from: "intent",
      to: "presentation",
      representations: projectionRecipe.representations,
      fallback: projectionRecipe.fallback,
    },
    {
      id: "presentation-to-runtime",
      from: "presentation",
      to: "runtime",
      // No further view/presentation change is needed at this stage -- an empty pass-through
      // representation carries forward whatever presentation the prior stage already produced.
      representations: [{ id: "pass-through" }],
      fallback: "pass-through",
    },
  ];

  const materialized = materializeBlueprint({ blueprint: authored });

  // The service axis keeps its own, shorter chain; the axes never have to be the same length.
  assert.deepEqual(materialized.payload.terminalBlueprint.payload.serviceTiers, [
    { id: "runtime", kind: "runtime-document" },
  ]);
  assert.deepEqual(materialized.payload.terminalBlueprint.payload.projectionTiers, [
    { id: "runtime", kind: "runtime-document", capabilities: [] },
  ]);
  assert.deepEqual(materialized.payload.terminalBlueprint.payload.serviceRecipes, []);
  assert.deepEqual(materialized.payload.terminalBlueprint.payload.projectionRecipes, []);
  assert.deepEqual(materialized.payload.terminalBlueprint.payload.presentation, {
    slots: ["query-input", { id: "children", region: "query-input" }],
    root: "query-input",
    allowedCapabilities: ["sample:query-input", "sample:results", "sample:summary"],
  });
});

test("materialization rejects a projection recipe missing its required representations", () => {
  const authored = parseBlueprintJson(readFileSync(sampleUrl, "utf8"));
  delete (authored.payload.projectionRecipes[0] as Partial<ProjectionLoweringRecipeDefinition>).representations;

  assert.throws(
    () => materializeBlueprint({ blueprint: authored }),
    /must have required property 'representations'/,
  );
});

test("materialization rejects a service recipe missing its required implementation programs", () => {
  const authored = parseBlueprintJson(readFileSync(sampleUrl, "utf8"));
  delete (authored.payload.serviceRecipes[0] as Partial<{ implementationPrograms: unknown }>).implementationPrograms;

  assert.throws(
    () => materializeBlueprint({ blueprint: authored }),
    /must have required property 'implementationPrograms'/,
  );
});

test("the projection-recipe schema rejects a headless representation flag", () => {
  assert.throws(
    () => createBlueprint({
      id: "invalid-representation",
      kind: "test",
      version: "1",
      serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
      serviceRecipes: [],
      projectionTiers: [{ id: "intent", kind: "intent" , capabilities: []}, { id: "runtime", kind: "runtime-program" , capabilities: []}],
      projectionRecipes: [{
        id: "intent-to-runtime",
        from: "intent",
        to: "runtime",
        representations: [{ id: "worker", headless: true } as never],
        fallback: "worker",
      }],
      runtime: {},
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

test("the service-recipe schema rejects representation-only fields", () => {
  assert.throws(
    () => createBlueprint({
      id: "invalid-service-recipe",
      kind: "test",
      version: "1",
      serviceTiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-program" }],
      serviceRecipes: [{
        id: "intent-to-runtime",
        from: "intent",
        to: "runtime",
        implementationPrograms: [{ id: "default" }],
        fallback: "default",
        representations: [{ id: "default" }],
      } as never],
      projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
      projectionRecipes: [],
      runtime: {},
      cells: { worker: { id: "worker" } },
    }),
    /must NOT have additional properties/,
  );
});

test("representation append merges sparse parent and slot composition", () => {
  const authored = createBlueprint({
    id: "composition-append",
    kind: "test",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-document" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "intent", kind: "intent" , capabilities: []}, { id: "runtime", kind: "runtime-document" , capabilities: []}],
    projectionRecipes: [{
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
    presentation: {
      slots: [
        "root",
        { id: "header", region: "root" },
        { id: "content", region: "root" },
        { id: "actions", region: "root" },
      ],
      root: "root",
      allowedCapabilities: ["ui:text"],
    },
    runtime: {},
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
    allowedCapabilities: ["ui:text"],
  });
  assert.equal(terminal.payload.cells?.heading.potentialViews?.main.region, "header");
  assert.equal(terminal.payload.cells?.primary.potentialViews?.main.region, "content");
  assert.equal(terminal.payload.cells?.secondary.potentialViews?.main.region, "content");
  assert.equal(terminal.payload.cells?.save.potentialViews?.main.region, "actions");
});

test("a representation decorator uses JSONata to add loading UI around source-backed Cells", () => {
  const authored = createBlueprint({
    id: "source-backed-decoration",
    kind: "test",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-document" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "intent", kind: "intent" , capabilities: []}, { id: "runtime", kind: "runtime-document" , capabilities: []}],
    projectionRecipes: [{
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
    presentation: {
      slots: ["board"],
      root: "board",
      allowedCapabilities: ["primitive:container", "ui:text", "fluent:spinner"],
    },
    runtime: {},
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
