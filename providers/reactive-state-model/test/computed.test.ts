// The declarative `computed` construct (ADR-0033 amendment): authors declare WHAT a cell equals;
// dependencies are inferred from the expression, and the reactive store maintains the cascade.

import { test } from "vitest";
import assert from "node:assert/strict";

import { evalAsyncJsonata } from "@gik/evaluators";
import { ReactiveStateModel } from "../src/reactive-state-model";
import { extractDeps } from "../src/jsonata-deps";

const evaluate = (expr: string, scope: Record<string, unknown>) => evalAsyncJsonata(expr, scope as never);

test("extractDeps infers cell tokens from a JSONata expression", () => {
  assert.deepEqual(extractDeps("a + b").sort(), ["a", "b"]);
  assert.deepEqual(extractDeps('form.first & " " & form.last').sort(), ["form.first", "form.last"]);
  assert.deepEqual(extractDeps("x * 2 + x"), ["x"], "deduped");
  assert.deepEqual(extractDeps("42"), [], "no cells in a constant");
});

test("fromComputed auto-wires deps and cascades", async () => {
  const store = ReactiveStateModel.fromComputed(
    { total: "a + b" },
    { evaluate, initial: { a: 1, b: 2 } },
  );
  await store.settle();
  assert.equal(store.get("total"), 3, "deps inferred, seeded derive");

  store.apply([{ op: "set", path: "a", value: 5 }]);
  await store.settle();
  assert.equal(store.get("total"), 7, "recomputed on inferred dependency change");
  await store.dispose();
});

test("fromComputed infers dotted deps", async () => {
  const store = ReactiveStateModel.fromComputed(
    { "form.full": 'form.first & " " & form.last' },
    { evaluate, initial: { "form.first": "Ada", "form.last": "Lovelace" } },
  );
  await store.settle();
  assert.equal(store.get("form.full"), "Ada Lovelace");

  store.apply([{ op: "set", path: "form.last", value: "Byron" }]);
  await store.settle();
  assert.equal(store.get("form.full"), "Ada Byron");
  await store.dispose();
});

test("fromComputed chains computed-on-computed (dep is another computed cell)", async () => {
  const store = ReactiveStateModel.fromComputed(
    { sum: "a + b", double: "sum * 2" },
    { evaluate, initial: { a: 3, b: 4 } },
  );
  await store.settle();
  assert.equal(store.get("sum"), 7);
  assert.equal(store.get("double"), 14);

  store.apply([{ op: "set", path: "b", value: 10 }]);
  await store.settle();
  assert.equal(store.get("sum"), 13);
  assert.equal(store.get("double"), 26, "transitive cascade via inferred computed dependency");
  await store.dispose();
});
