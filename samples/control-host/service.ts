// A NON-UI launcher for the outer transport composition over a live ControlFace.
//
// It binds a bundle to a kernel, builds one live ControlFace, then mounts transports around two
// projections of that same face: SSE `/gup` for the render stream, MCP `/mcp` for the agent-safe
// projection, and MCP `/mcp-control` for the full control-plane catalog. The sample is intentionally
// thin: transports carry projections; they do not own capability policy.
//
// Run:  npx tsx genui-platform/samples/control-host/service.ts
//   or:  npm run dev:controlface
//
// Probe it:
//   curl http://127.0.0.1:8788/healthz
//   curl -N http://127.0.0.1:8788/gup/stream
//   curl -X POST http://127.0.0.1:8788/mcp -H 'content-type: application/json' \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ControlFace, createAgentFaceDispatcher, createControlFaceDispatcher } from "../../face/src/index";
import { InMemoryStateModel } from "../../kernel/src/index";
import { SseTransportServer } from "../../transports/http-sse/src/index";
import { McpHttpServer } from "../../transports/mcp-http/src/index";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)), "utf8")
  );

const manifest = fx("live-cards.manifest.json");
const document = fx("example.document.json");

const state = new InMemoryStateModel(manifest.payload.namespaces);
state.apply([
  { op: "set", path: "fetched_sources.orders", value: [{ id: "order-42", amount: 100 }] },
  { op: "set", path: "computed_values.total", value: 150 },
]);

const controlface = new ControlFace(manifest, document, { state });
const sse = new SseTransportServer(controlface, { path: "/gup" });
const agentMcp = new McpHttpServer({
  path: "/mcp",
  handler: createAgentFaceDispatcher(controlface).handleMcpMessage,
});
const controlMcp = new McpHttpServer({
  path: "/mcp-control",
  handler: createControlFaceDispatcher(controlface).handleMcpMessage,
});

const port = Number(process.env.GENUI_CONTROLFACE_PORT || 8788);
const hostName = process.env.GENUI_CONTROLFACE_HOST || "127.0.0.1";

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

server.listen(port, hostName, () => {
  console.log(`[genui-controlface] listening on http://${hostName}:${port}`);
  console.log(`  render/drive (SSE): GET  http://${hostName}:${port}/gup/stream`);
  console.log(`  agent (MCP):        POST http://${hostName}:${port}/mcp`);
  console.log(`  control (MCP):      POST http://${hostName}:${port}/mcp-control`);
});

// Server-side live drive: toggle the approval selection so connected clients see patches flow.
let selected = false;
const ticker = setInterval(() => {
  selected = !selected;
  void controlface.emit({
    node: "table-orders",
    name: "rowSelect",
    payload: selected ? { id: "order-42" } : {},
  });
}, 2000);

const shutdown = () => {
  clearInterval(ticker);
  controlface.stop();
  server.close(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
