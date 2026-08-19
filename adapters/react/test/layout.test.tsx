import assert from "node:assert/strict";
import { test } from "vitest";

import { resolveLayoutSlots } from "../src/layout";

const items = [
  { key: "first", content: "First" },
  { key: "second", content: "Second" },
  { key: "third", content: "Third" },
];

test("resolveLayoutSlots groups component-local items while preserving source order", () => {
  const resolved = resolveLayoutSlots(items, {
    slots: [
      { key: "second", slot: "secondary" },
      { key: "first", slot: "secondary" },
    ],
  });

  assert.deepEqual(resolved.children, ["Third"]);
  assert.deepEqual(resolved.slots, { secondary: ["First", "Second"] });
});

test("resolveLayoutSlots leaves items in the default group without assignments", () => {
  assert.deepEqual(resolveLayoutSlots(items), {
    children: ["First", "Second", "Third"],
    slots: {},
  });
});

test("resolveLayoutSlots treats the explicit children group as the default", () => {
  const resolved = resolveLayoutSlots(items, {
    slots: [{ key: "second", slot: "children" }],
  });

  assert.deepEqual(resolved.children, ["First", "Second", "Third"]);
  assert.deepEqual(resolved.slots, {});
});
