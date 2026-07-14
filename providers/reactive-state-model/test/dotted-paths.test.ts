// Dotted / namespaced cell paths (ADR-0033 item 3): cells like `form.first`, `calc.sum` derive
// correctly because the derive expression is evaluated against the FULL snapshot (kernel-reducer
// semantics), so JSONata navigates dotted paths natively — no scope-aliasing or expr rewriting.

import { test } from "vitest";
import assert from "node:assert/strict";

import { evalAsyncJsonata } from "../../../shared/libs/evaluators";
import { ReactiveStateModel } from "../src/reactive-state-model";

const evaluate = (expr: string, scope: Record<string, unknown>) => evalAsyncJsonata(expr, scope as never);

test("dotted base cells derive a dotted target", async () => {
  const store = new ReactiveStateModel({
    edges: [{ target: "form.full", expr: 'form.first & " " & form.last', deps: ["form.first", "form.last"] }],
    evaluate,
    initial: { "form.first": "Ada", "form.last": "Lovelace" },
  });
  await store.settle();
  assert.equal(store.get("form.full"), "Ada Lovelace", "seeded dotted derive");

  store.apply([{ op: "set", path: "form.first", value: "Grace" }]);
  await store.settle();
  assert.equal(store.get("form.full"), "Grace Lovelace", "re-derived on dotted upstream change");

  // The snapshot composes dotted base + dotted derived into one navigable object.
  const snap = store.snapshot() as { form: { first: string; last: string; full: string } };
  assert.deepEqual(snap.form, { first: "Grace", last: "Lovelace", full: "Grace Lovelace" });
  await store.dispose();
});

test("dotted derived-on-derived chains cascade", async () => {
  const store = new ReactiveStateModel({
    edges: [
      { target: "calc.sum", expr: "a.x + a.y", deps: ["a.x", "a.y"] },
      { target: "calc.double", expr: "calc.sum * 2", deps: ["calc.sum"] },
    ],
    evaluate,
    initial: { "a.x": 3, "a.y": 4 },
  });
  await store.settle();
  assert.equal(store.get("calc.sum"), 7);
  assert.equal(store.get("calc.double"), 14);

  store.apply([{ op: "set", path: "a.x", value: 10 }]);
  await store.settle();
  assert.equal(store.get("calc.sum"), 14);
  assert.equal(store.get("calc.double"), 28, "transitive cascade through dotted derived cell");
  await store.dispose();
});

test("only genuine dotted dependents recompute", async () => {
  let derives = 0;
  const store = new ReactiveStateModel({
    edges: [
      { target: "out.a", expr: "in.x + 1", deps: ["in.x"] },
      { target: "out.b", expr: "in.y + 1", deps: ["in.y"] },
    ],
    evaluate,
    initial: { "in.x": 0, "in.y": 0 },
    onChange: () => { derives += 1; },
  });
  await store.settle();
  const afterSeed = derives;

  store.apply([{ op: "set", path: "in.x", value: 5 }]); // only out.a depends on in.x
  await store.settle();

  assert.equal(store.get("out.a"), 6);
  assert.equal(store.get("out.b"), 1, "untouched branch stays put");
  assert.equal(derives - afterSeed, 1, "exactly one derived cell recomputed");
  await store.dispose();
});
