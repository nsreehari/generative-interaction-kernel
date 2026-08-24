import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createBlueprint,
  lowerWithFixedMetaGraph,
  resolveBlueprintExecution,
  validateBlueprintArtifact,
  validateBlueprintForAuthoring,
  type BlueprintDefinition,
} from "../src/index";

/** A Blueprint whose one Cell carries a swappable service-backed source and a swappable view, so
 * either axis can be exercised on its own or both together. */
function twoAxisBlueprint(overrides: Partial<BlueprintDefinition>): BlueprintDefinition {
  return {
    id: "two-axis",
    kind: "test",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-document" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-document" }],
    projectionRecipes: [],
    runtime: { state: { board: {} } },
    services: {
      mock: {
        kind: "test-service",
        version: "1",
        operations: {
          read: {
            operation: "read",
            contract: "quotes/v1",
            settlement: { transform: { kind: "jsonata", expr: "response" } },
          },
        },
      },
      live: {
        kind: "test-service",
        version: "1",
        operations: {
          read: {
            operation: "read",
            contract: "quotes/v1",
            settlement: { transform: { kind: "jsonata", expr: "response" } },
          },
        },
      },
    },
    cells: {
      quotes: {
        id: "quotes",
        sources: [{ id: "quotes.source", service: "mock", operation: "read" }],
        potentialViews: { primary: { capability: "ui:text", region: "board" } },
      },
    },
    presentation: { slots: ["board"], root: "board" },
    ...overrides,
  } as BlueprintDefinition;
}

const serviceRecipe = (id: string, from: string, to: string, fallback = "mock-backed") => ({
  id,
  from,
  to,
  implementationPrograms: [
    {
      id: "mock-backed",
      cells: { quotes: { sources: [{ id: "quotes.source", service: "mock", operation: "read" }] } },
    },
    {
      id: "live-backed",
      when: "externalContext.market = 'live'",
      cells: { quotes: { sources: [{ id: "quotes.source", service: "live", operation: "read" }] } },
    },
  ],
  implementationFallback: fallback,
});

const projectionRecipe = (id: string, from: string, to: string, fallback = "compact") => ({
  id,
  from,
  to,
  representations: [
    {
      id: "compact",
      views: { quotes: { primary: { capability: "ui:compact", region: "board" } } },
      presentation: { slots: ["board"], root: "board" },
    },
    {
      id: "rich",
      when: "externalContext.view = 'rich'",
      views: { quotes: { primary: { capability: "ui:rich", region: "board" } } },
      presentation: { slots: ["board"], root: "board" },
    },
  ],
  fallback,
});

test("a projection-only Blueprint lowers its projection axis and leaves the service axis terminal", () => {
  const authored = createBlueprint(twoAxisBlueprint({
    projectionTiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-document" }],
    projectionRecipes: [projectionRecipe("intent-to-runtime", "intent", "runtime")],
  }));

  const resolved = resolveBlueprintExecution(authored);
  assert.equal(resolved.service.stages.length, 0);
  assert.equal(resolved.projection.stages.length, 1);
  assert.equal(resolved.service.terminalTier.id, "runtime");

  const terminal = lowerWithFixedMetaGraph(authored, { view: "rich" });
  assert.equal(terminal.payload.cells?.quotes.potentialViews?.primary.capability, "ui:rich");
  // The untouched service axis keeps the authored implementation exactly as declared.
  assert.equal(terminal.payload.cells?.quotes.sources?.[0].service, "mock");
});

