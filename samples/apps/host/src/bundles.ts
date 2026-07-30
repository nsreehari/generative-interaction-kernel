// Build-time discovery for projection providers imported by hosted Blueprints.

import {
  type ProjectionView,
} from "@gik/react";

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

const projectionViews = byBundleId({
  ...rawProjectionViews,
  ...rawAppRootProjectionViews,
}) as Record<string, Record<string, ProjectionView>>;
/** Resolve a bundle's native projection views for another bundle's manifest import. */
export function resolveBundleProjectionViews(id: string): Record<string, ProjectionView> | undefined {
  return projectionViews[id];
}
