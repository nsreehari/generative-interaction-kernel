// Build-time discovery and assembly of Blueprint-owned native code, factored out of the app host so
// BlueprintHost and GikDemoBlueprintHost use the same projection, effect, service, and persistence hooks.

import {
  type BundleNative,
  type LoadBundleOptions,
  type EffectHandlerMap,
} from "@gik/react";
import type { ExternalContext, MaterializedBlueprint } from "@gik/blueprint";
import type { Json } from "@gik/kernel";
import { openBlueprint } from "@gik/controlface/blueprint";
import registry from "../blueprints/registry.json";
import * as copilotC2EffectModule from "../blueprints/copilot-c2/native/effect_handlers/copilotC2EffectHandlers";
import * as foundryAgentEffectModule from "../blueprints/foundry-agent/native/effect_handlers/foundryAgentEffectHandlers";
import * as incidentReportExplorerEffectModule from "../blueprints/incident-report-explorer/native/effect_handlers/incidentReportExplorerEffectHandlers";
import * as incidentReportExplorer2EffectModule from "../blueprints/incident-report-explorer-2/native/effect_handlers/incidentReportExplorer2EffectHandlers";
import * as incidentReportExplorer3EffectModule from "../blueprints/incident-report-explorer-3/native/effect_handlers/incidentReportExplorer3EffectHandlers";
import * as liveWorkspaceSocEffectModule from "../blueprints/live-workspace-soc/native/effect_handlers/liveWorkspaceSocEffectHandlers";
import * as manageBlueprintsEffectModule from "../blueprints/manage-blueprints/native/effect_handlers/manageBlueprintsEffectHandlers";
import * as portfolioTrackerEffectModule from "../blueprints/portfolio-tracker/native/effect_handlers/portfolioTrackerEffectHandlers";
import { openSampleBlueprint } from "./blueprints";
import { resolveBundleProjectionViews } from "./provider-registry";
import { browserServiceRegistryOptions, declarativeServiceOrchestrator } from "./service-runtime";

type Registry = {
  default: string;
  blueprints: string[];
  nativeFrom?: Record<string, string>;
};
const REGISTRY = registry as Registry;

type NativeEffectModule = {
  default: EffectHandlerMap;
  hydrateState?: (state: Record<string, unknown>) => void;
  wrapOrchestrator?: (
    next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>
  ) => NonNullable<LoadBundleOptions["wrapOrchestrator"]>;
};

const effectHandlerModules: Record<string, NativeEffectModule> = {
  "copilot-c2": copilotC2EffectModule,
  "foundry-agent": foundryAgentEffectModule,
  "incident-report-explorer": incidentReportExplorerEffectModule,
  "incident-report-explorer-2": incidentReportExplorer2EffectModule,
  "incident-report-explorer-3": incidentReportExplorer3EffectModule,
  "live-workspace-soc": liveWorkspaceSocEffectModule,
  "manage-blueprints": manageBlueprintsEffectModule,
  "portfolio-tracker": portfolioTrackerEffectModule,
};
export function resolveBlueprintNative(id: string): BundleNative {
  const runtime = openSampleBlueprint(id);
  return resolveBlueprintNativeFromRuntime(id, runtime);
}

export function resolveBlueprintNativeFromMaterialized(
  id: string,
  materializedBlueprint: MaterializedBlueprint,
): BundleNative {
  return resolveBlueprintNativeFromRuntime(
    id,
    openBlueprint(materializedBlueprint.payload.terminalBlueprint),
  );
}

function resolveBlueprintNativeFromRuntime(id: string, runtime: ReturnType<typeof openSampleBlueprint>): BundleNative {
  const nativeId = REGISTRY.nativeFrom?.[id] ?? id;
  const effectModule = effectHandlerModules[nativeId];
  const serviceOrchestrator = declarativeServiceOrchestrator(runtime, browserServiceRegistryOptions);
  return {
    effectHandlers: effectModule?.default,
    projectionViews: resolveBundleProjectionViews(nativeId),
    wrapOrchestrator: effectModule?.wrapOrchestrator?.(serviceOrchestrator) ?? serviceOrchestrator,
  };
}

export function resolveBlueprintInitialContext(
  id: string,
  externalContext?: ExternalContext,
): Record<string, Json> {
  const runtime = openSampleBlueprint(id, externalContext);
  const nativeId = REGISTRY.nativeFrom?.[id] ?? id;
  effectHandlerModules[nativeId]?.hydrateState?.(runtime.state);
  return { initialSeed: structuredClone(runtime.state) as Json };
}
