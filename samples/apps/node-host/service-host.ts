import { DefaultServiceHost, type ServiceHost } from "@gik/controlface/services";
import type { BlueprintRuntime } from "@gik/controlface/blueprint";
import type { BlueprintHostRegistry } from "@gik/blueprint";
import { executeQueuedCellSourceEffect } from "@gik/blueprint/worker";
import { unwrap, type ServiceDeclaration, type StateModel } from "@gik/kernel";
import { JsonataExpressionProvider } from "@gik/kernel";
import type { LoadBundleOptions } from "@gik/react";
import {
  createSampleServiceKindRegistry,
  type SampleServiceRegistryOptions,
} from "../../service-kinds";
import productionConfig from "../../config/host.production.json" with { type: "json" };
import { createEnvironmentCredentialResolver } from "./environment-credentials";
import type { HostConfig } from "../../config/host-config";
import { createSampleServiceRegistryOptions } from "../../service-kinds/registry-options";
import { createBlueprintServiceResolver } from "../shared/blueprint-service-resolver";
import { createSampleCatalogBlueprintRegistry } from "../../catalog/blueprint-catalog";
import {
  bindBlueprintStorage,
  type BlueprintStorageConnectionFactory,
} from "../shared/blueprint-storage";
import { createNodeBlueprintStorageConnectionFactory } from "./blueprint-storage";
import { createSampleAgentTools } from "../shared/agent-tools";

export function createNodeHostConfig(
  environment: Readonly<Record<string, string | undefined>>,
): HostConfig {
  return {
    foundryProxyOrigin: environment.GIK_FOUNDRY_PROXY_ORIGIN?.trim()
      || productionConfig.foundryProxyOrigin,
    httpProxyOrigin: environment.GIK_HTTP_PROXY_ORIGIN?.trim()
      || productionConfig.httpProxyOrigin,
  };
}

export function createNodeServiceRegistryOptions(
  environment: Readonly<Record<string, string | undefined>>,
  overrides: Pick<SampleServiceRegistryOptions, "deterministicHandlers" | "durableStorageConnections"> = {},
): SampleServiceRegistryOptions {
  return {
    ...createSampleServiceRegistryOptions({
      resolveCredential: createEnvironmentCredentialResolver(environment),
    }, createNodeHostConfig(environment)),
    ...overrides,
  };
}

export function createNodeBlueprintServiceHost(
  runtime: BlueprintRuntime,
  state: StateModel,
  environment: Readonly<Record<string, string | undefined>>,
  overrides: Pick<SampleServiceRegistryOptions, "deterministicHandlers" | "durableStorageConnections"> = {},
  blueprintRegistry: BlueprintHostRegistry = createSampleCatalogBlueprintRegistry(),
  blueprintStorage: BlueprintStorageConnectionFactory =
    createNodeBlueprintStorageConnectionFactory(),
  instanceId = runtime.blueprintId,
): ServiceHost {
  const manifest = unwrap(runtime.vocabulary);
  const declarations = (manifest.externals?.services ?? {}) as Record<string, ServiceDeclaration>;
  const registryOptions = createNodeServiceRegistryOptions(environment, overrides);
  const rootOptions = bindBlueprintStorage(
    registryOptions,
    blueprintStorage,
    { blueprintId: runtime.blueprintId, instanceId },
  );
  return new DefaultServiceHost({
    blueprintId: runtime.blueprintId,
    blueprintRevision: runtime.revision,
    declarations,
    registry: createSampleServiceKindRegistry(rootOptions),
    blueprintServices: createBlueprintServiceResolver({
      registry: blueprintRegistry,
      instanceId,
      createServiceRegistry: (context) => createSampleServiceKindRegistry(bindBlueprintStorage(
        registryOptions,
        blueprintStorage,
        context,
      )),
    }),
    state,
    expression: new JsonataExpressionProvider({ safe: true }),
    agentTools: createSampleAgentTools(),
    dependencyFailurePolicy: "throw",
  });
}

export function nodeServiceOrchestrator(
  runtime: BlueprintRuntime,
  host: ServiceHost,
  state: StateModel,
): NonNullable<LoadBundleOptions["wrapOrchestrator"]> {
  const declarations = (unwrap(runtime.vocabulary).externals?.services ?? {}) as Record<string, ServiceDeclaration>;
  const serviceInvokes = new Set(Object.values(declarations).flatMap((declaration) => Object.keys(declaration.operations)));
  return (fallback) => ({
    invoke: (effect, control) => effect.kind === "invoke" && serviceInvokes.has(effect.control.tool)
      ? executeQueuedCellSourceEffect(effect, state.snapshot(), (executingEffect) => host.invoke(executingEffect))
      : fallback?.invoke?.(effect, control) ?? Promise.resolve(),
    request: fallback?.request?.bind(fallback),
    route: fallback?.route?.bind(fallback),
    compensate: fallback?.compensate?.bind(fallback),
  });
}