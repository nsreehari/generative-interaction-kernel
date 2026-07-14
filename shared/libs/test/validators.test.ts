import assert from "node:assert/strict";
import { test } from "vitest";

import { runDeclarativeValidators } from "../validators";

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