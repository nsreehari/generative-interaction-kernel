import assert from "node:assert/strict";
import { test } from "vitest";

import type { WorkerServiceInvocation } from "../apps/service-kinds/worker-service-kind";
import { executeHttpServiceInvocation } from "../apps/service-kinds/http-service/runtime";

const declaration = {
  kind: "http-service",
  version: "1",
  operations: {},
  config: { endpoint: "https://proxy.example", credentialRef: "http-proxy/access-key" },
} as WorkerServiceInvocation["declaration"];

test("checks HTTP proxy access with the configured Function key", async () => {
  let captured: { input?: RequestInfo | URL; init?: RequestInit } = {};
  const output = await executeHttpServiceInvocation({
    kind: "http-service",
    declaration,
    operation: "check-access",
    input: null,
  }, {
    proxyOrigin: "https://proxy.example/",
    accessKey: "http-key",
    fetch: async (input, init) => {
      captured = { input, init };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.deepEqual(output, { ok: true });
  assert.equal(captured.input, "https://proxy.example/api/access/check");
  assert.equal(new Headers(captured.init?.headers).get("x-functions-key"), "http-key");
});

test("routes declared requests through the authenticated HTTP proxy", async () => {
  let captured: { input?: RequestInfo | URL; init?: RequestInit } = {};
  await executeHttpServiceInvocation({
    kind: "http-service",
    declaration,
    operation: "fetch-quotes",
    input: { requests: { key: "MSFT", url: "https://query1.finance.yahoo.com/chart/MSFT?range=1d" } },
  }, {
    proxyOrigin: "https://proxy.example",
    accessKey: "http-key",
    fetch: async (input, init) => {
      captured = { input, init };
      return new Response(JSON.stringify({ chart: { result: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const headers = new Headers(captured.init?.headers);
  assert.equal(captured.input, "https://proxy.example/api/http-proxy");
  assert.equal(captured.init?.cache, "no-store");
  assert.equal(headers.get("x-functions-key"), "http-key");
  assert.equal(headers.get("x-http-proxy-url"), "https://query1.finance.yahoo.com/chart/MSFT?range=1d");
});