test("a service-only Blueprint lowers its service axis and leaves the projection axis terminal", () => {
  const authored = createBlueprint(twoAxisBlueprint({
    serviceTiers: [{ id: "logic", kind: "logic" }, { id: "runtime", kind: "runtime-document" }],
    serviceRecipes: [serviceRecipe("logic-to-runtime", "logic", "runtime")],
  }));

  const resolved = resolveBlueprintExecution(authored);
  assert.equal(resolved.service.stages.length, 1);
  assert.equal(resolved.projection.stages.length, 0);

  const terminal = lowerWithFixedMetaGraph(authored, { market: "live" });
  assert.equal(terminal.payload.cells?.quotes.sources?.[0].service, "live");
  // The untouched projection axis keeps the authored view exactly as declared.
  assert.equal(terminal.payload.cells?.quotes.potentialViews?.primary.capability, "ui:text");
});

test("both axes resolve independently with unequal chain lengths", () => {
  const authored = createBlueprint(twoAxisBlueprint({
    serviceTiers: [
      { id: "logic", kind: "logic" },
      { id: "market", kind: "logic" },
      { id: "runtime", kind: "runtime-document" },
    ],
    serviceRecipes: [
      {
        ...serviceRecipe("logic-to-market", "logic", "market"),
      },
      {
        id: "market-to-runtime",
        from: "market",
        to: "runtime",
        implementationPrograms: [{ id: "pass-through" }],
        implementationFallback: "pass-through",
      },
    ],
    projectionTiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-document" }],
    projectionRecipes: [projectionRecipe("intent-to-runtime", "intent", "runtime")],
  }));

  const resolved = resolveBlueprintExecution(authored);
  assert.equal(resolved.service.stages.length, 2);
  assert.equal(resolved.projection.stages.length, 1);
  assert.deepEqual(resolved.service.stages.map(({ recipe }) => recipe.id), ["logic-to-market", "market-to-runtime"]);
  assert.deepEqual(resolved.projection.stages.map(({ recipe }) => recipe.id), ["intent-to-runtime"]);

  const terminal = lowerWithFixedMetaGraph(authored, { market: "live", view: "rich" });
  assert.equal(terminal.payload.cells?.quotes.sources?.[0].service, "live");
  assert.equal(terminal.payload.cells?.quotes.potentialViews?.primary.capability, "ui:rich");
});

test("each axis falls back independently when its own predicates do not match", () => {
  const authored = createBlueprint(twoAxisBlueprint({
    serviceTiers: [{ id: "logic", kind: "logic" }, { id: "runtime", kind: "runtime-document" }],
    serviceRecipes: [serviceRecipe("logic-to-runtime", "logic", "runtime", "live-backed")],
    projectionTiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-document" }],
    projectionRecipes: [projectionRecipe("intent-to-runtime", "intent", "runtime", "compact")],
  }));

  // Only the projection predicate matches; the service axis takes its own declared fallback.
  const terminal = lowerWithFixedMetaGraph(authored, { view: "rich" });
  assert.equal(terminal.payload.cells?.quotes.sources?.[0].service, "live");
  assert.equal(terminal.payload.cells?.quotes.potentialViews?.primary.capability, "ui:rich");
});

test("an unknown fallback is rejected on the axis that declares it, naming that axis", () => {
  assert.throws(
    () => createBlueprint(twoAxisBlueprint({
      projectionTiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-document" }],
      projectionRecipes: [projectionRecipe("intent-to-runtime", "intent", "runtime", "missing")],
    })),
    /Projection recipe 'intent-to-runtime': representation fallback 'missing' does not reference a declared representation/,
  );

  assert.throws(
    () => createBlueprint(twoAxisBlueprint({
      serviceTiers: [{ id: "logic", kind: "logic" }, { id: "runtime", kind: "runtime-document" }],
      serviceRecipes: [serviceRecipe("logic-to-runtime", "logic", "runtime", "missing")],
    })),
    /Service recipe 'logic-to-runtime': implementation program fallback 'missing' does not reference a declared implementation program/,
  );
});

