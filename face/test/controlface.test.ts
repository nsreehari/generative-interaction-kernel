// The outer host composition co-hosts the face projections on ONE live kernel: the UI/API render
// stream (SSE `/gik`) and two MCP channels over one tool catalog — `/mcp` (the AgentFace subset)
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
  GIKClient,
  InMemoryStateModel,
  JsonataExpressionProvider,
  type Checkpoint,
  type Orchestrator,
  type OrchestratorEffect,
  type ResolvedNode,
  unwrap,
} from "../../kernel/src/index";
import { type BlueprintArtifact } from "../../blueprint/src/index";
import { McpHttpServer } from "../../transports/mcp-http/src/index";
import { SseClientTransport } from "../../transports/http-sse/src/index";
import { SseTransportServer } from "../../transports/http-sse/src/index";
import {
  AGENTFACE_ALLOWLIST,
  ControlFace,
  DefaultServiceHost,
  type ControlFaceOptions,
  agentFaceProjection,
  authoringTools,
  createAgentFaceDispatcher,
  createControlFaceDispatcher,
  controlFaceTools,
  defineDeclarativeBlueprint,
  runtimeTools,
} from "../src/index";

test("ControlFace defines zero-recipe JSON cell Blueprints without product code", () => {
  const artifact: BlueprintArtifact = {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "cell-example",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime-document", kind: "runtime-document" }],
      recipes: [],
      runtime: { namespaces: ["example"], capabilities: {} },
      cells: {
          root: {
            id: "root",
            view: { capability: "ui:screen" },
          },
          source: {
            id: "source",
            outputs: [{ token: "ready" }],
            view: { capability: "ui:text" },
          },
          consumer: {
            id: "consumer",
            inputs: [{ token: "ready" }],
            view: { capability: "ui:text" },
          },
      },
      projections: {
        presentation: {
          roots: ["root"],
          placements: [
            { cell: "source", parent: "root" },
            { cell: "consumer", parent: "root" },
          ],
        },
      },
    },
  };

  const definition = defineDeclarativeBlueprint(artifact);
  assert.ok(definition);
  const document = definition.lower({});
  assert.deepEqual(document.root.edges?.children?.map((node) => node.id), ["source", "consumer"]);
  assert.equal("provides" in (document.root.edges?.children?.[0] ?? {}), false);
  assert.equal("requires" in (document.root.edges?.children?.[1] ?? {}), false);

  assert.equal(defineDeclarativeBlueprint({
    ...artifact,
    payload: {
      ...artifact.payload,
      recipes: [{ id: "compile", from: "runtime-document", to: "runtime-document" }],
    },
  }), undefined);
});

test("ControlFace opens an authored Blueprint into a runtime", () => {
  const artifact: BlueprintArtifact = {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "example",
      kind: "example",
      version: "1",
      tiers: [{ id: "runtime-document", kind: "runtime-document" }],
      recipes: [],
      runtime: {
        namespaces: ["example"],
        capabilities: {},
        state: { example: { ready: true } },
      },
      cells: {
          example: {
            id: "example",
            view: {
              capability: "ui:text",
              props: { value: "Opened" },
            },
          },
      },
      projections: {
        presentation: { roots: ["example"] },
      },
    },
  };
  const runtime = ControlFace.openBlueprint(artifact);

  assert.equal(runtime.blueprintId, "example");
  assert.equal(unwrap(runtime.program).root.props?.value, "Opened");
  assert.deepEqual(runtime.state, { example: { ready: true } });
  assert.throws(
    () => ControlFace.openBlueprint({
      ...artifact,
      payload: {
        ...artifact.payload,
        recipes: [{ id: "compile", from: "runtime-document", to: "runtime-document" }],
      },
    }),
    /recipe|executor|invalid/i
  );
});

test("ControlFace applies initialSeed from blueprint context", () => {
  const artifact: BlueprintArtifact = {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "seeded",
      kind: "example",
      version: "1",
      tiers: [{ id: "runtime-document", kind: "runtime-document" }],
      recipes: [],
      runtime: {
        namespaces: ["example"],
        capabilities: {},
        state: { example: { ready: false, nested: { before: true } } },
      },
      cells: {
          seeded: {
            id: "seeded",
            view: {
              capability: "ui:text",
              props: { value: "Seeded" },
            },
          },
      },
      projections: {
        presentation: { roots: ["seeded"] },
      },
    },
  };

  const runtime = ControlFace.openBlueprint(artifact, {
    context: {
      initialSeed: {
        example: {
          message: "Hello",
          nested: { after: true },
        },
      },
    },
  });

  assert.deepEqual(runtime.state, {
    example: {
      ready: false,
      message: "Hello",
      nested: { before: true, after: true },
    },
  });
});

