import { test } from "vitest";
import assert from "node:assert/strict";

import {
  JsonataExpressionProvider,
  SafeExpressionError,
  SyncJsonataExpressionProvider,
} from "../src/index";

test("sync provider evaluates ordinary expressions synchronously", () => {
  const sync = new SyncJsonataExpressionProvider();
  assert.equal(sync.eval("count > 3", { count: 4 }), true);
  assert.equal(sync.eval("user.name", { user: { name: "Ada" } }), "Ada");
});

test("sync provider safe mode rejects unsafe constructs at compile time", () => {
  const safe = new SyncJsonataExpressionProvider({ safe: true });
  assert.throws(() => safe.eval('$eval("1+1")', {}), (err: unknown) => err instanceof SafeExpressionError);
});

test("sync and async providers agree on a simple expression result", async () => {
  const sync = new SyncJsonataExpressionProvider();
  const asyncProvider = new JsonataExpressionProvider();
  const data = { count: 4, user: { id: "u1" } };
  assert.equal(sync.eval("count > 3 and $exists(user.id)", data), await asyncProvider.eval("count > 3 and $exists(user.id)", data));
});

test("sync and async providers agree on object projection results", async () => {
  const sync = new SyncJsonataExpressionProvider();
  const asyncProvider = new JsonataExpressionProvider();
  const expression = "findings.{'id': id, 'claim': claim}";
  const data = { findings: [{ id: "f1", claim: "First" }, { id: "f2", claim: "Second" }] };

  assert.deepEqual(sync.eval(expression, data), await asyncProvider.eval(expression, data));
});

test("sync and async providers agree on nested array construction", async () => {
  const sync = new SyncJsonataExpressionProvider();
  const asyncProvider = new JsonataExpressionProvider();
  const expression = "{'tiers': [{'id': 'runtime', 'kind': 'runtime-document'}], 'recipes': []}";

  assert.deepEqual(sync.eval(expression, {}), await asyncProvider.eval(expression, {}));
});