test("the terminal Blueprint keeps one terminal tier per axis and clears both recipe arrays", () => {
  const authored = createBlueprint(twoAxisBlueprint({
    serviceTiers: [{ id: "logic", kind: "logic" }, { id: "service-runtime", kind: "runtime-document" }],
    serviceRecipes: [serviceRecipe("logic-to-runtime", "logic", "service-runtime")],
    projectionTiers: [{ id: "intent", kind: "intent" }, { id: "projection-runtime", kind: "runtime-document" }],
    projectionRecipes: [projectionRecipe("intent-to-runtime", "intent", "projection-runtime")],
  }));

  const terminal = lowerWithFixedMetaGraph(authored);

  assert.deepEqual(terminal.payload.serviceTiers, [{ id: "service-runtime", kind: "runtime-document" }]);
  assert.deepEqual(terminal.payload.projectionTiers, [{ id: "projection-runtime", kind: "runtime-document" }]);
  assert.deepEqual(terminal.payload.serviceRecipes, []);
  assert.deepEqual(terminal.payload.projectionRecipes, []);
  // A terminal Blueprint must pass the same validation as a directly authored one.
  assert.doesNotThrow(() => validateBlueprintArtifact(terminal));
});

test("the complete service chain applies before the complete projection chain", () => {
  const authored = createBlueprint(twoAxisBlueprint({
    serviceTiers: [{ id: "logic", kind: "logic" }, { id: "runtime", kind: "runtime-document" }],
    serviceRecipes: [{
      id: "logic-to-runtime",
      from: "logic",
      to: "runtime",
      implementationPrograms: [{
        id: "live-backed",
        cells: { quotes: { sources: [{ id: "quotes.source", service: "live", operation: "read" }] } },
      }],
      implementationFallback: "live-backed",
    }],
    projectionTiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-document" }],
    projectionRecipes: [{
      id: "intent-to-runtime",
      from: "intent",
      to: "runtime",
      representations: [{
        id: "observes-implementation",
        presentation: { slots: ["board"], root: "board" },
        // Selects the Cell whose already-lowered implementation names the live service, which is
        // only possible because the whole service chain ran first.
        decorators: [{
          select: "cells[sources[service = 'live']].id",
          before: { capability: "ui:badge", props: { label: "live" } },
        }],
      }],
      fallback: "observes-implementation",
    }],
  }));

  const terminal = lowerWithFixedMetaGraph(authored);

  assert.equal(terminal.payload.cells?.quotes.sources?.[0].service, "live");
  assert.deepEqual(
    terminal.payload.cells?.quotes.potentialViews?.primary.before?.map(({ capability }) => capability),
    ["ui:badge"],
  );
});

test("the authoring report describes both axes separately", () => {
  const authored = createBlueprint(twoAxisBlueprint({
    serviceTiers: [{ id: "logic", kind: "logic" }, { id: "runtime", kind: "runtime-document" }],
    serviceRecipes: [serviceRecipe("logic-to-runtime", "logic", "runtime")],
  }));

  const report = validateBlueprintForAuthoring(authored);

  assert.equal(report.valid, true);
  assert.equal(report.execution.status, "lowering-required");
  assert.deepEqual(report.execution.service, {
    sourceTier: "logic",
    terminalTier: "runtime",
    stages: [{ id: "logic-to-runtime", from: "logic", to: "runtime" }],
  });
  assert.deepEqual(report.execution.projection, {
    sourceTier: "runtime",
    terminalTier: "runtime",
    stages: [],
  });
});

test("a recipe-free axis must declare exactly one terminal tier", () => {
  assert.throws(
    () => createBlueprint(twoAxisBlueprint({
      projectionTiers: [{ id: "intent", kind: "intent" }, { id: "runtime", kind: "runtime-document" }],
    })),
    /no projection recipes must declare exactly one terminal projection tier/,
  );
  assert.throws(
    () => createBlueprint(twoAxisBlueprint({
      serviceTiers: [{ id: "logic", kind: "logic" }, { id: "runtime", kind: "runtime-document" }],
    })),
    /no service recipes must declare exactly one terminal service tier/,
  );
});
