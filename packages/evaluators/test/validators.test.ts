import assert from "node:assert/strict";
import { test } from "vitest";

import {
  resolveDeclarativeFormInitialValue,
  runDeclarativeValidators,
  validateDeclarativeFormSpec,
  validateDeclarativeFormValues,
  validateProjectionRecipe,
  validateServiceRecipe,
  validateTier,
} from "../src";

test("declarative form specs support typed fields, defaults, and validators", () => {
  const spec = {
    fields: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const, minLength: 2, default: "Ada" },
        count: { type: "integer" as const, minimum: 1 },
        enabled: { type: "boolean" as const },
        tags: { type: "array" as const, items: { type: "string" as const, enum: ["a", "b"] } },
        config: { type: "json" as const },
      },
      required: ["name", "count", "enabled", "tags", "config"],
      validators: [{
        kind: "jsonata" as const,
        expr: "data.count <= 5",
        message: "count too large",
      }],
    },
    initialValue: {
      count: 2,
      enabled: true,
      tags: ["a"],
      config: { mode: "safe" },
    },
  };

  assert.equal(validateDeclarativeFormSpec(spec).ok, true);
  assert.deepEqual(resolveDeclarativeFormInitialValue(spec), {
    name: "Ada",
    count: 2,
    enabled: true,
    tags: ["a"],
    config: { mode: "safe" },
  });
  assert.equal(validateDeclarativeFormValues(spec.fields, resolveDeclarativeFormInitialValue(spec)).ok, true);

  const invalid = validateDeclarativeFormValues(spec.fields, {
    name: "A",
    count: 8,
    enabled: true,
    tags: ["c"],
    config: {},
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some(({ detail }) => detail.includes("fewer than 2 characters")));
  assert.ok(invalid.errors.some(({ detail }) => detail.includes("equal to one of the allowed values")));
  assert.ok(invalid.errors.some(({ detail }) => detail.includes("count too large")));
});

test("declarative form specs reject malformed validators", () => {
  const report = validateDeclarativeFormSpec({
    fields: {
      properties: { name: { type: "string" } },
      validators: [{ kind: "jsonata" }],
    },
  });

  assert.equal(report.ok, false);
});

test("runDeclarativeValidators accepts legacy jsonata forms and explicit special validators", () => {
  const report = runDeclarativeValidators([
    ["$length(data.name) > 0", "name required"],
    { expr: "$length(data.title) > 0", message: "title required" },
    { kind: "ajv-schema", schema: { type: "object", required: ["id"] }, message: "invalid nested" },
    { kind: "typedef", type: "object", message: "title type" },
  ], { name: "", title: "", id: 123 });

  assert.equal(report.ok, false);
  assert.deepEqual(report.errors, [{ detail: "name required" }, { detail: "title required" }]);
  assert.deepEqual(report.warnings, []);
});

test("runDeclarativeValidators dispatches jsonata, typedef, and ajv-schema validators", () => {
  const validators = [
    { kind: "jsonata", expr: "data.title = 'ok'", message: "title mismatch" },
    { kind: "typedef", type: "object", message: "value type failed" },
    {
      kind: "ajv-schema",
      schema: { type: "object", required: ["item"], properties: { item: { type: "object", required: ["id"] } } },
      message: "value schema failed",
    },
  ];

  const value = { title: "bad", item: {} };
  const report = runDeclarativeValidators(validators, value);

  assert.equal(report.ok, false);
  assert.deepEqual(report.errors, [
    { detail: "title mismatch" },
    { detail: "value schema failed: /item must have required property 'id'" },
  ]);
  assert.deepEqual(report.warnings, []);
});

test("runDeclarativeValidators supports ajv-schema refs", () => {
  const report = runDeclarativeValidators([
    {
      kind: "ajv-schema",
      schema: {
        type: "object",
        properties: {
          child: { $ref: "child.schema.json" },
        },
        required: ["child"],
      },
      refs: [
        {
          key: "child.schema.json",
          schema: {
            $id: "child.schema.json",
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" } },
          },
        },
      ],
      message: "value schema failed",
    },
  ], { child: {} });

  assert.deepEqual(report.errors, [{ detail: "value schema failed: /child must have required property 'id'" }]);
});

