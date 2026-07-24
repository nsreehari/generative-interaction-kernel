// A NON-UI launcher for the outer transport composition over a live ControlFace.
//
// It binds a bundle to a kernel, builds one live ControlFace, then mounts transports around two
// projections of that same face: SSE `/gik` for the render stream, MCP `/mcp` for the agent-safe
// projection, and MCP `/mcp-control` for the full control-plane catalog, including time-travel
// tools (`checkpoint`, `restore`, `effectsSince`, `compensate`). The sample is intentionally thin:
// transports carry projections; they do not own capability policy.
//
// Run:  npx tsx generative-interaction-kernel/samples/control-host/service.ts
//   or:  npm run dev:controlface
// Time-travel demo: set `GENUI_CONTROLFACE_DEMO=rollback` to mount an effectful runtime whose
// control-plane can demonstrate `checkpoint` -> `emit` -> `effectsSince` -> `restore` -> `compensate`.
//
// Probe it:
//   curl http://127.0.0.1:8788/healthz
//   curl -N http://127.0.0.1:8788/gik/stream
//   curl -X POST http://127.0.0.1:8788/mcp -H 'content-type: application/json' \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
//   curl -X POST http://127.0.0.1:8788/mcp-control -H 'content-type: application/json' \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
//   curl -X POST http://127.0.0.1:8788/mcp-control -H 'content-type: application/json' \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"checkpoint","arguments":{}}}'
// Rollback demo probes (`GENUI_CONTROLFACE_DEMO=rollback`):
//   curl -X POST http://127.0.0.1:8788/mcp-control -H 'content-type: application/json' \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"emit","arguments":{"event":{"node":"btn-charge","name":"tap"}}}}'
//   curl -X POST http://127.0.0.1:8788/mcp-control -H 'content-type: application/json' \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"effectsSince","arguments":{"rev":0}}}'

import { createServer } from "node:http";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { type AddressInfo } from "node:net";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { ControlFace, createControlFaceDispatcher } from "@gik/controlface";
import { createAgentFaceDispatcher } from "@gik/agentface";
import { InMemoryStateModel } from "@gik/kernel";
import type { Json, Orchestrator, OrchestratorEffect } from "@gik/kernel";
import { SseTransportServer } from "@gik/transport-http-sse/server";
import { McpHttpServer } from "@gik/transport-mcp-http";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8")
  );

const vocabulary = fx("live-cards.vocabulary.json");
const program = fx("example.program.json");

const rollbackVocabulary = {
  gik: "0.1",
  type: "vocabulary",
  payload: {
    version: "rollback-sample/1",
    namespaces: ["card_data", "payments"],
    capabilities: {},
  },
};

