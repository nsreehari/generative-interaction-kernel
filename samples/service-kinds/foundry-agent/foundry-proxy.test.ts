import assert from "node:assert/strict";
import { test } from "vitest";

import { parseFoundryJsonReply } from "./index";
import { createFoundryProxy, FoundryProxyError } from "./foundry-proxy";

test("Foundry JSON response mode parses a complete artifact", () => {
  assert.deepEqual(
    parseFoundryJsonReply('{"gik":"0.1","type":"blueprint","payload":{"id":"generated-report"}}'),
    { gik: "0.1", type: "blueprint", payload: { id: "generated-report" } },
  );
  assert.throws(
    () => parseFoundryJsonReply("```json\n{}\n```"),
    /Foundry agent returned invalid JSON/,
  );
});

test("Foundry JSON response mode repairs only one omitted root delimiter", () => {
  assert.deepEqual(
    parseFoundryJsonReply('{"gik":"0.1","payload":{"cells":{}}'),
    { gik: "0.1", payload: { cells: {} } },
  );
  assert.throws(
    () => parseFoundryJsonReply('{"gik":"0.1","payload":{"cells":{}'),
    /Foundry agent returned invalid JSON/,
  );
});

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

test("Foundry proxy allows chat to outlive the short access timeout", async () => {
  const proxy = createFoundryProxy({
    baseUrl: "https://proxy.example/",
    key: "function-key",
    timeoutMs: 5,
    chatTimeoutMs: 50,
    fetch: async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return Response.json({ conversationId: "conv-1", responseId: "resp-1", reply: "{}" });
    },
  });

  const result = await proxy.chat({ message: "portfolio", agentName: "Portfolio-Intelligence-2-Agent" });

  assert.equal(result.responseId, "resp-1");
});

test("Foundry proxy identifies chat timeouts as response failures", async () => {
  const proxy = createFoundryProxy({
    baseUrl: "https://proxy.example/",
    key: "function-key",
    chatTimeoutMs: 5,
    fetch: async () => new Promise<Response>(() => {}),
  });

  await assert.rejects(
    proxy.chat({ message: "portfolio", agentName: "Portfolio-Intelligence-2-Agent" }),
    (error: unknown) => error instanceof FoundryProxyError
      && error.status === 408
      && error.message === "Foundry agent response timed out. Retry analysis."
  );
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