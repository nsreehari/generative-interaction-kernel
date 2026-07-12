import assert from "node:assert/strict";
import { test } from "vitest";

import { createHostRegistry, DEFAULT_BUNDLE } from "./bundles";

test("host registry exposes the new sample bundles to the switcher", () => {
  const registry = createHostRegistry();

  assert.equal(DEFAULT_BUNDLE, "console");
  assert.equal(registry.has("reactive-demo"), true);
  assert.equal(registry.has("provider-authoring-demo"), true);
  assert.deepEqual(
    registry.ids({ listable: true }).filter((id) => id === "reactive-demo" || id === "provider-authoring-demo").sort(),
    ["provider-authoring-demo", "reactive-demo"]
  );
});

test("host registry keeps playground embed-only instead of switcher-visible", () => {
  const registry = createHostRegistry();

  assert.equal(registry.has("playground"), true);
  assert.equal(registry.ids({ listable: true }).includes("playground"), false);
  assert.equal(registry.ids().includes("playground"), true);
});