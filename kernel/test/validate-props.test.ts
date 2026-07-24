// ADR: enforce a capability's declared `propsSchema` at the document boundary. The kernel already
// runs structural (GIK) validation on construction; this peer check rejects a document whose static
// node props violate the manifest's per-capability props contract. A prop bound dynamically by a
// `read`/`readExpr` edge is exempt from `required` (it lands at resolve time, not authoring time).

import { test } from "vitest";
import assert from "node:assert/strict";

import { Kernel, authorProjectedProgram, node, envelope, ValidationError } from "../src/index";

// `metric` declares a props contract: a required string `label` and a required number `value`.
function manifestMsg() {
  return envelope("vocabulary", {
    version: "props-test/1",
    namespaces: ["local"],
    capabilities: {
      board: { slots: ["children"] },
      metric: {
        propsSchema: {
          type: "object",
          properties: { label: { type: "string" }, value: { type: "number" } },
          required: ["label", "value"],
          additionalProperties: false,
        },
      },
    },
  });
}

const board = (children: ReturnType<typeof node>[]) =>
  authorProjectedProgram(node("board", "root", { children }), { vocabulary: "props-test/1" });

test("valid static props pass the boundary", () => {
  const doc = board([node("metric", "m1", { props: { label: "CPU", value: 42 } })]);
  assert.doesNotThrow(() => new Kernel(manifestMsg(), doc));
});

test("an invalid static prop (wrong type) is rejected at construction", () => {
  const doc = board([node("metric", "m1", { props: { label: "CPU", value: "high" } })]);
  assert.throws(() => new Kernel(manifestMsg(), doc), ValidationError);
});

test("a missing required static prop is rejected at construction", () => {
  const doc = board([node("metric", "m1", { props: { label: "CPU" } })]);
  assert.throws(() => new Kernel(manifestMsg(), doc), ValidationError);
});

test("a required prop supplied via a read edge is exempt from the required check", () => {
  // `value` is not a static prop but is bound from the store — it lands at resolve time.
  const doc = board([node("metric", "m1", { props: { label: "CPU" }, read: { value: "local.cpu" } })]);
  assert.doesNotThrow(() => new Kernel(manifestMsg(), doc));
});

test("validate:false bypasses the props boundary", () => {
  const doc = board([node("metric", "m1", { props: { label: "CPU", value: "high" } })]);
  assert.doesNotThrow(() => new Kernel(manifestMsg(), doc, { validate: false }));
});

test("a list-like dataProp readExpr must be bracket-wrapped to preserve singleton arrays", () => {
  const doc = authorProjectedProgram(node("board", "root", {
    children: [node("table", "t1", { readExpr: { rows: 'local.quotes.{ "ticker": ticker, "price": price }' } })],
  }), { vocabulary: "props-test/1" });
  const manifest = envelope("vocabulary", {
    version: "props-test/1",
    namespaces: ["local"],
    capabilities: {
      board: { slots: ["children"] },
      table: {
        propsSchema: {
          type: "object",
          properties: { rows: { type: "array" } },
          additionalProperties: true,
        },
        dataProp: "rows",
      },
    },
  });
  assert.throws(() => new Kernel(manifest, doc), ValidationError);
});

test("a list-like dataProp readExpr may be bracket-wrapped to preserve singleton arrays", () => {
  const doc = authorProjectedProgram(node("board", "root", {
    children: [node("table", "t1", { readExpr: { rows: '[local.quotes.{ "ticker": ticker, "price": price }]' } })],
  }), { vocabulary: "props-test/1" });
  const manifest = envelope("vocabulary", {
    version: "props-test/1",
    namespaces: ["local"],
    capabilities: {
      board: { slots: ["children"] },
      table: {
        propsSchema: {
          type: "object",
          properties: { rows: { type: "array" } },
          additionalProperties: true,
        },
        dataProp: "rows",
      },
    },
  });
  assert.doesNotThrow(() => new Kernel(manifest, doc));
});
