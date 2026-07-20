import {
  JsonataExpressionProvider,
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
import { clearFoundryAccessKey, getFoundryAccessKey } from "./foundry-access";

const FOUNDRY_CREDENTIAL_REF = "foundry-agent/access-key";
const FOUNDRY_ORIGIN = "https://sz-foundry-proxy.azurewebsites.net";

export const browserServiceRegistryOptions: SampleServiceRegistryOptions = {
  hostCapabilities: ["foundry-executor", "credential-resolver"],
  resolveCredential: async (reference) => {
    if (reference !== FOUNDRY_CREDENTIAL_REF) throw new Error(`Unknown credential reference '${reference}'`);
    const key = getFoundryAccessKey().trim();
    if (!key) throw new Error("Foundry access is required");
    return key;
  },
  clearCredential: (reference) => {
    if (reference !== FOUNDRY_CREDENTIAL_REF) throw new Error(`Unknown credential reference '${reference}'`);
    clearFoundryAccessKey();
  },
  authorizeEndpoint: (kind, endpoint) => kind === "foundry-agent" && endpoint.origin === FOUNDRY_ORIGIN,
};

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
    registry: createSampleServiceKindRegistry(registryOptions),
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
      invoke: (effect) => effect.kind === "invoke" && typeof effect.tool === "string" && serviceInvokes.has(effect.tool)
        ? host.invoke(effect)
        : fallback?.invoke?.(effect) ?? Promise.resolve(),
      confirm: fallback?.confirm?.bind(fallback),
      route: fallback?.route?.bind(fallback),
      compensate: fallback?.compensate?.bind(fallback),
    };
  };
}