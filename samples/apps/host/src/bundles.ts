// The application host opens only the Blueprints declared in samples/blueprints/registry.json.
// Ordinary Bundle artifacts are catalogued and previewed by the manage-bundles Blueprint. Tooling
// The V1 demo runner is composed directly by GikDemoBlueprintHost rather than registered as a bundle.

import {
  bundleFromJson,
  createBundleRegistry,
  type BundleNative,
  type BundleRegistry,
  type EffectHandlerMap,
  type LoadBundleOptions,
  type ProjectionView,
} from "@gik/react";
import { playgroundApp } from "../../../bundles/floor/projection_views/playground";
import registry from "../../../blueprints/registry.json";
import { hasSampleBlueprint, openSampleBlueprint } from "../../../shared/blueprints";
import {
  browserServiceRegistryOptions,
  declarativeServiceOrchestrator,
} from "../../../shared/service-runtime";

type Registry = {
  default: string;
  blueprints: string[];
  nativeFrom?: Record<string, string>;
};
const REGISTRY = registry as Registry;

// Vite build-time discovery of each bundle folder's parts, keyed by folder name. registry.json is the
// authoritative list; these globs only supply the file contents for a declared bundle. Hosted app-root
// projections may live under `approot/*`.
const rawEffectHandlerModules = import.meta.glob("../../../bundles/*/effect_handlers/index.{ts,tsx}", {
  eager: true,
});
const rawStateModules = import.meta.glob("../../../bundles/*/state.ts", { eager: true });
const rawProjectionViews = import.meta.glob("../../../bundles/*/projection_views/index.{ts,tsx}", {
  eager: true,
  import: "default",
});
const rawAppRootProjectionViews = import.meta.glob("../../../bundles/approot/*/projection_views/index.{ts,tsx}", {
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
const stateModules = byBundleId(rawStateModules) as Record<string, {
  hydrateState?: (state: Record<string, unknown>) => void;
  wrapOrchestrator?: (
    next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>
  ) => NonNullable<LoadBundleOptions["wrapOrchestrator"]>;
}>;
const projectionViews = byBundleId({
  ...rawProjectionViews,
  ...rawAppRootProjectionViews,
}) as Record<string, Record<string, ProjectionView>>;
/** The Blueprint the host opens when no `?b=<id>` is given. */
export const DEFAULT_BLUEPRINT = REGISTRY.default;

/** Resolve a bundle's native projection views for another bundle's manifest import. */
export function resolveBundleProjectionViews(id: string): Record<string, ProjectionView> | undefined {
  return projectionViews[id];
}

/** Build the runtime registry, SEEDED with every on-disk bundle declared in registry.json plus the
 *  floor's embeddable platform apps (registered `listable: false`, so they are `embed`-only, not switcher
 *  rows). The returned registry is mutable — runtime code may register/unregister further bundles. */
export function createHostRegistry(demoId?: string | null, targetBlueprintId?: string | null): BundleRegistry {
  const reg = createBundleRegistry();
  for (const id of REGISTRY.blueprints) {
    if (!hasSampleBlueprint(id)) {
      throw new Error(`createHostRegistry: Blueprint '${id}' has no supported declarative or approved legacy definition`);
    }
    reg.registerBundle(id, {
      kind: "bundle",
      make: () => {
        const runtime = openSampleBlueprint(id);
        const { vocabulary, program, state } = runtime;
        const nativeId = REGISTRY.nativeFrom?.[id] ?? id;
        const effectModule = effectHandlerModules[nativeId];
        const stateModule = stateModules[nativeId] ?? effectModule;
        stateModule?.hydrateState?.(state as Record<string, unknown>);
        const serviceOrchestrator = declarativeServiceOrchestrator(runtime, browserServiceRegistryOptions);
        const native: BundleNative = {
          effectHandlers: effectModule?.default,
          projectionViews: projectionViews[nativeId],
          wrapOrchestrator: stateModule?.wrapOrchestrator?.(serviceOrchestrator) ?? serviceOrchestrator,
        };
        return bundleFromJson({ vocabulary, program, state }, native);
      },
    });
  }
  // Platform apps: embeddable bundles the floor itself provides, not owned by any single json bundle.
  // They join the registry `listable: false` — mountable by `embed props.app`, hidden from the switcher.
  reg.registerBundle("playground", { kind: "bundle", make: playgroundApp, listable: false });
  return reg;
}