test("ControlFace opens Blueprint-backed Cells as independent child runtimes", () => {
  const child: BlueprintArtifact = {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "child",
      kind: "example",
      version: "2",
      tiers: [{ id: "runtime-document", kind: "runtime-document" }],
      recipes: [],
      runtime: { capabilities: {}, state: { child: { count: 1 } } },
      cells: { root: { id: "root", view: { capability: "ui:text" } } },
      projections: { presentation: { roots: ["root"] } },
    },
  };
  const parent: BlueprintArtifact = {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "parent",
      kind: "example",
      version: "1",
      tiers: [{ id: "runtime-document", kind: "runtime-document" }],
      recipes: [],
      runtime: { capabilities: {}, state: { parent: { ready: true } } },
      cells: {
        child: {
          id: "child",
          blueprint: { $ref: "./child.blueprint.json" },
          view: { capability: "ui:blueprint" },
        },
      },
      projections: { presentation: { roots: ["child"] } },
    },
  };

  const runtime = ControlFace.openBlueprint(parent, {
    resolveBlueprint: () => child,
  });

  assert.equal(runtime.instanceId, "parent");
  assert.deepEqual(runtime.state, { parent: { ready: true } });
  assert.equal(runtime.children.child.instanceId, "parent/cells/child");
  assert.equal(runtime.children.child.definition.payload.id, "child");
  assert.deepEqual(runtime.children.child.state, { child: { count: 1 } });
});

test("ControlFace rejects Blueprints without runtime", () => {
  const blueprint = {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "missing-runtime",
      kind: "example",
      version: "1",
      tiers: [{ id: "workflow", kind: "workflow" }],
      recipes: [],
    },
  };

  assert.throws(() => ControlFace.openBlueprint(blueprint as never), /runtime/i);
});
import { ServiceKindRegistry } from "../src/services/service-kinds";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)), "utf8")
  );

const manifest = fx("live-cards.vocabulary.json");
const document = fx("example.program.json");

const rollbackManifest = {
  version: "rollback-test/1",
  namespaces: ["card_data", "payments"],
  capabilities: {},
};

const rollbackDocument = {
  gik: "0.1",
  type: "program",
  payload: {
    root: {
      capability: "actions",
      id: "btn-charge",
      props: { label: "Charge" },
      edges: {
        on: {
          tap: [
            { do: "assign", target: "card_data.status", args: { value: "charged" } },
            { do: "invoke", args: { tool: "charge", amount: 500 } },
          ],
        },
      },
    },
  },
};

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

