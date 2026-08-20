import {
  DefaultServiceHost,
  QueueFace,
  type DefaultServiceHostOptions,
} from "@gik/controlface/services";
import { executeQueuedCellSourceEffect } from "@gik/blueprint/worker";
import type { BlueprintRuntime } from "@gik/controlface/blueprint";
import {
  JsonataExpressionProvider,
  type Json,
  unwrap,
  type ServiceDeclaration,
  type StateModel,
} from "@gik/kernel";
import type { LoadBundleOptions } from "@gik/react";
import {
  createSampleServiceKindRegistry,
  type SampleServiceRegistryOptions,
} from "../../../../service-kinds";
import { executeMcpServiceInvocation } from "../../../../service-kinds/mcp/runtime";
import {
  clearBrowserCredential,
  resolveBrowserCredential,
} from "./browser-credentials";
import { hostConfig } from "../../../../config/host-config";
import { createSampleServiceRegistryOptions } from "../../../../service-kinds/registry-options";
import { createBlueprintAgentLifecycle, type UseProposal } from "./blueprint-agent-lifecycle";
import { createSampleAgentTools } from "../../../shared/agent-tools";
import type { BlueprintProposalStore } from "@gik/blueprint-agent-host";
import { createBlueprintServiceResolver } from "../../../shared/blueprint-service-resolver";
import { createSampleCatalogBlueprintRegistry } from "../../../../catalog/blueprint-catalog";
import { runWithBrowserServiceDependencies } from "./service-dependency-access";
import {
  bindBlueprintStorage,
  type BlueprintStorageConnectionFactory,
} from "../../../shared/blueprint-storage";
import { createBrowserBlueprintStorageConnectionFactory } from "./blueprint-storage";

export { createSampleServiceRegistryOptions } from "../../../../service-kinds/registry-options";

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
  registryOptions: SampleServiceRegistryOptions = {},
  proposalStore?: BlueprintProposalStore<UseProposal>,
  hostPolicy: Pick<DefaultServiceHostOptions, "dependencyFailurePolicy"> = {},
  instanceId = runtime.blueprintId,
  blueprintStorage: BlueprintStorageConnectionFactory =
    createBrowserBlueprintStorageConnectionFactory(false),
): DefaultServiceHost {
  const manifest = unwrap(runtime.vocabulary);
  const declarations = (manifest.externals?.services ?? {}) as Record<string, ServiceDeclaration>;
  const agentLifecycle = createBlueprintAgentLifecycle(runtime, state, { proposalStore });
  const mergedOptions = mergeRegistryOptions(registryOptions, state);
  const rootOptions = bindBlueprintStorage(
    mergedOptions,
    blueprintStorage,
    { blueprintId: runtime.blueprintId, instanceId },
  );
  return new DefaultServiceHost({
    blueprintId: runtime.blueprintId,
    blueprintRevision: runtime.revision,
    declarations,
    registry: createSampleServiceKindRegistry(rootOptions),
    blueprintServices: createBlueprintServiceResolver({
      registry: createSampleCatalogBlueprintRegistry(),
      instanceId,
      createServiceRegistry: (context) => createSampleServiceKindRegistry(bindBlueprintStorage(
        mergeRegistryOptions(mergedOptions, state),
        blueprintStorage,
        context,
      )),
    }),
    state,
    expression: new JsonataExpressionProvider({ safe: true }),
    agentTools: [...createSampleAgentTools(), ...agentLifecycle.tools],
    inProgressProposalSettlement: agentLifecycle.settle,
    ...hostPolicy,
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
  registryOptions: SampleServiceRegistryOptions = {},
  proposalStore?: BlueprintProposalStore<UseProposal>,
  hostPolicy: Pick<DefaultServiceHostOptions, "dependencyFailurePolicy"> = {},
  instanceId = runtime.blueprintId,
  blueprintStorage: BlueprintStorageConnectionFactory =
    createBrowserBlueprintStorageConnectionFactory(false),
): NonNullable<LoadBundleOptions["wrapOrchestrator"]> {
  return (fallback, state) => {
    const host = createBlueprintServiceHost(
      runtime,
      state,
      registryOptions,
      proposalStore,
      hostPolicy,
      instanceId,
      blueprintStorage,
    );
    const declarations = (unwrap(runtime.vocabulary).externals?.services ?? {}) as Record<string, ServiceDeclaration>;
    const serviceInvokes = new Set(Object.values(declarations).flatMap((declaration) => Object.keys(declaration.operations)));
    return {
      invoke: (effect, control) => effect.kind === "invoke" && serviceInvokes.has(effect.control.tool)
        ? executeQueuedCellSourceEffect(
            effect,
            state.snapshot(),
            (executingEffect) => runWithBrowserServiceDependencies(() => host.invoke(executingEffect)),
          )
        : fallback?.invoke?.(effect, control) ?? Promise.resolve(),
      request: fallback?.request?.bind(fallback),
      route: fallback?.route?.bind(fallback),
      compensate: fallback?.compensate?.bind(fallback),
    };
  };
}