test("runDeclarativeValidators routes warning-level validator failures into warnings", () => {
  const report = runDeclarativeValidators([
    { kind: "jsonata", expr: "data.title = 'ok'", message: "title mismatch", level: "warning" },
    { kind: "typedef", type: "object", message: "value type failed", level: "warning" },
  ], "bad");

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, [
    { detail: "title mismatch" },
    { detail: "value type failed: expected object" },
  ]);
});

test("runDeclarativeValidators preserves optional metadata and bindings", () => {
  const report = runDeclarativeValidators([
    {
      kind: "jsonata",
      expr: "$length(data.name) >= $minLen",
      message: "name too short",
      level: "warning",
      code: "short-name",
      node: "name",
    },
  ], { name: "ab" }, { bindings: { minLen: 3 } });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, [{ code: "short-name", node: "name", detail: "name too short" }]);
});

test("runDeclarativeValidators can evaluate JSONata against the raw value root", () => {
  const report = runDeclarativeValidators([
    { kind: "jsonata", expr: "$exists(name) and $length(name) > 0", message: "name required" },
  ], { name: "ok" }, { jsonataValueMode: "root" });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
});

test("runDeclarativeValidators can validate that a value is a full JSONata expression", () => {
  const report = runDeclarativeValidators([
    { kind: "jsonata-expression", mode: "full", message: "expression invalid" },
  ], "function($x){ $x * 2 }(21)");

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
});

test("runDeclarativeValidators can validate that a value stays within the safe JSONata subset", () => {
  const report = runDeclarativeValidators([
    { kind: "jsonata-expression", mode: "safe", message: "expression invalid" },
  ], "function($x){ $x * 2 }(21)");

  assert.equal(report.ok, false);
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0].detail, /^expression invalid: /);
});

test("runDeclarativeValidators rejects jsonata-expression candidates that are not strings", () => {
  const report = runDeclarativeValidators([
    { kind: "jsonata-expression", message: "expression invalid" },
  ], { expr: "count > 0" });

  assert.equal(report.ok, false);
  assert.deepEqual(report.errors, [{ detail: "expression invalid: expected string" }]);
});

test("runDeclarativeValidators validates Blueprint Cell schema and evaluation invariants", () => {
  const report = runDeclarativeValidators([{ kind: "blueprint-cell" }], {
    id: "summary",
    inputs: [{ token: "positions" }],
    compute: [{
      id: "total",
      expression: "$sum(inputs.positions.value)",
      assign: "total",
      dependencies: ["inputs.positions"],
    }],
    outputs: [{ token: "summary", from: "missing" }],
  });

  assert.equal(report.ok, false);
  assert.ok(report.errors.some(({ detail }) => detail.includes("references a value not produced by compute")));
});

test("Cell compute accepts full value expressions and outputs may use implicit bindings", () => {
  const report = runDeclarativeValidators([{ kind: "blueprint-cell" }], {
    id: "positions",
    compute: [{
      id: "positions",
      expression: "$each(inputs, function($value, $key){{$key:$value}})",
      assign: "positions",
    }],
    outputs: [{ token: "position:$TICKER" }],
  });

  assert.equal(report.ok, true);
});

test("runDeclarativeValidators rejects reactions in Blueprint Cells", () => {
  const report = runDeclarativeValidators([{ kind: "blueprint-cell" }], {
    id: "legacy-reaction",
    behavior: {
      reactions: [{ when: "state.changed", run: [{ do: "invoke" }] }],
    },
  });

  assert.equal(report.ok, false);
  assert.ok(report.errors.some(({ detail }) => detail.includes("additional properties")));
});