function createMountedRuntime(
  state = seededState(),
  opts: Omit<ControlFaceOptions, "state"> = {},
  runtimeManifest: unknown = manifest,
  runtimeDocument: unknown = document
): MountedRuntime {
  const controlface = new ControlFace(runtimeManifest as any, runtimeDocument as any, { state, ...opts });
  const sse = new SseTransportServer(controlface, { path: "/gik" });
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
  const client = new GIKClient(new SseClientTransport(baseUrl));
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

  const client = new GIKClient(new SseClientTransport(baseUrl));
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

test("ControlFace projects the shared service-kind registry", () => {
  const serviceKinds = new ServiceKindRegistry();
  serviceKinds.register({
    manifest: {
      id: "deterministic-agent",
      version: "1",
      configSchema: { type: "object" },
      executionModes: ["immediate"],
      subjects: ["cell"],
    },
    create: () => ({
      provider: { id: "deterministic", version: "1" },
      discover: async () => ({ provider: { id: "deterministic", version: "1" }, revision: "1", discoveredAt: "now", capabilities: [] }),
      execute: async () => ({ output: {} }),
    }),
  });
  const serviceHost = new DefaultServiceHost({
    blueprintId: "test",
    blueprintRevision: "1",
    declarations: {},
    registry: serviceKinds,
    state: seededState(),
    expression: new JsonataExpressionProvider({ safe: true }),
  });
  const face = new ControlFace(manifest, document, { state: seededState(), serviceHost });

  assert.deepEqual(face.describeServiceKinds().map(({ manifest: kind }) => kind.id), ["deterministic-agent"]);
  const agentNames = agentFaceProjection(face).map((tool) => tool.name);
  const controlNames = controlFaceTools(face).map((tool) => tool.name);
  assert.ok(agentNames.includes("describeServiceKinds"));
  assert.equal(agentNames.includes("listServiceRequests"), false);
  assert.equal(agentNames.includes("probeService"), false);
  assert.ok(controlNames.includes("listServiceRequests"));
  assert.ok(controlNames.includes("probeService"));
  face.stop();
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
  for (const name of ["emit", "checkpoint", "restore", "effectsSince", "compensate", "listServiceRequests", "probeService"]) {
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
  assert.equal(agent.has("restore"), false);
  assert.equal(agent.has("compensate"), false);
  // Control channel: superset — everything the agent has, plus the live drive/lifecycle tools.
  assert.ok(
    control.has("emit") &&
      control.has("checkpoint") &&
      control.has("restore") &&
      control.has("effectsSince") &&
      control.has("compensate")
  );
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

  const client = new GIKClient(new SseClientTransport(baseUrl));
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

test("controlface exposes full time-travel ops: checkpoint, restore, effectsSince, compensate", async () => {
  const compensated: OrchestratorEffect[] = [];
  const orchestrator: Orchestrator = {
    async invoke(effect) {
      if (effect.tool !== "charge") return;
      return { ops: [{ op: "set", path: "payments.receipt", value: "ch_1" }] };
    },
    async compensate(effect) {
      compensated.push(effect);
      if (effect.tool === "charge") {
        return { ops: [{ op: "set", path: "payments.refunded", value: true }] };
      }
    },
  };

  const face = new ControlFace(rollbackManifest as any, rollbackDocument as any, {
    state: new InMemoryStateModel(rollbackManifest.namespaces),
    orchestrator,
  });

  const cp = face.checkpoint();
  const forward = await face.emit({ node: "btn-charge", name: "tap" });
  assert.equal(forward.rev, 1);
  assert.equal((face.getState().card_data as { status?: string }).status, "charged");
  await face.whenIdle();

  const fired = face.effectsSince(cp.rev);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].effect.tool, "charge");

  const rollback = await face.restore(cp);
  assert.equal(rollback.rev, 3);
  assert.deepEqual(face.getState().card_data, {});
  assert.deepEqual(face.getState().payments, {});

  const compensation = await face.compensate(fired.map((e) => e.effect).reverse());
  assert.equal(compensation.rev, 4);
  assert.deepEqual(compensated.map((e) => e.tool), ["charge"]);
  assert.equal((face.getState().payments as { refunded?: boolean }).refunded, true);

  face.stop();
});

test("/mcp-control serves restore and compensate as JSON time-travel tools", async () => {
  const orchestrator: Orchestrator = {
    async invoke(effect) {
      if (effect.tool !== "charge") return;
      return { ops: [{ op: "set", path: "payments.receipt", value: "ch_1" }] };
    },
    async compensate(effect) {
      if (effect.tool === "charge") {
        return { ops: [{ op: "set", path: "payments.refunded", value: true }] };
      }
    },
  };
  const host = createMountedRuntime(
    new InMemoryStateModel(rollbackManifest.namespaces),
    { orchestrator },
    rollbackManifest,
    rollbackDocument
  );
  const { baseUrl, server } = await mount(host);

  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await fetch(`${baseUrl}/mcp-control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    return (await res.json()) as { result: { structuredContent: unknown } };
  };

  const before = (await call("checkpoint", {})).result.structuredContent as Checkpoint;
  await call("emit", { event: { node: "btn-charge", name: "tap" } });
  const fired = (await call("effectsSince", { rev: before.rev })).result.structuredContent as Array<{ effect: OrchestratorEffect }>;

  const rollback = (await call("restore", { checkpoint: before })).result.structuredContent as { rev: number };
  assert.equal(rollback.rev, 3);

  const compensation = (await call("compensate", { effects: fired.map((e) => e.effect).reverse() })).result
    .structuredContent as { rev: number; ops: Array<{ path: string }> };
  assert.equal(compensation.rev, 4);
  assert.ok(compensation.ops.some((op) => op.path === "payments.refunded"));

  host.stop();
  await close(server);
});
