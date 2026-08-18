import type { EffectHandlerMap, LoadBundleOptions } from "@gik/react";

export interface SampleNativeEffects {
  default: EffectHandlerMap;
  hydrateState?: (state: Record<string, unknown>) => void;
  wrapOrchestrator?: (
    next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>,
  ) => NonNullable<LoadBundleOptions["wrapOrchestrator"]>;
}

export function resolveBrowserSampleNativeEffects(
  _id: string,
): SampleNativeEffects | undefined {
  return undefined;
}