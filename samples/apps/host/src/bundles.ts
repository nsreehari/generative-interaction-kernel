// The HOST REGISTRY SEED: the host reads the DATA in `samples/bundles/registry.json` — the authoritative
// list of which bundles exist, the default, and each bundle's kind — and registers each declared bundle
// into a runtime `BundleRegistry` by resolving its on-disk parts by folder convention. There is no
// hardcoded switch and no per-bundle import list: adding a bundle is dropping a folder under
// samples/bundles/<id>/ and adding one registry entry. The registry is MUTABLE after seeding, so runtime
// code may register/unregister more bundles without a rebuild.
//
// Two kinds:
//   - "json"        : a portable trio (manifest/document/state .json) beside the standard native
//                     directories `effect_handlers/` and `projection_views/` (each an optional index
//                     whose default export is the bundle's map). The generic host runs it.
//   - "native-root" : an irreducibly-native composition (the workbench) whose root.ts re-exports a
//                     React `Root` the host mounts directly. No JSON trio.
//
// NOTE: there is no standalone `inspect` top-level bundle. Workbench guest and inspector subtrees share
// one kernel; its native `inspectSnapshot` projection bridge is not a general cross-kernel embed pattern.

import {
  bundleFromJson,
  createBundleRegistry,
  playgroundApp,
  type BundleNative,
  type BundleRegistry,
  type EffectHandlerMap,
  type LoadBundleOptions,
  type ProjectionView,
} from "@gik/react";
import type React from "react";
import registry from "../../../bundles/registry.json";
import { demoCatalog, resolveDemoComposition } from "../../../shared/demo-catalog";

type BundleKind = "json" | "native-root";
type Registry = { default: string; bundles: Record<string, { kind: BundleKind }> };
const REGISTRY = registry as Registry;

// Vite build-time discovery of each bundle folder's parts, keyed by folder name. registry.json is the
// authoritative list; these globs only supply the file contents for a declared bundle. The `*` matches
// a single segment, so the workbench's own nested `bundles/*` leaves are never picked up here.
const rawManifests = import.meta.glob("../../../bundles/*/manifest.json", { eager: true, import: "default" });
const rawDocuments = import.meta.glob("../../../bundles/*/document.json", { eager: true, import: "default" });
const rawStates = import.meta.glob("../../../bundles/*/state.json", { eager: true, import: "default" });
const rawEffectHandlerModules = import.meta.glob("../../../bundles/*/effect_handlers/index.{ts,tsx}", {
  eager: true,
});
const rawProjectionViews = import.meta.glob("../../../bundles/*/projection_views/index.{ts,tsx}", {
  eager: true,
  import: "default",
});
const rawServiceModules = import.meta.glob("../../../bundles/*/services/index.{ts,tsx}", { eager: true });
const rawRoots = import.meta.glob("../../../bundles/*/root.{ts,tsx}", { eager: true });

/** Re-key a Vite glob (keyed by file path) by the bundle folder id the file lives under. */
function byBundleId<T>(glob: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [path, mod] of Object.entries(glob)) {
    const id = path.match(/\/bundles\/([^/]+)\//)?.[1];
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
const projectionViews = byBundleId(rawProjectionViews) as Record<string, Record<string, ProjectionView>>;
const serviceModules = byBundleId(rawServiceModules) as Record<string, {
  wrapOrchestrator?: LoadBundleOptions["wrapOrchestrator"];
}>;
const roots = byBundleId(rawRoots) as Record<string, { Root?: React.ComponentType }>;

/** The bundle the host mounts when no `?bundle=<id>` is given. */
export const DEFAULT_BUNDLE = REGISTRY.default;

/** Resolve a bundle's native projection views for another bundle's manifest import. */
export function resolveBundleProjectionViews(id: string): Record<string, ProjectionView> | undefined {
  return projectionViews[id];
}

/** Build the runtime registry, SEEDED with every on-disk bundle declared in registry.json plus the
 *  floor's embeddable platform apps (registered `listable: false`, so they are `embed`-only, not switcher
 *  rows). The returned registry is mutable — runtime code may register/unregister further bundles. */
export function createHostRegistry(demoId?: string | null, targetBundleId?: string | null): BundleRegistry {
  const reg = createBundleRegistry();
  const demoComposition = demoId ? resolveDemoComposition(demoId, targetBundleId) : undefined;
  for (const [id, entry] of Object.entries(REGISTRY.bundles)) {
    if (entry.kind === "native-root") {
      const Root = roots[id]?.Root;
      if (!Root) {
        throw new Error(`createHostRegistry: native-root bundle '${id}' has no root.ts exporting \`Root\``);
      }
      reg.registerBundle(id, { kind: "native-root", Root });
      continue;
    }
    reg.registerBundle(id, {
      kind: "bundle",
      make: () => {
        const manifest = structuredClone(manifests[id]);
        const document = structuredClone(documents[id]);
        const state = structuredClone(states[id]) as Record<string, unknown>;
        const effectModule = effectHandlerModules[id];
        if (id === "demo-runner" && demoComposition) {
          state.runner = {
            plan: demoComposition.scenarioPlan,
            catalog: demoCatalog.entries,
            entry: demoComposition.entry,
          };
        }
        const native: BundleNative = {
          effectHandlers: effectModule?.default,
          projectionViews: projectionViews[id],
          wrapOrchestrator: serviceModules[id]?.wrapOrchestrator,
        };
        return bundleFromJson({ manifest, document, state }, native);
      },
      listable: id === "demo-runner" ? false : undefined,
    });
  }
  // Platform apps: embeddable bundles the floor itself provides, not owned by any single json bundle.
  // They join the registry `listable: false` — mountable by `embed props.app`, hidden from the switcher.
  reg.registerBundle("playground", { kind: "bundle", make: playgroundApp, listable: false });
  return reg;
}
