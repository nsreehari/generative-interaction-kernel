// Host-owned build-time discovery and assembly of Blueprint native code.

import {
  type BundleNative,
  type LoadBundleOptions,
  type EffectHandlerMap,
} from "@gik/react";
import type { ExternalContext, MaterializedBlueprint } from "@gik/blueprint";
import type { Json } from "@gik/kernel";
import { openBlueprint } from "@gik/controlface/blueprint";
import {
  getSampleBlueprintCatalog,
  openSampleBlueprint,
  resolveSampleLaunchExternalContext,
} from "../../../../catalog/blueprint-catalog";
import { resolveBrowserSampleNativeEffects } from "./native-effects";
import { resolveSampleNativeServices } from "./native-services";
import { resolveProjectionViews } from "./provider-registry";
import { browserServiceRegistryOptions, declarativeServiceOrchestrator } from "./service-host";
import type { BlueprintProposalStore } from "@gik/blueprint-agent-host";
import type { UseProposal } from "./blueprint-agent-lifecycle";

export interface ResolveBlueprintNativeOptions {
  proposalStore?: BlueprintProposalStore<UseProposal>;
}

export function resolveBlueprintNative(id: string, options: ResolveBlueprintNativeOptions = {}): BundleNative {
  const runtime = openSampleBlueprint(id);
  return resolveBlueprintNativeFromRuntime(id, runtime, options);
}

export function resolveBlueprintNativeFromMaterialized(
  id: string,
  materializedBlueprint: MaterializedBlueprint,
  options: ResolveBlueprintNativeOptions = {},
): BundleNative {
  return resolveBlueprintNativeFromRuntime(
    id,
    openBlueprint(materializedBlueprint.payload.terminalBlueprint),
    options,
  );
}

function resolveBlueprintNativeFromRuntime(
  id: string,
  runtime: ReturnType<typeof openSampleBlueprint>,
  options: ResolveBlueprintNativeOptions,
): BundleNative {
  const catalog = getSampleBlueprintCatalog();
  const nativeId = catalog.nativeFrom[id] ?? id;
  const projectionId = catalog.projectionFrom[id] ?? nativeId;
  const effectModule = resolveBrowserSampleNativeEffects(id);
  const nativeServices = resolveSampleNativeServices(id);
  const serviceOrchestrator = declarativeServiceOrchestrator(
    runtime,
    {
      ...browserServiceRegistryOptions,
      ...nativeServices,
    },
    options.proposalStore,
    { dependencyFailurePolicy: "throw" },
  );
  return {
    effectHandlers: effectModule?.default,
    projectionViews: resolveProjectionViews(projectionId),
    wrapOrchestrator: effectModule?.wrapOrchestrator?.(serviceOrchestrator) ?? serviceOrchestrator,
  };
}

export function resolveBlueprintInitialContext(
  id: string,
  externalContext?: ExternalContext,
): Record<string, Json> {
  const launchContext = externalContext ?? resolveSampleLaunchExternalContext(id);
  const runtime = openSampleBlueprint(id, launchContext);
  resolveBrowserSampleNativeEffects(id)?.hydrateState?.(runtime.state);
  return {
    initialSeed: structuredClone({ ...runtime.state, ...launchContext }) as Json,
  };
}
