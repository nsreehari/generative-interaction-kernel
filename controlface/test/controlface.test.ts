// The ControlFace host co-hosts both faces on ONE live kernel: the UI/API render+drive channel
// (SSE `/gup`) and the agent channel (MCP `/mcp`, the AgentFace projection). This proves a render
// client and an MCP client talk to the same runtime over one server, and that an in-process
// controlface `emit()` broadcasts its patch to the connected render client (live drive), not just a
// silent kernel poke.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  GenUIClient,
  InMemoryStateModel,
  type ResolvedNode,
} from "../../kernel/src/index";
import { SseClientTransport } from "../../transports/http-sse/src/index";
import { ControlfaceHost } from "../src/index";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)), "utf8")
  );

const manifest = fx("live-cards.manifest.json");
const document = fx("example.document.json");

function seededState(): InMemoryStateModel {
  const store = new InMemoryStateModel(manifest.payload.namespaces);
  store.apply([
    { op: "set", path: "fetched_sources.orders", value: [{ id: "order-42", amount: 100 }] },
    { op: "set", path: "computed_values.total", value: 150 },
  ]);
  return store;
}

function find(node: ResolvedNode | null, id: string): ResolvedNode | undefined {
  if (!node) return undefined;
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return undefined;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

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

function mount(host: ControlfaceHost): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(async (req, res) => {
    if (!(await host.handle(req, res))) res.writeHead(404).end();
  });
  return listen(server).then((baseUrl) => ({ baseUrl, server }));
}

test("one host serves an SSE render client and an MCP agent client against the same runtime", async () => {
  const host = new ControlfaceHost(manifest, document, { state: seededState() });
  const { baseUrl, server } = await mount(host);

  // UI/API face: a render client onboards over SSE and sees the live tree.
  const client = new GenUIClient(new SseClientTransport(baseUrl));
  client.start();
  await waitFor(() => find(client.getTree(), "metric-total") !== undefined);
  assert.equal(find(client.getTree(), "metric-total")?.props.value, 150);

  // Agent face: the AgentFace projection is reachable over MCP on the SAME server.
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const reply = (await res.json()) as { result: { tools: { name: string }[] } };
  assert.ok(reply.result.tools.some((t) => t.name === "describeCatalog"));

  client.stop();
  host.stop();
  await close(server);
});

test("in-process controlface emit() broadcasts a patch to the connected render client", async () => {
  const host = new ControlfaceHost(manifest, document, { state: seededState() });
  const { baseUrl, server } = await mount(host);

  const client = new GenUIClient(new SseClientTransport(baseUrl));
  client.start();
  await waitFor(() => find(client.getTree(), "btn-approve") !== undefined);
  assert.equal(find(client.getTree(), "btn-approve")?.visible, false);

  // Drive from the server side (UI/API face), not the client — the patch must still reach the client.
  const patch = await host.emit({ node: "table-orders", name: "rowSelect", payload: { id: "order-42" } });
  assert.equal(patch.rev, 1);
  await waitFor(() => find(client.getTree(), "btn-approve")?.visible === true);
  assert.equal(client.getRev(), 1);

  client.stop();
  host.stop();
  await close(server);
});

test("controlface read ops observe live state without a transport", async () => {
  const host = new ControlfaceHost(manifest, document, { state: seededState() });
  const computed = host.getState().computed_values as { total?: number };
  assert.equal(computed.total, 150);
  assert.equal(find(await host.getTree(), "metric-total")?.props.value, 150);
  host.stop();
});
