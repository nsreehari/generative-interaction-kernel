import type { EffectHandlerMap, LoadBundleOptions } from "@gik/react";
import * as backendOrderProcessing from "../../../../blueprints/backend-order-processing/native/effect_handlers/backendOrderProcessingEffectHandlers";
import * as copilotC2 from "../../../../blueprints/copilot-c2/native/effect_handlers/copilotC2EffectHandlers";
import * as liveWorkspaceSoc from "../../../../blueprints/live-workspace-soc/native/effect_handlers/liveWorkspaceSocEffectHandlers";
import * as manageBlueprints from "../../../../blueprints/manage-blueprints/native/effect_handlers/manageBlueprintsEffectHandlers";
import { getSampleBlueprintCatalog } from "../../../../catalog/blueprint-catalog";

export interface SampleNativeEffects {
  default: EffectHandlerMap;
  hydrateState?: (state: Record<string, unknown>) => void;
  wrapOrchestrator?: (
    next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>,
  ) => NonNullable<LoadBundleOptions["wrapOrchestrator"]>;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const copilotC2BrowserEffects: SampleNativeEffects = {
  default: copilotC2.default,
  hydrateState: (state) => copilotC2.hydrateState(state, browserStorage()),
  wrapOrchestrator: (next) => copilotC2.wrapOrchestrator(next, browserStorage()),
};

const browserSampleNativeEffects: Readonly<Record<string, SampleNativeEffects>> = {
  "backend-order-processing": backendOrderProcessing,
  "copilot-c2": copilotC2BrowserEffects,
  "live-workspace-soc": liveWorkspaceSoc,
  "manage-blueprints": manageBlueprints,
};

export function resolveBrowserSampleNativeEffects(id: string): SampleNativeEffects | undefined {
  const nativeId = getSampleBlueprintCatalog().nativeFrom[id] ?? id;
  return browserSampleNativeEffects[nativeId];
}