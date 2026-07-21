import assert from "node:assert/strict";
import { test } from "vitest";

import { createFoundryProxy, FoundryProxyError } from "./foundry-proxy";

test("Foundry proxy checks access without loading agents", async () => {
  let requestUrl = "";
  let request: RequestInit | undefined;
  const proxy = createFoundryProxy({
    baseUrl: "https://proxy.example/",
    key: "function-key",
    fetch: async (url, init) => {
      requestUrl = String(url);
      request = init;
      return Response.json({ ok: true });
    },
  });

  await proxy.checkAccess();

  assert.equal(requestUrl, "https://proxy.example/api/access/check");
  assert.equal(request?.method, "GET");
  assert.equal((request?.headers as Record<string, string>)["x-functions-key"], "function-key");
});

test("Foundry proxy chat sends agent name, conversation, and per-turn instructions", async () => {
  let request: RequestInit | undefined;
  const proxy = createFoundryProxy({
    baseUrl: "https://proxy.example/",
    key: "function-key",
    fetch: async (_url, init) => {
      request = init;
      return Response.json({ conversationId: "conv-1", responseId: "resp-1", reply: "{}" });
    },
  });

  const result = await proxy.chat({
    message: "incident context",
    agentName: "SOC-Correlation-Agent",
    conversationId: "conv-1",
    instructions: "Return schema version 1.",
  });

  assert.deepEqual(JSON.parse(String(request?.body)), {
    message: "incident context",
    agentName: "SOC-Correlation-Agent",
    conversationId: "conv-1",
    instructions: "Return schema version 1.",
  });
  assert.equal((request?.headers as Record<string, string>)["x-functions-key"], "function-key");
  assert.equal(result.responseId, "resp-1");
});

test("Foundry proxy exposes service errors without leaking response bodies", async () => {
  const proxy = createFoundryProxy({
    baseUrl: "https://proxy.example",
    key: "bad-key",
    fetch: async () => Response.json({ error: "Access denied" }, { status: 403 }),
  });

  await assert.rejects(
    proxy.ping("SOC-Response-Agent"),
    (error: unknown) => error instanceof FoundryProxyError && error.status === 403 && error.message === "Access denied"
  );
});

test("Foundry proxy times out hung requests so the access gate can recover", async () => {
  const proxy = createFoundryProxy({
    baseUrl: "https://proxy.example",
    key: "stale-key",
    timeoutMs: 5,
    fetch: async () => new Promise<Response>(() => {}),
  });

  await assert.rejects(
    proxy.listAgents(),
    (error: unknown) => error instanceof FoundryProxyError
      && error.status === 408
      && error.message === "Timed out checking Foundry access. Retry or enter a new access key."
  );
});