import assert from "node:assert/strict";
import { test } from "vitest";

import { evalAsyncJsonata, evalSyncJsonata } from "../evaluators";

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