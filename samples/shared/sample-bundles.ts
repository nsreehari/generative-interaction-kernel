// Build-time discovery and assembly of Blueprint-owned native code, factored out of the app host so
// BlueprintHost and GikDemoBlueprintHost use the same projection, effect, service, and persistence hooks.

import {
  type BundleNative,
  type LoadBundleOptions,
  type EffectHandlerMap,
  type ProjectionView,
} from "@gik/react";
import type { ExternalContext, MaterializedBlueprint } from "@gik/blueprint";
import type { Json } from "@gik/kernel";
import { openBlueprint } from "@gik/controlface/blueprint";
import registry from "../blueprints/registry.json";
import { openSampleBlueprint } from "./blueprints";
import { browserServiceRegistryOptions, declarativeServiceOrchestrator } from "./service-runtime";

type Registry = {
  default: string;
  blueprints: string[];
  nativeFrom?: Record<string, string>;
};
const REGISTRY = registry as Registry;

// Build-time discovery of each bundle folder's parts, keyed by folder name (paths relative to
// samples/shared). A Blueprint's native code may live under a DIFFERENT bundle id via `nativeFrom`
// (e.g. a `*-no-cells` Blueprint reuses its base bundle's handlers and views).
const rawEffectHandlerModules = import.meta.glob("../bundles/*/effect_handlers/index.{ts,tsx}", {
  eager: true,
});
const rawProjectionViews = import.meta.glob("../bundles/*/projection_views/index.{ts,tsx}", {
  eager: true,
  import: "default",
});
const rawAppRootProjectionViews = import.meta.glob("../bundles/approot/*/projection_views/index.{ts,tsx}", {
  eager: true,
  import: "default",
});

/** Re-key a Vite glob (keyed by file path) by the bundle folder id the file lives under. */
function byBundleId<T>(glob: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [path, mod] of Object.entries(glob)) {
    const id = path.match(/\/bundles\/(?:approot\/)?([^/]+)\//)?.[1];
    if (id) out[id] = mod;
  }
  return out;
}

const effectHandlerModules = byBundleId(rawEffectHandlerModules) as Record<string, {
  default: EffectHandlerMap;
  hydrateState?: (state: Record<string, unknown>) => void;
  wrapOrchestrator?: (
    next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>
  ) => NonNullable<LoadBundleOptions["wrapOrchestrator"]>;
}>;
const projectionViews = byBundleId({
  ...rawProjectionViews,
  ...rawAppRootProjectionViews,
}) as Record<string, Record<string, ProjectionView>>;

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
    projectionViews: projectionViews[nativeId],
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
