import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentFaceDispatcher } from "@gik/agentface";
import {
  HostedBlueprintReconciler,
  HOSTED_BLUEPRINT_OUTPUT_EVENT,
  materializeBlueprint,
  parseBlueprintReference,
  type BlueprintArtifact,
  type BlueprintHostRegistry,
} from "@gik/blueprint";
import { ControlFace, createControlFaceDispatcher, openBlueprint } from "@gik/controlface";
import type { BlueprintRuntime } from "@gik/controlface/blueprint";
import { unwrap, type Json } from "@gik/kernel";
import { createEffectDispatcher } from "@gik/react";
import { SseTransportServer } from "@gik/transport-http-sse/server";
import { McpHttpServer } from "@gik/transport-mcp-http";
import { resolveSampleNativeEffects } from "./native-effects";
import { resolveSampleNativeServices } from "./native-services";
import {
  createNodeBlueprintServiceHost,
  createNodeHostConfig,
  nodeServiceOrchestrator,
} from "./service-host";
import { createRuntimeState, openNodeLaunch } from "./runtime";
import { resolveSampleBlueprintSource } from "../../catalog/blueprint-catalog";

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
  hostedControlFaces(): ReadonlyMap<string, ControlFace>;
  listen(): Promise<string>;
  stop(): Promise<void>;
}

export async function createNodeHost(options: NodeHostOptions = {}): Promise<NodeHostHandle> {
  const environment = options.environment ?? process.env;
  const requestedProfile = options.profile ?? environment.GIK_NODE_PROFILE ?? "portfolio-tracker-new";
  const { profile, runtime, externalContext } = await openNodeLaunch(
    requestedProfile,
    options.externalContext,
    environment,
  );
  const port = options.port ?? Number(environment.GIK_NODE_PORT || 8788);
  const hostName = options.hostName ?? environment.GIK_NODE_HOST ?? "127.0.0.1";
  const registry = createNodeBlueprintRegistry(environment);
  const root = await createComposedNodeRuntime(
    profile.blueprint,
    runtime,
    profile.blueprint,
    environment,
    registry,
    externalContext,
    externalContext,
  );
  const face = root.controlface;
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
    hostedControlFaces: () => new Map(
      [...root.reconciler.instances()].map(([path, child]) => [path, child.controlface]),
    ),
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
    async stop() {
      await root.stop();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

interface ComposedNodeRuntime {
  controlface: ControlFace;
  reconciler: HostedBlueprintReconciler<ComposedNodeRuntime>;
  stop(): Promise<void>;
}

async function createComposedNodeRuntime(
  blueprintId: string,
  runtime: BlueprintRuntime,
  instanceId: string,
  environment: Readonly<Record<string, string | undefined>>,
  registry: BlueprintHostRegistry,
  externalContext: Record<string, Json>,
  initialSeed: Record<string, Json> = {},
): Promise<ComposedNodeRuntime> {
  const state = createRuntimeState(runtime, externalContext, initialSeed);
  const nativeServices = resolveSampleNativeServices(blueprintId);
  const serviceHost = createNodeBlueprintServiceHost(runtime, state, environment, nativeServices, registry);
  const native = resolveSampleNativeEffects(blueprintId);
  const fallback = createEffectDispatcher(state, native?.default ?? {});
  const serviceOrchestrator = nodeServiceOrchestrator(runtime, serviceHost, state);
  const wrapOrchestrator = native?.wrapOrchestrator?.(serviceOrchestrator) ?? serviceOrchestrator;
  const orchestrator = wrapOrchestrator(fallback, state);
  const controlface = new ControlFace(runtime.vocabulary, runtime.program, {
    state,
    orchestrator,
    serviceHost,
    blueprint: runtime.definition,
    externalContext,
  });
  await controlface.syncExternal();
  const reconciler = new HostedBlueprintReconciler(
    blueprintId,
    instanceId,
    registry,
    {
      async mount(hosted) {
        const childRuntime = openNodeBlueprint(hosted.definition.blueprint, hosted.inputs, environment);
        const child = await createComposedNodeRuntime(
          hosted.definition.blueprint.payload.id,
          childRuntime,
          hosted.instanceId,
          environment,
          registry,
          hosted.inputs,
          hosted.inputs,
        );
        child.controlface.subscribeOutputs((outputs) => {
          if (Object.keys(outputs).length === 0) return;
          void controlface.emit({
            node: hosted.node.id,
            name: HOSTED_BLUEPRINT_OUTPUT_EVENT,
            payload: outputs,
          });
        });
        return child;
      },
      async unmount(child) {
        await child.stop();
      },
    },
  );
  const hasProjection = unwrap(runtime.program).root !== undefined;
  const unsubscribe = hasProjection
    ? controlface.subscribeTree((tree) => reconciler.reconcile(tree))
    : () => undefined;
  if (hasProjection) await reconciler.reconcile(await controlface.getTree());
  let stopped = false;
  return {
    controlface,
    reconciler,
    async stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      await reconciler.stop();
      controlface.stop();
    },
  };
}

function createNodeBlueprintRegistry(
  environment: Readonly<Record<string, string | undefined>>,
): BlueprintHostRegistry {
  const config = createNodeHostConfig(environment);
  const resolve = (id: string): BlueprintArtifact => resolveSampleBlueprintSource(id, config);
  return {
    resolveArtifact(reference) {
      return resolve(reference.id);
    },
    resolve(reference) {
      const blueprint = resolve(reference.id);
      if (reference.version !== undefined && blueprint.payload.version !== reference.version) {
        throw new Error(`Blueprint '${reference.id}' version '${reference.version}' is unavailable`);
      }
      return {
        reference: {
          ...reference,
          version: reference.version ?? blueprint.payload.version,
        },
        blueprint,
      };
    },
  };
}

function openNodeBlueprint(
  blueprint: BlueprintArtifact,
  externalContext: Record<string, Json>,
  environment: Readonly<Record<string, string | undefined>>,
): BlueprintRuntime {
  const config = createNodeHostConfig(environment);
  const materialized = materializeBlueprint({
    blueprint,
    externalContext,
    resolveBlueprint(reference) {
      const parsed = parseBlueprintReference(reference);
      const child = resolveSampleBlueprintSource(parsed.id, config);
      if (parsed.version !== undefined && child.payload.version !== parsed.version) {
        throw new Error(`Blueprint '${parsed.id}' version '${parsed.version}' is unavailable`);
      }
      return child;
    },
  });
  return openBlueprint(materialized.payload.terminalBlueprint);
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