test("runDeclarativeValidators validates every Cell in a Blueprint", () => {
  const report = runDeclarativeValidators([{ kind: "blueprint" }], {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "invalid-cell",
      kind: "test",
      version: "1",
      serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
      serviceRecipes: [],
      projectionTiers: [{ id: "runtime", kind: "runtime-program" }],
      projectionRecipes: [],
      runtime: {},
      cells: {
        summary: {
          id: "summary",
          compute: [{ id: "total", expression: "inputs.value", assign: "total", dependencies: ["future"] }],
          outputs: [{ token: "summary", from: "missing" }],
        },
      },
    },
  });

  assert.equal(report.ok, false);
  assert.ok(report.errors.some(({ detail }) => detail.includes("references a value not produced by compute")));
});

test("blueprint-capability-acceptance rejects capabilities outside the accepted set, across recipe and materialized Cell shapes", () => {
  const generatedRecipeShapedBlueprint = {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "generated-semantic-report",
      projectionRecipes: [{
        id: "semantic-report-to-runtime",
        representations: [{
          id: "report",
          views: { report: { main: { capability: "chart:pie", bindings: { value: { from: "report.data" } } } } },
          presentation: { slots: ["report"], root: "report", allowedCapabilities: ["primitive:markdown"] },
        }],
      }],
    },
  };
  const report = runDeclarativeValidators(
    [{ kind: "blueprint-capability-acceptance", message: "capability not accepted" }],
    generatedRecipeShapedBlueprint,
    { bindings: { request: { acceptedCapabilities: ["primitive:markdown"] } } },
  );

  assert.equal(report.ok, false);
  assert.ok(report.errors.some(({ detail }) => detail.includes("chart:pie")));
});

test("blueprint-capability-acceptance accepts a Blueprint whose declared and used capabilities are all accepted", () => {
  const materializedCellShapedBlueprint = {
    payload: {
      cells: {
        report: { id: "report", potentialViews: { main: { capability: "primitive:markdown" } } },
      },
    },
  };
  const report = runDeclarativeValidators(
    [{ kind: "blueprint-capability-acceptance" }],
    materializedCellShapedBlueprint,
    { bindings: { request: { acceptedCapabilities: ["primitive:markdown"] } } },
  );

  assert.equal(report.ok, true);
});

test("validateTier validates a standalone strict tier definition", () => {
  assert.equal(validateTier({ id: "semantic", kind: "incident-semantic-model" }).ok, true);

  const report = validateTier({ id: "semantic", kind: "incident-semantic-model", unknown: true });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some(({ detail }) => detail.includes("additional properties")));
});

test("validateProjectionRecipe validates standalone recipe-local semantics", () => {
  const report = validateProjectionRecipe({
    id: "semantic-to-runtime",
    from: "semantic",
    to: "runtime",
    representations: [
      { id: "desktop", when: "externalContext.view = 'desktop'" },
      { id: "mobile", extends: "missing" },
    ],
    fallback: "unknown",
  });

  assert.equal(report.ok, false);
  assert.ok(report.errors.some(({ detail }) => detail.includes("fallback 'unknown'")));
  assert.ok(report.errors.some(({ detail }) => detail.includes("extends unknown representation 'missing'")));
});

test("validateServiceRecipe validates standalone recipe-local semantics on its own axis", () => {
  const report = validateServiceRecipe({
    id: "logic-to-runtime",
    from: "logic",
    to: "runtime",
    implementationPrograms: [
      { id: "mock", when: "externalContext.market = 'mock'" },
      { id: "mock" },
    ],
    implementationFallback: "unknown",
  });

  assert.equal(report.ok, false);
  assert.ok(report.errors.some(({ detail }) => detail.includes("duplicate implementation program 'mock'")));
  assert.ok(report.errors.some(({ detail }) => detail.includes("implementation program fallback 'unknown'")));
});

