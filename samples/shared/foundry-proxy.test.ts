import assert from "node:assert/strict";
import { test } from "vitest";

import { createFoundryProxy, FoundryProxyError } from "./foundry-proxy";

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