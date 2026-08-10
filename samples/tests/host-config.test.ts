import assert from "node:assert/strict";
import { test } from "vitest";

import { resolveSampleBlueprintSource } from "../shared/blueprint-catalog";
import { applyHostConfig, hostConfig, resolveHostEnvironment } from "../services/host/host-config";

test("host config defaults to production when no environment is set", () => {
  assert.equal(hostConfig.foundryProxyOrigin, "https://sz-foundry-proxy.azurewebsites.net");
  assert.equal(hostConfig.httpProxyOrigin, "https://sz-http-proxy.azurewebsites.net");
  assert.equal(resolveHostEnvironment({ MODE: "development" }), "production");
});

test("local host environment must be selected explicitly", () => {
  assert.equal(resolveHostEnvironment({
    MODE: "production",
    VITE_GIK_HOST_ENV: "local",
  }), "local");
  assert.equal(resolveHostEnvironment({ MODE: "gik-local" }), "local");
});

test("host environment rejects unknown explicit values", () => {
  assert.throws(
    () => resolveHostEnvironment({ MODE: "production", VITE_GIK_HOST_ENV: "staging" }),
    /Unsupported VITE_GIK_HOST_ENV 'staging'/
  );
});

test("host config replaces endpoint tokens without mutating the source", () => {
  const source = {
    services: [{
      config: {
        endpoint: "${GIK_FOUNDRY_PROXY_ORIGIN}",
        proxyEndpoint: "${GIK_HTTP_PROXY_ORIGIN}",
      },
    }],
  };

  const configured = applyHostConfig(source, {
    foundryProxyOrigin: "https://proxy.example.test",
    httpProxyOrigin: "https://http-proxy.example.test",
  });

  assert.equal(configured.services[0].config.endpoint, "https://proxy.example.test");
  assert.equal(configured.services[0].config.proxyEndpoint, "https://http-proxy.example.test");
  assert.equal(source.services[0].config.endpoint, "${GIK_FOUNDRY_PROXY_ORIGIN}");
  assert.equal(source.services[0].config.proxyEndpoint, "${GIK_HTTP_PROXY_ORIGIN}");
});

test.each(["foundry-agent", "foundry-agent-no-cells", "live-workspace-soc"])(
  "%s resolves every Foundry endpoint from host config",
  (blueprintId) => {
    const source = JSON.stringify(resolveSampleBlueprintSource(blueprintId));

    assert.equal(source.includes("${GIK_FOUNDRY_PROXY_ORIGIN}"), false);
    assert.equal(source.includes(hostConfig.foundryProxyOrigin), true);
  }
);

test("portfolio tracker resolves its HTTP proxy endpoint from host config", () => {
  const source = JSON.stringify(resolveSampleBlueprintSource("portfolio-tracker"));

  assert.equal(source.includes("${GIK_HTTP_PROXY_ORIGIN}"), false);
  assert.equal(source.includes(hostConfig.httpProxyOrigin), true);
});