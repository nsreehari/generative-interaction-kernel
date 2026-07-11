// A NON-UI launcher for the agentface MCP surface — the restored `/mcp` demo.
//
// This is pure transport composition: it mounts the packaged `McpHttpServer`
// (transports/mcp-http) on a plain `node:http` server and serves the agentface
// projection — the stateless authoring/validation tools — as JSON-RPC 2.0 over HTTP.
// No kernel, no live document, no state: these tools are `JSON in, JSON out`. A live
// controlface host (SSE `/gup` + drive) is a separate, later composition.
//
// Run:  npx tsx genui-platform/samples/agent-host/mcp-service.ts
//   or:  npm run dev:mcp
//
// Probe it:
//   curl http://127.0.0.1:8787/mcp
//   curl -X POST http://127.0.0.1:8787/mcp -H 'content-type: application/json' \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

import { createServer } from "node:http";
import { McpHttpServer } from "../../transports/mcp-http/src/index";

const port = Number(process.env.GENUI_MCP_PORT || 8787);
const host = process.env.GENUI_MCP_HOST || "127.0.0.1";

const mcp = new McpHttpServer(); // defaults to the agentface projection at /mcp

const server = createServer(async (req, res) => {
  if (await mcp.handle(req, res)) return;
  if ((req.url ?? "") === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(port, host, () => {
  console.log(`[genui-agentface-mcp] listening on http://${host}:${port}/mcp`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
