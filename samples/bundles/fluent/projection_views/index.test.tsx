import assert from "node:assert/strict";
import { test } from "vitest";
import { FallbackView, buildRegistryFromImports } from "@gik/react";

import fluentViews from "./fluentLeaves";

const registry = buildRegistryFromImports(
  { fluent: { from: "fluent", use: ["button", "dropdown", "icon-button", "switch", "toggle"] } },
  (from) => from === "fluent" ? fluentViews : undefined,
  FallbackView
);

test("fluent bundle exposes and resolves its declared component capabilities", () => {
  const capabilities = ["button", "dropdown", "icon-button", "switch", "toggle"];
  assert.deepEqual(Object.keys(fluentViews).sort(), capabilities);
  for (const capability of capabilities) {
    assert.equal(typeof registry.get(`fluent:${capability}`), "function");
  }
});