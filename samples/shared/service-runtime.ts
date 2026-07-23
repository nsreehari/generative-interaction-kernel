import {
  JsonataExpressionProvider,
  type Json,
  unwrap,
  type ServiceDeclaration,
  type StateModel,
} from "../../kernel/src/index";
import { QueueFace } from "../../face/src/services/queueface";
import { DefaultServiceHost } from "../../face/src/services/service-host";
import type { BlueprintRuntime } from "../../face/src/live/controlface";
import type { LoadBundleOptions } from "@gik/react";
import {
  createSampleServiceKindRegistry,
  type SampleServiceRegistryOptions,
} from "../services";
import { executeHttpServiceInvocation } from "../services/http-service/runtime";
import { executeMcpServiceInvocation } from "../services/mcp/runtime";
import {
  clearFunctionAccessKey,
  FUNCTION_ACCESS,
  getFunctionAccessKey,
  type FunctionAccessScope,
} from "./function-access";
import { hostConfig } from "./host-config";

const FOUNDRY_CREDENTIAL_REF = "foundry-agent/access-key";
const HTTP_CREDENTIAL_REF = "http-proxy/access-key";
const CREDENTIAL_SCOPES: Record<string, FunctionAccessScope> = {
  [FOUNDRY_CREDENTIAL_REF]: "foundry",
  [HTTP_CREDENTIAL_REF]: "http-proxy",
};
const FOUNDRY_ORIGIN = new URL(hostConfig.foundryProxyOrigin).origin;
const HTTP_PROXY_ORIGIN = new URL(hostConfig.httpProxyOrigin).origin;

export const browserServiceRegistryOptions: SampleServiceRegistryOptions = {
  hostCapabilities: ["foundry-executor", "credential-resolver", "http-executor", "mcp-executor"],
  resolveCredential: async (reference) => {
    const scope = CREDENTIAL_SCOPES[reference];
    if (!scope) throw new Error(`Unknown credential reference '${reference}'`);
    const key = getFunctionAccessKey(scope).trim();
    if (!key) throw new Error(`${FUNCTION_ACCESS[scope].label} access is required`);
    return key;
  },
  clearCredential: (reference) => {
    const scope = CREDENTIAL_SCOPES[reference];
    if (!scope) throw new Error(`Unknown credential reference '${reference}'`);
    clearFunctionAccessKey(scope);
  },
  authorizeEndpoint: (kind, endpoint) =>
    (kind === "foundry-agent" && endpoint.origin === FOUNDRY_ORIGIN)
    || (kind === "http-service" && endpoint.origin === HTTP_PROXY_ORIGIN),
  execute: async (request) => {
    const invocation = request as Parameters<typeof executeHttpServiceInvocation>[0];
    if (invocation.kind === "http-service") {
      const config = invocation.declaration.config as Record<string, Json> | undefined;
      const endpoint = String(config?.endpoint ?? "");
      const credentialRef = String(config?.credentialRef ?? "");
      if (new URL(endpoint).origin !== HTTP_PROXY_ORIGIN) throw new Error(`HTTP proxy endpoint '${endpoint}' is not authorized by the host`);
      const accessKey = String(await browserServiceRegistryOptions.resolveCredential!(credentialRef));
      try {
        return await executeHttpServiceInvocation(invocation, { proxyOrigin: endpoint, accessKey });
      } catch (error) {
        if (error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 403)) {
          clearFunctionAccessKey("http-proxy");
        }
        throw error;
      }
    }
    if (invocation.kind === "mcp") {
      return executeMcpServiceInvocation(request as Parameters<typeof executeMcpServiceInvocation>[0]);
    }
    throw new Error(`Unsupported sample service execution kind '${String(invocation.kind ?? "unknown")}'`);
  },
};

function mergeRegistryOptions(
  registryOptions: SampleServiceRegistryOptions = {}
): SampleServiceRegistryOptions {
  return {
    ...browserServiceRegistryOptions,
    ...registryOptions,
    hostCapabilities: [
      ...new Set([
        ...(browserServiceRegistryOptions.hostCapabilities ?? []),
        ...(registryOptions.hostCapabilities ?? []),
      ]),
    ],
  };
}

export function createBlueprintServiceHost(
  runtime: BlueprintRuntime,
  state: StateModel,
  registryOptions: SampleServiceRegistryOptions = {}
): DefaultServiceHost {
  const manifest = unwrap(runtime.manifest);
  const declarations = (manifest.externals?.services ?? {}) as Record<string, ServiceDeclaration>;
  return new DefaultServiceHost({
    blueprintId: runtime.blueprintId,
    blueprintRevision: runtime.revision,
    declarations,
    registry: createSampleServiceKindRegistry(mergeRegistryOptions(registryOptions)),
    state,
    expression: new JsonataExpressionProvider({ safe: true }),
  });
}

export function createBlueprintQueueFace(
  runtime: BlueprintRuntime,
  state: StateModel,
  registryOptions: SampleServiceRegistryOptions = {}
): QueueFace {
  return new QueueFace(createBlueprintServiceHost(runtime, state, registryOptions));
}

export function declarativeServiceOrchestrator(
  runtime: BlueprintRuntime,
  registryOptions: SampleServiceRegistryOptions = {}
): NonNullable<LoadBundleOptions["wrapOrchestrator"]> {
  return (fallback, state) => {
    const host = createBlueprintServiceHost(runtime, state, registryOptions);
    const declarations = (unwrap(runtime.manifest).externals?.services ?? {}) as Record<string, ServiceDeclaration>;
    const serviceInvokes = new Set(Object.values(declarations).flatMap((declaration) => Object.keys(declaration.operations)));
    return {
      invoke: (effect, control) => effect.kind === "invoke" && typeof effect.tool === "string" && serviceInvokes.has(effect.tool)
        ? host.invoke(effect)
        : fallback?.invoke?.(effect, control) ?? Promise.resolve(),
      confirm: fallback?.confirm?.bind(fallback),
      route: fallback?.route?.bind(fallback),
      compensate: fallback?.compensate?.bind(fallback),
    };
  };
}