test("each axis' schema rejects the other axis' fields", () => {
  const projectionWithImplementation = validateProjectionRecipe({
    id: "semantic-to-runtime",
    from: "semantic",
    to: "runtime",
    representations: [{ id: "desktop" }],
    fallback: "desktop",
    implementationPrograms: [{ id: "mock" }],
    implementationFallback: "mock",
  });
  assert.equal(projectionWithImplementation.ok, false);

  const serviceWithRepresentations = validateServiceRecipe({
    id: "logic-to-runtime",
    from: "logic",
    to: "runtime",
    implementationPrograms: [{ id: "mock" }],
    implementationFallback: "mock",
    representations: [{ id: "desktop" }],
    fallback: "desktop",
  });
  assert.equal(serviceWithRepresentations.ok, false);
});

test("validateProjectionRecipe validates representation decorator select expressions", () => {
  const valid = validateProjectionRecipe({
    id: "semantic-to-runtime",
    from: "semantic",
    to: "runtime",
    representations: [{
      id: "desktop",
      decorators: [{
        select: "cells[sources].id",
        before: { capability: "fluent:spinner" },
      }],
    }],
    fallback: "desktop",
  });
  assert.equal(valid.ok, true);

  const invalid = validateProjectionRecipe({
    id: "semantic-to-runtime",
    from: "semantic",
    to: "runtime",
    representations: [{
      id: "desktop",
      decorators: [{
        select: "cells[",
        before: { capability: "fluent:spinner" },
      }],
    }],
    fallback: "desktop",
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some(({ detail }) => detail.includes("invalid decorator select expression")));
});

test("Blueprint Cell validation rejects invalid decoration expressions and nested decorations", () => {
  const invalidExpression = runDeclarativeValidators([{ kind: "blueprint-cell" }], {
    id: "remote",
    potentialViews: {
      primary: {
        capability: "ui:text",
        before: [{ capability: "fluent:spinner", visibility: "systemInputs[" }],
      },
    },
  });
  assert.equal(invalidExpression.ok, false);
  assert.ok(invalidExpression.errors.some(({ detail }) =>
    detail.includes("Cell 'remote'") && !detail.includes("[object Object]")));

  const nested = runDeclarativeValidators([{ kind: "blueprint-cell" }], {
    id: "remote",
    potentialViews: {
      primary: {
        capability: "ui:text",
        before: [{
          capability: "fluent:spinner",
          before: [{ capability: "ui:text" }],
        }],
      },
    },
  });
  assert.equal(nested.ok, false);
  assert.ok(nested.errors.some(({ detail }) => detail.includes("additional properties")));
});

test("standalone recipe validation does not own Blueprint tier references", () => {
  const report = validateProjectionRecipe({
    id: "semantic-to-runtime",
    from: "not-in-a-blueprint",
    to: "also-not-in-a-blueprint",
    representations: [{ id: "default" }],
    fallback: "default",
  });

  assert.equal(report.ok, true);
});

test("validateProjectionRecipe rejects unknown recipe fields", () => {
  const unknown = validateProjectionRecipe({
    id: "semantic-to-runtime",
    from: "semantic",
    to: "runtime",
    representations: [{ id: "desktop" }],
    fallback: "desktop",
    executor: "parallel-engine",
  });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some(({ detail }) => detail.includes("additional properties")));

  const legacyPatch = validateProjectionRecipe({
    id: "semantic-to-runtime",
    from: "semantic",
    to: "runtime",
    patch: [{ op: "removeCell", cellId: "legacy" }],
  });
  assert.equal(legacyPatch.ok, false);
});

test("Blueprint validation composes recipe-local semantic validation", () => {
  const report = runDeclarativeValidators([{ kind: "blueprint" }], {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "invalid-recipe",
      kind: "test",
      version: "1",
      serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
      serviceRecipes: [],
      projectionTiers: [{ id: "semantic", kind: "semantic" }, { id: "runtime", kind: "runtime-program" }],
      projectionRecipes: [{
        id: "semantic-to-runtime",
        from: "semantic",
        to: "runtime",
        representations: [{ id: "desktop", extends: "desktop" }],
        fallback: "desktop",
      }],
      runtime: {},
    },
  });

  assert.equal(report.ok, false);
  assert.ok(report.errors.some(({ detail }) => detail.includes("inheritance contains a cycle")));
});