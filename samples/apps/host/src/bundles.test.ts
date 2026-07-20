import assert from "node:assert/strict";
import { test } from "vitest";

import { createHostRegistry, DEFAULT_BLUEPRINT, resolveBundleProjectionViews } from "./bundles";

test("host registry exposes only approved Blueprints to the switcher", () => {
  const registry = createHostRegistry();

  assert.equal(DEFAULT_BLUEPRINT, "samples-overview");
  assert.equal(registry.has("samples-overview"), true);
  assert.equal(registry.has("manage-blueprints"), true);
  assert.equal(registry.has("manage-bundles"), true);
  assert.equal(registry.has("foundry-agent"), true);
  assert.equal(registry.has("live-workspace-soc"), true);
  assert.equal(registry.has("portfolio-tracker"), true);
  assert.deepEqual(
    [...registry.ids({ listable: true })].sort(),
    ["foundry-agent", "live-workspace-soc", "manage-blueprints", "manage-bundles", "portfolio-tracker", "samples-overview"]
  );
  assert.equal(registry.has("reactive-demo"), false);
  assert.equal(registry.has("provider-authoring-demo"), false);
  assert.equal(registry.has("workbench"), false);
});

test("host registry keeps playground embed-only instead of switcher-visible", () => {
  const registry = createHostRegistry();

  assert.equal(registry.has("playground"), true);
  assert.equal(registry.ids({ listable: true }).includes("playground"), false);
  assert.equal(registry.ids().includes("playground"), true);
});

test("host projection imports can resolve another bundle by id", () => {
  const foundryViews = resolveBundleProjectionViews("foundry-agent");
  assert.equal(typeof foundryViews?.["access-modal"], "function");
  const fluentViews = resolveBundleProjectionViews("fluent");
  assert.equal(typeof fluentViews?.dropdown, "function");
  assert.equal(typeof fluentViews?.switch, "function");
  assert.equal(typeof fluentViews?.toggle, "function");
  assert.equal(resolveBundleProjectionViews("missing-bundle"), undefined);
});