import {
  JsonataExpressionProvider,
  unwrap,
  type ServiceDeclaration,
  type StateModel,
} from "@gik/kernel";
import type { DeclarativeServiceBinding } from "../../kernel/src/index";
import { bindDeclarativeServiceUsesSync } from "../../face/src/services/service-kinds";
import { QueueFace } from "../../face/src/services/queueface";
import type { BlueprintRuntime } from "../../face/src/live/controlface";
import type { LoadBundleOptions } from "@gik/react";
import {
  createSampleServiceKindRegistry,
  type SampleServiceRegistryOptions,
} from "../services";
import { getFoundryAccessKey } from "../services/foundry-agent";

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
  authorizeEndpoint: (kind, endpoint) => kind === "foundry-agent" && endpoint.origin === FOUNDRY_ORIGIN,
};

export function createBlueprintQueueFace(
  runtime: BlueprintRuntime,
  state: StateModel,
  registryOptions: SampleServiceRegistryOptions = {}
): QueueFace {
  const manifest = unwrap(runtime.manifest);
  const declarations = (manifest.externals?.services ?? {}) as Record<string, ServiceDeclaration>;
  const bindings = (manifest.externals?.serviceBindings ?? []) as DeclarativeServiceBinding[];
  const queueFace = new QueueFace();
  bindDeclarativeServiceUsesSync(
    queueFace,
    createSampleServiceKindRegistry(registryOptions),
    declarations,
    bindings,
    {
      blueprintId: runtime.blueprintId,
      blueprintRevision: runtime.revision,
      state,
      expression: new JsonataExpressionProvider({ safe: true }),
    }
  );
  queueFace.assertSatisfies(declarations);
  return queueFace;
}

export function declarativeServiceOrchestrator(
  runtime: BlueprintRuntime,
  registryOptions: SampleServiceRegistryOptions = {}
): NonNullable<LoadBundleOptions["wrapOrchestrator"]> {
  return (fallback, state) => createBlueprintQueueFace(runtime, state, registryOptions).createOrchestrator(fallback);
}