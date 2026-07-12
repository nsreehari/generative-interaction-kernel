// The outer host composition co-hosts the face projections on ONE live kernel: the UI/API render
// stream (SSE `/gup`) and two MCP channels over one tool catalog — `/mcp` (the AgentFace subset)
// and `/mcp-control` (the full control-plane catalog with the live runtime tools). These prove a
// render client and MCP clients talk to the same runtime over one server, that the AgentFace
// projection is literally the catalog filtered to an allowlist, and that a control-plane `emit`
// tool/call drives the kernel and broadcasts its patch to the connected render client (live drive),
// not just a silent kernel poke.

import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import {
  GenUIClient,
  InMemoryStateModel,
  type ResolvedNode,
} from "../../kernel/src/index";
import { McpHttpServer } from "../../transports/mcp-http/src/index";
import { SseClientTransport } from "../../transports/http-sse/src/index";
import { SseTransportServer } from "../../transports/http-sse/src/index";
import {
  AGENTFACE_ALLOWLIST,
  ControlFace,
  agentFaceProjection,
  authoringTools,
  createAgentFaceDispatcher,
  createControlFaceDispatcher,
  controlFaceTools,
  runtimeTools,
} from "../src/index";

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

interface MountedRuntime {
  controlface: ControlFace;
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  stop(): void;
}

function createMountedRuntime(state = seededState()): MountedRuntime {
  const controlface = new ControlFace(manifest, document, { state });
  const sse = new SseTransportServer(controlface, { path: "/gup" });
  const mcp = new McpHttpServer({
    path: "/mcp",
    handler: createAgentFaceDispatcher(controlface).handleMcpMessage,
  });
  const mcpControl = new McpHttpServer({
    path: "/mcp-control",
    handler: createControlFaceDispatcher(controlface).handleMcpMessage,
  });

  return {
    controlface,
    async handle(req, res) {
      if (await sse.handle(req, res)) return true;
      if (await mcp.handle(req, res)) return true;
      if (await mcpControl.handle(req, res)) return true;
      if ((req.url ?? "") === "/healthz") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return true;
      }
      return false;
    },
    stop() {
      controlface.stop();
    },
  };
}

function mount(host: MountedRuntime): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(async (req, res) => {
    if (!(await host.handle(req, res))) res.writeHead(404).end();
  });
  return listen(server).then((baseUrl) => ({ baseUrl, server }));
}

test("one host serves an SSE render client and an MCP agent client against the same runtime", async () => {
  const host = createMountedRuntime();
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
  const host = createMountedRuntime();
  const { baseUrl, server } = await mount(host);

  const client = new GenUIClient(new SseClientTransport(baseUrl));
  client.start();
  await waitFor(() => find(client.getTree(), "btn-approve") !== undefined);
  assert.equal(find(client.getTree(), "btn-approve")?.visible, false);

  // Drive from the server side (UI/API face), not the client — the patch must still reach the client.
  const patch = await host.controlface.emit({ node: "table-orders", name: "rowSelect", payload: { id: "order-42" } });
  assert.equal(patch.rev, 1);
  await waitFor(() => find(client.getTree(), "btn-approve")?.visible === true);
  assert.equal(client.getRev(), 1);

  client.stop();
  host.stop();
  await close(server);
});

test("controlface read ops observe live state without a transport", async () => {
  const host = createMountedRuntime();
  const computed = host.controlface.getState().computed_values as { total?: number };
  assert.equal(computed.total, 150);
  assert.equal(find(await host.controlface.getTree(), "metric-total")?.props.value, 150);
  host.stop();
});

test("AgentFace is the ControlFace catalog filtered to the allowlist (projection is real)", () => {
  const face = new ControlFace(manifest, document, { state: seededState() });
  const full = controlFaceTools(face).map((t) => t.name);
  const projection = agentFaceProjection(face).map((t) => t.name);

  // The projection is exactly the catalog filtered to the allowlist.
  assert.deepEqual(projection.sort(), full.filter((n) => AGENTFACE_ALLOWLIST.has(n)).sort());
  // Agents get the pure authoring tools PLUS read-only inspect (getState/getTree)...
  for (const name of authoringTools.map((t) => t.name)) assert.ok(projection.includes(name));
  assert.ok(projection.includes("getState") && projection.includes("getTree"));
  // ...but never the live drive/lifecycle tools — those stay control-plane-only.
  for (const name of ["emit", "checkpoint", "effectsSince"]) {
    assert.equal(AGENTFACE_ALLOWLIST.has(name), false, `${name} leaked to agents`);
    assert.equal(projection.includes(name), false, `${name} leaked to agents`);
    assert.ok(full.includes(name), `${name} missing from control catalog`);
  }
  // Read-only inspect tools ARE runtime tools — present in the catalog and allowlisted.
  assert.ok(runtimeTools(face).some((t) => t.name === "getState"));
  face.stop();
});

test("the /mcp agent channel serves authoring + read-only inspect; /mcp-control adds drive/lifecycle", async () => {
  const host = createMountedRuntime();
  const { baseUrl, server } = await mount(host);

  const list = async (path: string): Promise<Set<string>> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const reply = (await res.json()) as { result: { tools: { name: string }[] } };
    return new Set(reply.result.tools.map((t) => t.name));
  };

  const agent = await list("/mcp");
  const control = await list("/mcp-control");

  // Agent channel: authoring tools + read-only inspect present; drive/lifecycle absent.
  assert.ok(agent.has("describeCatalog") && agent.has("getState") && agent.has("getTree"));
  assert.equal(agent.has("emit"), false);
  assert.equal(agent.has("effectsSince"), false);
  // Control channel: superset — everything the agent has, plus the live drive/lifecycle tools.
  assert.ok(control.has("emit") && control.has("checkpoint") && control.has("effectsSince"));
  for (const name of agent) assert.ok(control.has(name), `control channel missing ${name}`);

  host.stop();
  await close(server);
});

test("an agent can read live state over /mcp getState without any drive privilege", async () => {
  const host = createMountedRuntime();
  const { baseUrl, server } = await mount(host);

  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "getState", arguments: {} },
    }),
  });
  const reply = (await res.json()) as {
    result: { structuredContent: { computed_values?: { total?: number } } };
  };
  assert.equal(reply.result.structuredContent.computed_values?.total, 150);

  host.stop();
  await close(server);
});

test("a control-plane MCP tools/call drives the live kernel and broadcasts to render clients", async () => {
  const host = createMountedRuntime();
  const { baseUrl, server } = await mount(host);

  const client = new GenUIClient(new SseClientTransport(baseUrl));
  client.start();
  await waitFor(() => find(client.getTree(), "btn-approve") !== undefined);
  assert.equal(find(client.getTree(), "btn-approve")?.visible, false);

  // Drive via the control-plane MCP `emit` tool (async handler) over the wire.
  const res = await fetch(`${baseUrl}/mcp-control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "emit",
        arguments: { event: { node: "table-orders", name: "rowSelect", payload: { id: "order-42" } } },
      },
    }),
  });
  const reply = (await res.json()) as { result: { structuredContent: { rev: number } } };
  assert.equal(reply.result.structuredContent.rev, 1);
  await waitFor(() => find(client.getTree(), "btn-approve")?.visible === true);

  client.stop();
  host.stop();
  await close(server);
});
