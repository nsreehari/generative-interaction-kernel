import assert from "node:assert/strict";
import { test } from "vitest";

import { resolveSampleBlueprintSource } from "./blueprints";
import { applyHostConfig, hostConfig } from "./host-config";

test("local host config points Foundry services at the local Function host", () => {
  assert.equal(hostConfig.foundryProxyOrigin, "http://localhost:7071");
});

test("host config replaces endpoint tokens without mutating the source", () => {
  const source = {
    services: [{ config: { endpoint: "${GIK_FOUNDRY_PROXY_ORIGIN}" } }],
  };

  const configured = applyHostConfig(source, {
    foundryProxyOrigin: "https://proxy.example.test",
  });

  assert.equal(configured.services[0].config.endpoint, "https://proxy.example.test");
  assert.equal(source.services[0].config.endpoint, "${GIK_FOUNDRY_PROXY_ORIGIN}");
});

test.each(["foundry-agent", "foundry-agent-no-cells", "live-workspace-soc"])(
  "%s resolves every Foundry endpoint from host config",
  (blueprintId) => {
    const source = JSON.stringify(resolveSampleBlueprintSource(blueprintId));

    assert.equal(source.includes("${GIK_FOUNDRY_PROXY_ORIGIN}"), false);
    assert.equal(source.includes(hostConfig.foundryProxyOrigin), true);
  }
);