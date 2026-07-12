// Region edit transforms (the write side of the editing surface). These are the pure prev-edits ->
// next-edits reducers the region editor's controls funnel through — hoisted to the interaction lib
// so a non-UI caller (an agent authoring overrides, or this test) mutates a PresentationEdits the
// same way the drag/select UI does. Order transforms take the current display order and return the
// SAME reference on a no-op.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  emptyEdits,
  moveRegion,
  reorderRegion,
  setRegionDisclosure,
  setRegionPriority,
  toggleRegion,
} from "../src/index";

const ORDER = ["context", "evidence", "timeline"];

test("toggleRegion adds then removes a region from disabled (immutably)", () => {
  const hidden = toggleRegion(emptyEdits, "timeline");
  assert.deepEqual(hidden.disabled, ["timeline"]);
  assert.deepEqual(emptyEdits.disabled, []); // input untouched
  assert.deepEqual(toggleRegion(hidden, "timeline").disabled, []);
});

test("setRegionPriority / setRegionDisclosure record sparse per-region overrides", () => {
  const a = setRegionPriority(emptyEdits, "context", "primary");
  assert.deepEqual(a.priority, { context: "primary" });
  const b = setRegionDisclosure(a, "context", "collapsed");
  assert.deepEqual(b.disclosure, { context: "collapsed" });
  assert.deepEqual(b.priority, { context: "primary" }); // preserved
});

test("reorderRegion pins the dragged region into the target's slot from the full display order", () => {
  const next = reorderRegion(emptyEdits, ORDER, "timeline", "context");
  assert.deepEqual(next.order, ["timeline", "context", "evidence"]);
});

test("reorderRegion is a no-op (same reference) for equal names or absent names", () => {
  assert.equal(reorderRegion(emptyEdits, ORDER, "context", "context"), emptyEdits);
  assert.equal(reorderRegion(emptyEdits, ORDER, "ghost", "context"), emptyEdits);
});

test("moveRegion nudges one slot and is a no-op (same reference) at the ends", () => {
  assert.deepEqual(moveRegion(emptyEdits, ORDER, "evidence", -1).order, ["evidence", "context", "timeline"]);
  assert.deepEqual(moveRegion(emptyEdits, ORDER, "evidence", 1).order, ["context", "timeline", "evidence"]);
  assert.equal(moveRegion(emptyEdits, ORDER, "context", -1), emptyEdits);
  assert.equal(moveRegion(emptyEdits, ORDER, "timeline", 1), emptyEdits);
});

test("an agent can compose transforms to author a full override set without any UI", () => {
  let edits = emptyEdits;
  edits = toggleRegion(edits, "evidence");
  edits = setRegionPriority(edits, "context", "primary");
  edits = moveRegion(edits, ORDER, "timeline", -1);
  assert.deepEqual(edits, {
    disabled: ["evidence"],
    priority: { context: "primary" },
    disclosure: {},
    order: ["context", "timeline", "evidence"],
  });
});
