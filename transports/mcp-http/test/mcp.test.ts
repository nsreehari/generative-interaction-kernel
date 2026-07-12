// The MCP-over-HTTP transport adapter: proves an injected face/projection is reachable over a real
// loopback socket as JSON-RPC 2.0 — initialize handshake, tool discovery, a tool call, the
// notification (no-id) 204 path, endpoint advertisement, and CORS preflight. The adapter is pure
// wire glue over a transport-free dispatcher, so this exercises the seam, not the tools themselves.

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { createStatelessAgentFaceDispatcher } from "../../../face/src/index";
import { McpHttpServer, MCP_PROTOCOL_VERSION } from "../src/index";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../schemas/fixtures/${name}`, import.meta.url)), "utf8")
  );

const manifest = fx("live-cards.manifest.json");

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function mount(): Promise<{ baseUrl: string; server: Server }> {
  const mcp = new McpHttpServer({ handler: createStatelessAgentFaceDispatcher().handleMcpMessage });
  const server = createServer(async (req, res) => {
    if (!(await mcp.handle(req, res))) res.writeHead(404).end();
  });
  return listen(server).then((baseUrl) => ({ baseUrl, server }));
}

const rpc = (baseUrl: string, body: unknown) =>
  fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("initialize handshake advertises the protocol version and tools capability", async () => {
  const { baseUrl, server } = await mount();
  const res = await rpc(baseUrl, { jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(res.status, 200);
  const reply = (await res.json()) as { result: { protocolVersion: string; capabilities: unknown } };
  assert.equal(reply.result.protocolVersion, "2025-06-18");
  assert.deepEqual(reply.result.capabilities, { tools: {} });
  await close(server);
});

test("tools/list surfaces the agentface projection over the wire", async () => {
  const { baseUrl, server } = await mount();
  const res = await rpc(baseUrl, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  const reply = (await res.json()) as { result: { tools: { name: string }[] } };
  const names = reply.result.tools.map((t) => t.name);
  assert.ok(names.includes("describeCatalog"));
  assert.ok(names.includes("validateDocument"));
  assert.ok(names.includes("authorDocument"));
  await close(server);
});

test("tools/call dispatches a tool and returns structuredContent", async () => {
  const { baseUrl, server } = await mount();
  const res = await rpc(baseUrl, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "describeCatalog", arguments: { manifest } },
  });
  const reply = (await res.json()) as {
    result: { isError?: boolean; structuredContent?: unknown };
  };
  assert.notEqual(reply.result.isError, true);
  assert.ok(reply.result.structuredContent !== undefined);
  await close(server);
});

test("a notification (no id) is acknowledged with 204 and no body", async () => {
  const { baseUrl, server } = await mount();
  const res = await rpc(baseUrl, { jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
  await close(server);
});

test("GET advertises the endpoint transport and protocol", async () => {
  const { baseUrl, server } = await mount();
  const res = await fetch(`${baseUrl}/mcp`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { transport: string; protocol: string };
  assert.equal(body.transport, "mcp/jsonrpc");
  assert.equal(body.protocol, MCP_PROTOCOL_VERSION);
  await close(server);
});

test("cross-origin browser clients can preflight the MCP route with CORS headers", async () => {
  const { baseUrl, server } = await mount();
  const preflight = await fetch(`${baseUrl}/mcp`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://127.0.0.1:5175",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:5175");
  assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /POST/);
  await close(server);
});

test("an injected handler swaps the exposed face", async () => {
  const mcp = new McpHttpServer({ handler: () => ({ jsonrpc: "2.0", id: 9, result: { ok: true } }) });
  const server = createServer(async (req, res) => {
    if (!(await mcp.handle(req, res))) res.writeHead(404).end();
  });
  const baseUrl = await listen(server);
  const res = await rpc(baseUrl, { jsonrpc: "2.0", id: 9, method: "tools/list" });
  const reply = (await res.json()) as { result: { ok: boolean } };
  assert.equal(reply.result.ok, true);
  await close(server);
});
