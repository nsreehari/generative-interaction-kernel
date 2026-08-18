import type { EffectHandlerMap, LoadBundleOptions } from "@gik/react";
import * as manageBlueprints from "../../../../blueprints/manage-blueprints/native/effect_handlers/manageBlueprintsEffectHandlers";
import { getSampleBlueprintCatalog } from "../../../../catalog/blueprint-catalog";

export interface SampleNativeEffects {
  default: EffectHandlerMap;
  hydrateState?: (state: Record<string, unknown>) => void;
  wrapOrchestrator?: (
    next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>,
  ) => NonNullable<LoadBundleOptions["wrapOrchestrator"]>;
}

const browserSampleNativeEffects: Readonly<Record<string, SampleNativeEffects>> = {
  "manage-blueprints": manageBlueprints,
};

export function resolveBrowserSampleNativeEffects(id: string): SampleNativeEffects | undefined {
  const nativeId = getSampleBlueprintCatalog().nativeFrom[id] ?? id;
  return browserSampleNativeEffects[nativeId];
}