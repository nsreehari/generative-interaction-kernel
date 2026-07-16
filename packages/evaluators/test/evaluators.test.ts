import assert from "node:assert/strict";
import { test } from "vitest";

import { evalAsyncJsonata, evalSyncJsonata, executeSyncJsonataSteps } from "../src";

test("evalSyncJsonata evaluates JSONata against JSON input", () => {
  const result = evalSyncJsonata("items[name='b'].value", {
    items: [
      { name: "a", value: 1 },
      { name: "b", value: 2 },
    ],
  });

  assert.equal(result, 2);
});

test("evalSyncJsonata normalizes missing results to null", () => {
  const result = evalSyncJsonata("missing.path", {
    present: true,
  });

  assert.equal(result, null);
});

test("evalAsyncJsonata evaluates JSONata against JSON input", async () => {
  const result = await evalAsyncJsonata("items[name='b'].value", {
    items: [
      { name: "a", value: 1 },
      { name: "b", value: 2 },
    ],
  });

  assert.equal(result, 2);
});

test("evalAsyncJsonata accepts JSON bindings", async () => {
  const result = await evalAsyncJsonata("$event.value", { present: true }, {
    event: { value: "ok" },
  });

  assert.equal(result, "ok");
});

test("executeSyncJsonataSteps runs ordered steps against a local binding scope", () => {
  const result = executeSyncJsonataSteps({
    steps: [
      { expr: "user.name", writeTo: "name" },
      { expr: "$uppercase($name)", writeTo: "upperName" },
      { expr: '$upperName & ":" & user.id', writeTo: "summary" },
    ],
    data: {
      user: { id: "u1", name: "alice" },
    },
    returnKeys: ["name", "summary"],
  });

  assert.deepEqual(result, {
    name: "alice",
    summary: "ALICE:u1",
  });
});

test("executeSyncJsonataSteps seeds and returns local bindings when no return keys are specified", () => {
  const result = executeSyncJsonataSteps({
    steps: [{ expr: "$prefix & value", writeTo: "label" }],
    data: { value: "-42" },
    bindings: { prefix: "item" },
  });

  assert.deepEqual(result, {
    prefix: "item",
    label: "item-42",
  });
});

test("executeSyncJsonataSteps applies later writes in array order", () => {
  const result = executeSyncJsonataSteps({
    steps: [
      { expr: "value", writeTo: "current" },
      { expr: "$current & '-next'", writeTo: "current" },
    ],
    data: { value: "step" },
    returnKeys: ["current"],
  });

  assert.deepEqual(result, {
    current: "step-next",
  });
});