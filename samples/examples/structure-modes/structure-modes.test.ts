import assert from "node:assert/strict";
import { test } from "vitest";
import { runStructureModesDemo } from "./structure-modes";

test("the manual structure-mode demo proves fixed, reconfigurable, and adaptive behavior", async () => {
  const result = await runStructureModesDemo();

  assert.equal(result.fixed.before, "fixed:before");
  assert.equal(result.fixed.after, "fixed:before");
  assert.match(result.fixed.rejection, /fixed-structure/);

  assert.equal(result.reconfigurable.before, "reconfigurable:before");
  assert.equal(result.reconfigurable.afterEvent, "reconfigurable:before");
  assert.equal(result.reconfigurable.afterReconfigure, "reconfigurable:after");
  assert.equal(result.reconfigurable.programPatch, "setRoot");

  assert.equal(result.adaptive.before, "adaptive:before");
  assert.equal(result.adaptive.afterEvent, "adaptive:after");
  assert.equal(result.adaptive.restored, "adaptive:before");
  assert.equal(result.adaptive.programPatch, "setRoot");
});