const rollbackProgram = {
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

const continuityVocabulary = {
  gik: "0.1",
  type: "vocabulary",
  payload: {
    version: "continuity-sample/1",
    namespaces: ["continuity"],
    capabilities: {
      workflow: {},
      status: { dataProp: "value" },
    },
  },
};

const continuityProgram = {
  gik: "0.1",
  type: "program",
  payload: {
    root: {
      capability: "workflow",
      id: "continuity-workflow",
      edges: {
        children: [
          {
            capability: "status",
            id: "continuity-status",
            edges: { read: { value: "continuity.job.status", result: "continuity.job.result" } },
          },
          {
            capability: "workflow",
            id: "continuity-controller",
            edges: {
              on: {
                queue: [
                  { do: "assign", target: "continuity.job.status", args: { value: "queued" } },
                  { do: "assign", target: "continuity.job.result", args: { value: "" } },
                  { do: "assign", target: "continuity.job.requestedBy", args: { value: "mcp-control" } },
                  { do: "assign", target: "continuity.job.completedBy", args: { value: "" } },
                ],
                complete: [
                  { do: "assign", target: "continuity.job.status", args: { value: "completed" } },
                  {
                    do: "assign",
                    target: "continuity.job.result",
                    args: { value: "background-analysis-ready" },
                  },
                  {
                    do: "assign",
                    target: "continuity.job.completedBy",
                    args: { value: "background-worker" },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  },
};

const rollbackOrchestrator: Orchestrator = {
  async invoke(effect: OrchestratorEffect) {
    if (effect.tool !== "charge") return;
    return {
      ops: [{ op: "set" as const, path: "payments.receipt", value: { id: "ch_1", amount: 500 } as Json }],
    };
  },
  async compensate(effect: OrchestratorEffect) {
    if (effect.tool !== "charge") return;
    return {
      ops: [{ op: "set" as const, path: "payments.refunded", value: true }],
    };
  },
};

export type DemoMode = "live-cards" | "rollback" | "continuity";
export interface ControlHostOptions {
  demo?: DemoMode;
  port?: number;
  hostName?: string;
}

function createRuntime(demo: DemoMode) {
  return demo === "continuity"
    ? {
        vocabulary: continuityVocabulary,
        program: continuityProgram,
        state: new InMemoryStateModel(continuityVocabulary.payload.namespaces),
        orchestrator: undefined,
        tickerEvent: null,
      }
    : demo === "rollback"
    ? {
        vocabulary: rollbackVocabulary,
        program: rollbackProgram,
        state: new InMemoryStateModel(rollbackVocabulary.payload.namespaces),
        orchestrator: rollbackOrchestrator,
        tickerEvent: null,
      }
    : {
        vocabulary,
        program,
        state: (() => {
          const state = new InMemoryStateModel(vocabulary.payload.namespaces);
          state.apply([
            { op: "set", path: "fetched_sources.orders", value: [{ id: "order-42", amount: 100 }] },
            { op: "set", path: "computed_values.total", value: 150 },
          ]);
          return state;
        })(),
        orchestrator: undefined,
        tickerEvent: {
          node: "table-orders",
          name: "rowSelect",
          on: { id: "order-42" },
          off: {},
        },
      };
}

export interface ControlHostHandle {
  demo: DemoMode;
  controlface: ControlFace;
  server: Server;
  listen(): Promise<string>;
  stop(): Promise<void>;
}

export function createControlHost(options: ControlHostOptions = {}): ControlHostHandle {
  const demo = options.demo ?? ((process.env.GENUI_CONTROLFACE_DEMO || "live-cards") as DemoMode);
  const port = options.port ?? Number(process.env.GENUI_CONTROLFACE_PORT || 8788);
  const hostName = options.hostName ?? (process.env.GENUI_CONTROLFACE_HOST || "127.0.0.1");
  const runtime = createRuntime(demo);

  const controlface = new ControlFace(runtime.vocabulary as any, runtime.program as any, {
    state: runtime.state,
    orchestrator: runtime.orchestrator,
  });
  const sse = new SseTransportServer(controlface, { path: "/gik" });
  const agentMcp = new McpHttpServer({
    path: "/mcp",
    handler: createAgentFaceDispatcher(controlface).handleMcpMessage,
  });
  const controlMcp = new McpHttpServer({
    path: "/mcp-control",
    handler: createControlFaceDispatcher(controlface).handleMcpMessage,
  });

  const server = createServer(async (req, res) => {
    if (await sse.handle(req, res)) return;
    if (await agentMcp.handle(req, res)) return;
    if (await controlMcp.handle(req, res)) return;
    if ((req.url ?? "") === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404).end();
  });

  let selected = false;
  const ticker =
    runtime.tickerEvent === null
      ? null
      : setInterval(() => {
          selected = !selected;
          void controlface.emit({
            node: runtime.tickerEvent.node,
            name: runtime.tickerEvent.name,
            payload: selected ? runtime.tickerEvent.on : runtime.tickerEvent.off,
          });
        }, 2000);

  return {
    demo,
    controlface,
    server,
    listen() {
      return new Promise((resolve) => {
        server.listen(port, hostName, () => {
          const address = server.address() as AddressInfo;
          const baseUrl = `http://${hostName}:${address.port}`;
          console.log(`[genui-controlface] listening on ${baseUrl}`);
          console.log(`  demo:               ${demo}`);
          console.log(`  render/drive (SSE): GET  ${baseUrl}/gik/stream`);
          console.log(`  agent (MCP):        POST ${baseUrl}/mcp`);
          console.log(`  control (MCP):      POST ${baseUrl}/mcp-control`);
          console.log(`    includes: getState, getTree, emit, checkpoint, restore, effectsSince, compensate`);
          if (demo === "rollback") {
            console.log(`    try: emit btn-charge:tap, then effectsSince/rev 0, restore(checkpoint), compensate(effects)`);
          }
          resolve(baseUrl);
        });
      });
    },
    stop() {
      if (ticker) clearInterval(ticker);
      controlface.stop();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

const isEntrypoint = process.argv[1] ? resolvePath(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isEntrypoint) {
  const host = createControlHost();
  void host.listen();
  const shutdown = () => {
    void host.stop().then(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
