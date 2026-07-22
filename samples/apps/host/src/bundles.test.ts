import assert from "node:assert/strict";
import { test } from "vitest";
import { unwrap } from "@gik/kernel";

import { createHostRegistry, DEFAULT_BLUEPRINT, resolveBundleProjectionViews } from "./bundles";
import { openSampleBlueprint } from "../../../shared/blueprints";

test("host registry exposes only approved Blueprints to the switcher", () => {
  const registry = createHostRegistry();

  assert.equal(DEFAULT_BLUEPRINT, "samples-overview");
  assert.equal(registry.has("samples-overview"), true);
  assert.equal(registry.has("manage-blueprints"), true);
  assert.equal(registry.has("manage-bundles"), true);
  assert.equal(registry.has("copilot-c2"), true);
  assert.equal(registry.has("foundry-agent"), true);
  assert.equal(registry.has("foundry-agent-no-cells"), true);
  assert.equal(registry.has("live-workspace-soc"), true);
  assert.equal(registry.has("portfolio-tracker"), true);
  assert.equal(registry.has("portfolio-tracker-no-cells"), false);
  assert.deepEqual(
    [...registry.ids({ listable: true })].sort(),
    ["copilot-c2", "foundry-agent", "foundry-agent-no-cells", "live-workspace-soc", "manage-blueprints", "manage-bundles", "portfolio-tracker", "samples-overview"]
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
  const foundryProviderViews = resolveBundleProjectionViews("foundry");
  assert.equal(typeof foundryProviderViews?.["access-gate"], "function");
  const foundryViews = resolveBundleProjectionViews("foundry-agent");
  assert.equal(foundryViews?.["access-modal"], undefined);
  assert.equal(typeof foundryViews?.["agent-selector"], "function");
  const fluentViews = resolveBundleProjectionViews("fluent");
  assert.equal(typeof fluentViews?.dropdown, "function");
  assert.equal(typeof fluentViews?.switch, "function");
  assert.equal(typeof fluentViews?.toggle, "function");
  assert.equal(resolveBundleProjectionViews("missing-bundle"), undefined);
});

test("copilot-c2 opens as a declarative MCP-backed Blueprint", () => {
  const runtime = openSampleBlueprint("copilot-c2");
  const services = unwrap(runtime.manifest).externals?.services as Record<string, { kind?: string }>;

  assert.equal(runtime.blueprintId, "copilot-c2");
  assert.equal(Object.keys(services).length, 5);
  assert.deepEqual(
    Object.values(services).map((service) => service.kind),
    ["mcp", "mcp", "mcp", "mcp", "mcp"]
  );
});