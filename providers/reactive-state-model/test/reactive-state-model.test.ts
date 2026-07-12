// Proves the first honest use of a yaml-flow engine inside genui (ADR-0033): the vendored reactive
// dependency graph, driven through a genui StateModel, with the kernel's own JSONata provider as the
// derive evaluator. No kernel changes — this is a drop-in `store`.

import { test } from "vitest";
import assert from "node:assert/strict";

import { JsonataExpressionProvider } from "../../../kernel/src/index";
import { ReactiveStateModel } from "../src/reactive-state-model";

function jsonataEvaluate() {
  const provider = new JsonataExpressionProvider();
  return (expr: string, scope: Record<string, unknown>) => provider.eval(expr, scope);
}

test("a base-cell apply cascades to a derived cell", async () => {
  const store = new ReactiveStateModel({
    edges: [{ target: "total", expr: "a + b", deps: ["a", "b"] }],
    evaluate: jsonataEvaluate(),
    initial: { a: 0, b: 0 },
  });

  store.apply([
    { op: "set", path: "a", value: 2 },
    { op: "set", path: "b", value: 3 },
  ]);
  await store.settle();

  assert.equal(store.get("total"), 5);
  await store.dispose();
});

test("an upstream change re-derives only downstream", async () => {
  const store = new ReactiveStateModel({
    edges: [{ target: "total", expr: "a + b", deps: ["a", "b"] }],
    evaluate: jsonataEvaluate(),
    initial: { a: 2, b: 3 },
  });
  await store.settle();
  assert.equal(store.get("total"), 5);

  store.apply([{ op: "set", path: "a", value: 10 }]);
  await store.settle();

  assert.equal(store.get("total"), 13);
  assert.equal(store.get("a"), 10);
  assert.equal(store.get("b"), 3);
  await store.dispose();
});

test("derived-on-derived chains cascade transitively", async () => {
  const store = new ReactiveStateModel({
    edges: [
      { target: "total", expr: "a + b", deps: ["a", "b"] },
      { target: "doubled", expr: "total * 2", deps: ["total"] },
    ],
    evaluate: jsonataEvaluate(),
    initial: { a: 1, b: 4 },
  });
  await store.settle();
  assert.equal(store.get("total"), 5);
  assert.equal(store.get("doubled"), 10);

  store.apply([{ op: "set", path: "b", value: 9 }]);
  await store.settle();

  assert.equal(store.get("total"), 10);
  assert.equal(store.get("doubled"), 20);
  await store.dispose();
});

test("onChange fires as derived cells settle", async () => {
  let changes = 0;
  const store = new ReactiveStateModel({
    edges: [{ target: "total", expr: "a + b", deps: ["a", "b"] }],
    evaluate: jsonataEvaluate(),
    initial: { a: 0, b: 0 },
    onChange: () => { changes += 1; },
  });
  await store.settle();
  const baseline = changes;

  store.apply([{ op: "set", path: "a", value: 7 }]);
  await store.settle();

  assert.ok(changes > baseline, "expected onChange to fire on re-derive");
  assert.equal(store.get("total"), 7);
  await store.dispose();
});
