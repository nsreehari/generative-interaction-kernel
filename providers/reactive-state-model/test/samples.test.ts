import { test } from "vitest";
import assert from "node:assert/strict";

import { evalAsyncJsonata } from "../../../shared/libs/evaluators";
import { ReactiveStateModel } from "../src/reactive-state-model";
import { capacityBannerSample, profileFormSample } from "../src/samples";

const evaluate = (expr: string, scope: Record<string, unknown>) => evalAsyncJsonata(expr, scope as never);

test("profileFormSample maintains dotted form state, readiness, and submit label", async () => {
  const store = ReactiveStateModel.fromComputed(profileFormSample.computed, {
    evaluate,
    initial: profileFormSample.initial,
  });
  await store.settle();

  assert.equal(store.get("form.ready"), false);
  assert.equal(store.get("ui.submitLabel"), "Complete required fields");

  store.apply([
    { op: "set", path: "form.first", value: "Ada" },
    { op: "set", path: "form.last", value: "Lovelace" },
    { op: "set", path: "consent", value: true },
  ]);
  await store.settle();

  assert.equal(store.get("form.full"), "Ada Lovelace");
  assert.equal(store.get("form.ready"), true);
  assert.equal(store.get("ui.submitLabel"), "Create profile");

  store.apply([{ op: "set", path: "consent", value: false }]);
  await store.settle();

  assert.equal(store.get("form.ready"), false);
  assert.equal(store.get("ui.submitLabel"), "Complete required fields");
  await store.dispose();
});

test("capacityBannerSample cascades through transitive metrics and banner text", async () => {
  const store = ReactiveStateModel.fromComputed(capacityBannerSample.computed, {
    evaluate,
    initial: capacityBannerSample.initial,
  });
  await store.settle();

  assert.equal(store.get("metrics.total"), 4);
  assert.equal(store.get("metrics.remaining"), 6);
  assert.equal(store.get("metrics.overLimit"), false);
  assert.equal(store.get("ui.banner"), "Capacity available");

  store.apply([{ op: "set", path: "metrics.pending", value: 8 }]);
  await store.settle();

  assert.equal(store.get("metrics.total"), 11);
  assert.equal(store.get("metrics.remaining"), -1);
  assert.equal(store.get("metrics.overLimit"), true);
  assert.equal(store.get("ui.banner"), "Capacity exceeded");
  await store.dispose();
});