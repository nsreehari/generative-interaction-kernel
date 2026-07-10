import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import {
  GenUIClient,
  Kernel,
  KernelTransportHost,
  createInMemoryTransportPair,
} from "../../../kernel/src/index";
import { seedState } from "../../../adapters/react/src/index";
import { SseTransportServer } from "../../../transports/http-sse/src/server";
import { handleMcpMessage, MCP_PROTOCOL_VERSION } from "../../../agentface/ts/src/index";
import { startAgentLoop } from "./agent-loop";
import { chromeBundle } from "./bundles/chrome/chrome";

export interface WorkbenchNodeHostOptions {
  port?: number;
  host?: string;
  path?: string;
}

export interface WorkbenchNodeHost {
  baseUrl: string;
  close(): Promise<void>;
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * The AgentFace MCP transport wrapper: a single `POST /mcp` route that speaks JSON-RPC 2.0 over the
 * pure {@link handleMcpMessage} dispatcher (one tool per AgentFace method). Returns true when it
 * handled the request. `GET /mcp` advertises the endpoint; `OPTIONS` answers CORS preflight.
 */
async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/mcp") return false;

  const cors = () => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  };

  if (req.method === "OPTIONS") {
    cors();
    res.writeHead(204).end();
    return true;
  }
  if (req.method === "GET") {
    cors();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ transport: "mcp/jsonrpc", protocol: MCP_PROTOCOL_VERSION }));
    return true;
  }
  if (req.method !== "POST") {
    cors();
    res.writeHead(405).end();
    return true;
  }

  const body = await readBody(req);
  cors();
  let message: unknown;
  try {
    message = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }));
    return true;
  }
  const reply = handleMcpMessage(message);
  if (reply === undefined) {
    res.writeHead(204).end(); // notification — no body
    return true;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(reply));
  return true;
}

export async function startWorkbenchNodeHost(
  opts: WorkbenchNodeHostOptions = {}
): Promise<WorkbenchNodeHost> {
  const hostName = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 8787;
  const path = opts.path ?? "/gup";

  const state = seedState(chromeBundle.manifest, chromeBundle.state);
  const kernel = new Kernel(chromeBundle.manifest, chromeBundle.document, { state });
  const transportHost = new KernelTransportHost(chromeBundle.manifest, chromeBundle.document, kernel);
  const sse = new SseTransportServer(transportHost, { path });

  const [agentHostTransport, agentClientTransport] = createInMemoryTransportPair();
  const agent = new GenUIClient(agentClientTransport);
  agent.start();
  await transportHost.attach(agentHostTransport);
  const stopAgentLoop = startAgentLoop(agent);

  const server = createServer(async (req, res) => {
    if (await sse.handle(req, res)) return;
    if ((req.url ?? "") === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (await handleMcp(req, res)) return;
    res.writeHead(404).end();
  });

  await listen(server, port, hostName);

  return {
    baseUrl: `http://${hostName}:${port}`,
    async close() {
      stopAgentLoop();
      agent.stop();
      transportHost.stop();
      await close(server);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.GENUI_WORKBENCH_PORT || 8787);
  const host = process.env.GENUI_WORKBENCH_HOST || "127.0.0.1";
  const nodeHost = await startWorkbenchNodeHost({ port, host });
  console.log(`[genui-workbench-host] listening on ${nodeHost.baseUrl}/gup`);

  const shutdown = async () => {
    await nodeHost.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}