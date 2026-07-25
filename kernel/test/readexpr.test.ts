// The readExpr edge (shaped read). A value position: the interpreter evaluates each expression
// against the state snapshot on the FULL provider (like derive / assign-from), so an authored
// document can project / filter / sort an array into the exact shape a capability wants instead
// of a host reshaping it imperatively. Plain `read` (path pluck) is unchanged.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  resolveNode,
  type CapabilityRegistry,
} from "../src/index";

const registry: CapabilityRegistry = { has: () => true, get: () => undefined };

function ctx(store: InMemoryStateModel) {
  return { store, expr: new JsonataExpressionProvider(), registry };
}

test("readExpr projects an array of objects into a capability-shaped list", async () => {
  const store = new InMemoryStateModel(["sample"]);
  store.apply([
    {
      op: "set",
      path: "sample.facets",
      value: [
        { name: "context", role: "narrative", required: true },
        { name: "timeline", role: "sequence", required: false },
      ],
    },
  ]);

  const node = {
    id: "facets",
    capability: "list",
    edges: {
      readExpr: {
        items: '[sample.facets.{ "name": name, "role": role, "tag": required ? "required" : "optional" }]',
      },
    },
  };

  const resolved = await resolveNode(node, ctx(store));
  // JSONata's object constructor yields null-prototype objects; normalize to the JSON shape
  // that actually crosses the transport before comparing.
  assert.deepEqual(JSON.parse(JSON.stringify(resolved.props.items)), [
    { name: "context", role: "narrative", tag: "required" },
    { name: "timeline", role: "sequence", tag: "optional" },
  ]);
});

test("the bracket form keeps a single-element projection an array (JSONata singleton guard)", async () => {
  const store = new InMemoryStateModel(["sample"]);
  store.apply([{ op: "set", path: "sample.facets", value: [{ name: "only", role: "solo", required: true }] }]);

  const node = {
    id: "facets",
    capability: "list",
    edges: { readExpr: { items: '[sample.facets.{ "name": name, "tag": required ? "required" : "optional" }]' } },
  };

  const resolved = await resolveNode(node, ctx(store));
  assert.deepEqual(JSON.parse(JSON.stringify(resolved.props.items)), [{ name: "only", tag: "required" }]);
});

test("readExpr runs after read, so an expression can reshape a same-named plain-read prop", async () => {
  const store = new InMemoryStateModel(["ns"]);
  store.apply([{ op: "set", path: "ns.count", value: 3 }]);

  const node = {
    id: "n",
    capability: "note",
    edges: {
      read: { value: "ns.count" },
      readExpr: { value: '"count is " & $string(ns.count)' },
    },
  };

  const resolved = await resolveNode(node, ctx(store));
  assert.equal(resolved.props.value, "count is 3");
});
