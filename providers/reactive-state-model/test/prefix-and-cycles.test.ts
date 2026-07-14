// Prefix-aware retriggering + cycle detection (ADR-0033 provider refinements).
//
// - A derive reads the FULL snapshot, so writing a parent object (`a`) must retrigger a dependent on
//   a child cell (`a.x`), and writing a child (`a.x`) must retrigger a dependent on the parent (`a`).
// - A cyclic derivation (`a -> b -> a`) is rejected at construction, before it can spin the graph.

import { test } from "vitest";
import assert from "node:assert/strict";

import { evalAsyncJsonata } from "../../../shared/libs/evaluators";
import { ReactiveStateModel } from "../src/reactive-state-model";

const evaluate = (expr: string, scope: Record<string, unknown>) => evalAsyncJsonata(expr, scope as never);

test("writing a parent object retriggers a dependent on a child cell", async () => {
  const store = new ReactiveStateModel({
    edges: [{ target: "out", expr: "a.x + 1", deps: ["a.x"] }],
    evaluate,
    initial: { "a.x": 1 },
  });
  await store.settle();
  assert.equal(store.get("out"), 2, "seeded from the child cell");

  // Replace the WHOLE parent object — the touched op path ("a") is an ancestor of the dep ("a.x").
  store.apply([{ op: "set", path: "a", value: { x: 9 } }]);
  await store.settle();
  assert.equal(store.get("out"), 10, "parent-object write re-derived the child-dependent cell");
  await store.dispose();
});

test("writing a child cell retriggers a dependent on the parent object", async () => {
  const store = new ReactiveStateModel({
    edges: [{ target: "sum", expr: "a.x + a.y", deps: ["a"] }],
    evaluate,
    initial: { a: { x: 1, y: 2 } },
  });
  await store.settle();
  assert.equal(store.get("sum"), 3, "seeded from the parent object");

  // Mutate a CHILD path — the touched op path ("a.x") is a descendant of the dep ("a").
  store.apply([{ op: "set", path: "a.x", value: 10 }]);
  await store.settle();
  assert.equal(store.get("sum"), 12, "child write re-derived the parent-dependent cell");
  await store.dispose();
});

test("a directly-written cell with no dependents is harmless (no matching graph task)", async () => {
  const store = new ReactiveStateModel({
    edges: [{ target: "out", expr: "a + 1", deps: ["a"] }],
    evaluate,
    initial: { a: 1 },
  });
  await store.settle();

  // "loose" is not a dep of anything; retriggering it must not throw or disturb derived state.
  store.apply([{ op: "set", path: "loose", value: 42 }]);
  await store.settle();
  assert.equal(store.get("loose"), 42, "raw value stored");
  assert.equal(store.get("out"), 2, "unrelated derived cell unaffected");
  await store.dispose();
});

test("a two-cell cycle (a -> b -> a) is rejected at construction", () => {
  assert.throws(
    () =>
      new ReactiveStateModel({
        edges: [
          { target: "a", expr: "b + 1", deps: ["b"] },
          { target: "b", expr: "a + 1", deps: ["a"] },
        ],
        evaluate,
      }),
    /cyclic computed dependency/,
  );
});

test("a longer cycle (a -> b -> c -> a) is rejected at construction", () => {
  assert.throws(
    () =>
      new ReactiveStateModel({
        edges: [
          { target: "a", expr: "c + 1", deps: ["c"] },
          { target: "b", expr: "a + 1", deps: ["a"] },
          { target: "c", expr: "b + 1", deps: ["b"] },
        ],
        evaluate,
      }),
    /cyclic computed dependency detected: /,
  );
});

test("an acyclic diamond (a,b -> c,d -> e) constructs and derives", async () => {
  const store = new ReactiveStateModel({
    edges: [
      { target: "c", expr: "a + b", deps: ["a", "b"] },
      { target: "d", expr: "a - b", deps: ["a", "b"] },
      { target: "e", expr: "c * d", deps: ["c", "d"] },
    ],
    evaluate,
    initial: { a: 5, b: 3 },
  });
  await store.settle();
  assert.equal(store.get("c"), 8);
  assert.equal(store.get("d"), 2);
  assert.equal(store.get("e"), 16, "diamond converges without a false cycle report");
  await store.dispose();
});
