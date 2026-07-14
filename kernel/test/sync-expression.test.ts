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