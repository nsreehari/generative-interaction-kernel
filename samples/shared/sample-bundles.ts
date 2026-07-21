// Build-time discovery + assembly of the sample bundles, factored out of the app host so any host
// component (BlueprintHost, GikDemoBlueprintHost) can assemble a bundle without the full host registry.
// Two assembly paths:
//   - resolveBlueprintBundle(id): compile a Blueprint's lowered runtime via ControlFace, then attach
//     native code + the declarative service orchestrator.
//   - buildInfrastructureBundle(id, seed?): assemble a raw JSON bundle (manifest/document/state) + its
//     native code, cloning the on-disk state so each mount starts fresh (with an optional seed merge —
//     e.g. the demo-runner's `runner` slice).

import {
  bundleFromJson,
  type Bundle,
  type BundleNative,
  type EffectHandlerMap,
  type ProjectionView,
} from "@gik/react";
import registry from "../profiles/registry.json";
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
const rawManifests = import.meta.glob("../bundles/*/manifest.json", { eager: true, import: "default" });
const rawDocuments = import.meta.glob("../bundles/*/document.json", { eager: true, import: "default" });
const rawStates = import.meta.glob("../bundles/*/state.json", { eager: true, import: "default" });
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

const manifests = byBundleId(rawManifests);
const documents = byBundleId(rawDocuments);
const states = byBundleId(rawStates);
const effectHandlerModules = byBundleId(rawEffectHandlerModules) as Record<string, {
  default: EffectHandlerMap;
}>;
const projectionViews = byBundleId({
  ...rawProjectionViews,
  ...rawAppRootProjectionViews,
}) as Record<string, Record<string, ProjectionView>>;

export function resolveBlueprintNative(id: string): BundleNative {
  const runtime = openSampleBlueprint(id);
  const nativeId = REGISTRY.nativeFrom?.[id] ?? id;
  return {
    effectHandlers: effectHandlerModules[nativeId]?.default,
    projectionViews: projectionViews[nativeId],
    wrapOrchestrator: declarativeServiceOrchestrator(runtime, browserServiceRegistryOptions),
  };
}

/** Resolve a bundle's native projection views by id (for a cross-bundle provider resolver). */
export function resolveSampleProjectionViews(id: string): Record<string, ProjectionView> | undefined {
  return projectionViews[id];
}

/** Compile a Blueprint id into a runnable Bundle with its native code attached. */
export function resolveBlueprintBundle(id: string): Bundle {
  const runtime = openSampleBlueprint(id);
  const { manifest, document, state } = runtime;
  return bundleFromJson({ manifest, document, state }, resolveBlueprintNative(id));
}

/** Assemble a raw JSON bundle (manifest/document/state) + native code. State is cloned per call so each
 *  mount starts fresh; `stateSeed` is merged onto the cloned state (e.g. the demo-runner `runner` slice). */
export function buildInfrastructureBundle(id: string, stateSeed?: Record<string, unknown>): Bundle {
  const state = structuredClone(states[id]) as Record<string, unknown>;
  if (stateSeed) Object.assign(state, stateSeed);
  return bundleFromJson({
    manifest: structuredClone(manifests[id]),
    document: structuredClone(documents[id]),
    state,
  }, {
    effectHandlers: effectHandlerModules[id]?.default,
    projectionViews: projectionViews[id],
  });
}
