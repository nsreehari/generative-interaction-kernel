// A NON-UI launcher for the ControlFace host — live drive + agent surface, co-hosted.
//
// It binds a bundle to a kernel and mounts BOTH faces on one server: the SSE render/drive
// channel (`/gup`) for UI/API clients and the agent MCP channel (`/mcp`, the AgentFace
// projection). A background ticker drives the kernel from the server side via `host.emit()`,
// so any connected render client sees live patches — proof the control-plane broadcasts.
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
import { InMemoryStateModel } from "../../kernel/src/index";
import { ControlfaceHost } from "../../controlface/src/index";

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

const host = new ControlfaceHost(manifest, document, { state });

const port = Number(process.env.GENUI_CONTROLFACE_PORT || 8788);
const hostName = process.env.GENUI_CONTROLFACE_HOST || "127.0.0.1";

const server = createServer(async (req, res) => {
  if (await host.handle(req, res)) return;
  res.writeHead(404).end();
});

server.listen(port, hostName, () => {
  console.log(`[genui-controlface] listening on http://${hostName}:${port}`);
  console.log(`  render/drive (SSE): GET  http://${hostName}:${port}/gup/stream`);
  console.log(`  agent (MCP):        POST http://${hostName}:${port}/mcp`);
});

// Server-side live drive: toggle the approval selection so connected clients see patches flow.
let selected = false;
const ticker = setInterval(() => {
  selected = !selected;
  void host.emit({
    node: "table-orders",
    name: "rowSelect",
    payload: selected ? { id: "order-42" } : {},
  });
}, 2000);

const shutdown = () => {
  clearInterval(ticker);
  host.stop();
  server.close(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
