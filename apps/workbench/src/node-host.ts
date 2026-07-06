import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import {
  GenUIClient,
  Kernel,
  KernelTransportHost,
  createInMemoryTransportPair,
} from "../../../kernel/src/index";
import { seedState } from "../../../adapters/react/src/index";
import { SseTransportServer } from "../../../transports/http-sse/src/server";
import { startAgentLoop } from "./agent-loop";
import { chromeBundle } from "./chrome";

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