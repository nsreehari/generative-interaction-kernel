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
import { executeMcpServiceInvocation } from "../services/mcp/runtime";
import {
  clearBrowserCredential,
  resolveBrowserCredential,
} from "./function-access";
import { hostConfig } from "./host-config";
import { createSampleServiceRegistryOptions } from "./service-registry-options";

export { createSampleServiceRegistryOptions } from "./service-registry-options";

export const browserServiceRegistryOptions = createSampleServiceRegistryOptions({
  resolveCredential: resolveBrowserCredential,
  clearCredential: clearBrowserCredential,
}, hostConfig);

function mergeRegistryOptions(
  registryOptions: SampleServiceRegistryOptions = {},
  state?: StateModel
): SampleServiceRegistryOptions {
  const execute = registryOptions.execute ?? browserServiceRegistryOptions.execute;
  return {
    ...browserServiceRegistryOptions,
    ...registryOptions,
    hostCapabilities: [
      ...new Set([
        ...(browserServiceRegistryOptions.hostCapabilities ?? []),
        ...(registryOptions.hostCapabilities ?? []),
      ]),
    ],
    execute: execute && state
      ? (request) => {
          const invocation = request as Parameters<typeof executeMcpServiceInvocation>[0];
          if (invocation.kind !== "mcp") return execute(request);
          const config = invocation.declaration.config as Record<string, Json> | undefined;
          const serverStatePath = String(config?.serverStatePath ?? "").trim();
          const server = serverStatePath ? String(state.get(serverStatePath) ?? "").trim() : "";
          if (!server) return execute(request);
          return execute({
            ...invocation,
            declaration: {
              ...invocation.declaration,
              config: { ...config, server },
            },
          });
        }
      : execute,
  };
}

export function createBlueprintServiceHost(
  runtime: BlueprintRuntime,
  state: StateModel,
  registryOptions: SampleServiceRegistryOptions = {}
): DefaultServiceHost {
  const manifest = unwrap(runtime.vocabulary);
  const declarations = (manifest.externals?.services ?? {}) as Record<string, ServiceDeclaration>;
  return new DefaultServiceHost({
    blueprintId: runtime.blueprintId,
    blueprintRevision: runtime.revision,
    declarations,
    registry: createSampleServiceKindRegistry(mergeRegistryOptions(registryOptions, state)),
    state,
    expression: new JsonataExpressionProvider({ safe: true }),
  });
}

export function createBlueprintQueueFace(
  runtime: BlueprintRuntime,
  state: StateModel,
  registryOptions: SampleServiceRegistryOptions = {}
): QueueFace {
  return new QueueFace(createBlueprintServiceHost(runtime, state, mergeRegistryOptions(registryOptions)));
}

export function declarativeServiceOrchestrator(
  runtime: BlueprintRuntime,
  registryOptions: SampleServiceRegistryOptions = {}
): NonNullable<LoadBundleOptions["wrapOrchestrator"]> {
  return (fallback, state) => {
    const host = createBlueprintServiceHost(runtime, state, mergeRegistryOptions(registryOptions));
    const declarations = (unwrap(runtime.vocabulary).externals?.services ?? {}) as Record<string, ServiceDeclaration>;
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