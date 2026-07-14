import assert from "node:assert/strict";
import { test } from "vitest";

import { runDeclarativeValidators } from "../validators";

test("runDeclarativeValidators accepts legacy jsonata forms and explicit special validators", () => {
  const errors = runDeclarativeValidators([
    ["$length(data.name) > 0", "name required"],
    { expr: "$length(data.title) > 0", message: "title required" },
    { kind: "ajv-schema", schema: { type: "object", required: ["id"] }, message: "invalid nested" },
    { kind: "typedef", type: "object", message: "title type" },
  ], { name: "", title: "", id: 123 });

  assert.deepEqual(errors, ["name required", "title required"]);
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
  const errors = runDeclarativeValidators(validators, value);

  assert.deepEqual(errors, [
    "title mismatch",
    "value schema failed: /item must have required property 'id'",
  ]);
});

test("runDeclarativeValidators supports ajv-schema refs", () => {
  const errors = runDeclarativeValidators([
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

  assert.deepEqual(errors, ["value schema failed: /child must have required property 'id'"]);
});