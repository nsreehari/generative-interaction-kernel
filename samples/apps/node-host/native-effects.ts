import type { EffectHandlerMap, LoadBundleOptions } from "@gik/react";
import * as backendOrderProcessing from "../../blueprints/half-baked/backend-order-processing/native/effect_handlers/backendOrderProcessingEffectHandlers";
import * as copilotC2 from "../../blueprints/half-baked/copilot-c2/native/effect_handlers/copilotC2EffectHandlers";
import * as liveWorkspaceSoc from "../../blueprints/half-baked/live-workspace-soc/native/effect_handlers/liveWorkspaceSocEffectHandlers";
import * as manageBlueprints from "../../blueprints/manage-blueprints/native/effect_handlers/manageBlueprintsEffectHandlers";
import { getSampleBlueprintCatalog } from "../../catalog/blueprint-catalog";

export interface SampleNativeEffects {
  default: EffectHandlerMap;
  hydrateState?: (state: Record<string, unknown>) => void;
  wrapOrchestrator?: (
    next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>,
  ) => NonNullable<LoadBundleOptions["wrapOrchestrator"]>;
}

const copilotC2NodeEffects: SampleNativeEffects = { default: copilotC2.default };

export const portableSampleNativeEffects: Readonly<Record<string, SampleNativeEffects>> = {
  "backend-order-processing": backendOrderProcessing,
  "copilot-c2": copilotC2NodeEffects,
  "live-workspace-soc": liveWorkspaceSoc,
  "manage-blueprints": manageBlueprints,
};

export function resolveSampleNativeEffects(id: string): SampleNativeEffects | undefined {
  const nativeId = getSampleBlueprintCatalog().nativeFrom[id] ?? id;
  return portableSampleNativeEffects[nativeId];
}