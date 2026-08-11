import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentFaceDispatcher } from "@gik/agentface";
import { ControlFace, createControlFaceDispatcher } from "@gik/controlface";
import { type Json } from "@gik/kernel";
import { createEffectDispatcher } from "@gik/react";
import { SseTransportServer } from "@gik/transport-http-sse/server";
import { McpHttpServer } from "@gik/transport-mcp-http";
import { resolveSampleNativeEffects } from "../../catalog/native-effects";
import { resolveSampleNativeServices } from "../../catalog/native-services";
import {
  createNodeBlueprintServiceHost,
  createNodeServiceRegistryOptions,
} from "../service-kinds/host/node-service-runtime";
import { declarativeServiceOrchestrator } from "../service-kinds/host/service-runtime";
import { createRuntimeState, openNodeLaunch } from "./runtime";

export interface NodeHostOptions {
  profile?: string;
  externalContext?: Record<string, Json>;
  port?: number;
  hostName?: string;
  environment?: Readonly<Record<string, string | undefined>>;
}

export interface NodeHostHandle {
  profile: string;
  blueprintId: string;
  controlface: ControlFace;
  server: Server;
  listen(): Promise<string>;
  stop(): Promise<void>;
}

export async function createNodeHost(options: NodeHostOptions = {}): Promise<NodeHostHandle> {
  const environment = options.environment ?? process.env;
  const requestedProfile = options.profile ?? environment.GIK_NODE_PROFILE ?? "middleware-continuity";
  const { profile, runtime } = await openNodeLaunch(
    requestedProfile,
    options.externalContext,
    environment,
  );
  const port = options.port ?? Number(environment.GIK_NODE_PORT || 8788);
  const hostName = options.hostName ?? environment.GIK_NODE_HOST ?? "127.0.0.1";
  const state = createRuntimeState(runtime);
  const nativeServices = resolveSampleNativeServices(profile.blueprint);
  const serviceHost = createNodeBlueprintServiceHost(runtime, state, environment, nativeServices);
  const native = resolveSampleNativeEffects(profile.blueprint);
  const fallback = createEffectDispatcher(state, native?.default ?? {});
  const serviceOrchestrator = declarativeServiceOrchestrator(
    runtime,
    createNodeServiceRegistryOptions(environment, nativeServices),
    undefined,
    { dependencyFailurePolicy: "throw" },
  );
  const wrapOrchestrator = native?.wrapOrchestrator?.(serviceOrchestrator) ?? serviceOrchestrator;
  const orchestrator = wrapOrchestrator(fallback, state);
  const face = new ControlFace(runtime.vocabulary, runtime.program, {
    state,
    orchestrator,
    serviceHost,
    blueprint: runtime.definition,
  });
  const sse = new SseTransportServer(face, { path: "/gik" });
  const agentMcp = new McpHttpServer({
    path: "/mcp",
    handler: createAgentFaceDispatcher(face).handleMcpMessage,
  });
  const controlMcp = new McpHttpServer({
    path: "/mcp-control",
    handler: createControlFaceDispatcher(face).handleMcpMessage,
  });
  const server = createServer(async (request, response) => {
    if (await sse.handle(request, response)) return;
    if (await agentMcp.handle(request, response)) return;
    if (await controlMcp.handle(request, response)) return;
    if ((request.url ?? "") === "/healthz") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, profile: profile.id, blueprint: profile.blueprint }));
      return;
    }
    response.writeHead(404).end();
  });

  return {
    profile: profile.id,
    blueprintId: profile.blueprint,
    controlface: face,
    server,
    listen() {
      return new Promise((resolve) => {
        server.listen(port, hostName, () => {
          const address = server.address() as AddressInfo;
          const baseUrl = `http://${hostName}:${address.port}`;
          console.log(`[gik-node-host] ${profile.id} (${profile.blueprint}) listening on ${baseUrl}`);
          console.log(`  stream:  GET  ${baseUrl}/gik/stream`);
          console.log(`  agent:   POST ${baseUrl}/mcp`);
          console.log(`  control: POST ${baseUrl}/mcp-control`);
          resolve(baseUrl);
        });
      });
    },
    stop() {
      face.stop();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

const isEntrypoint = process.argv[1] ? resolvePath(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isEntrypoint) {
  const profileArgument = process.argv.findIndex((argument) => argument === "--profile");
  const profile = profileArgument >= 0 ? process.argv[profileArgument + 1] : undefined;
  void createNodeHost({ profile }).then(async (host) => {
    await host.listen();
    const shutdown = () => void host.stop().then(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}