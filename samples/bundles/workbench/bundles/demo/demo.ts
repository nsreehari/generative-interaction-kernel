// Self-contained demo data for the workbench playground. The workbench is a *consumer* of the
// platform, so it ships its own manifest + seed rather than reaching into the platform's test
// fixtures. It imports the platform only through the public barrels.
//
// The manifest and seed are DATA — authored in ./manifest.json / ./seed.json. Only demoDataFor
// (the role->seed-path mapping) stays code.

import { InMemoryStateModel, type Enveloped, type ManifestPayload } from "@gik/kernel";
import { resolveFacets, type InteractionSpec } from "../../../../../interaction/src/index";
import demoManifestJson from "./manifest.json";
import demoSeedJson from "./seed.json";

/** A minimal live-cards manifest: the capabilities the React adapter's registry renders. */
export const DEMO_MANIFEST: Enveloped<ManifestPayload> = demoManifestJson as unknown as Enveloped<ManifestPayload>;

/** A fresh, seeded store so metric/table regions show real values in the playground. */
export function seedState(namespaces: string[]): InMemoryStateModel {
  const state = new InMemoryStateModel(namespaces);
  state.apply(demoSeedJson as unknown as Parameters<typeof state.apply>[0]);
  return state;
}

// Facet roles that read a collection vs. a scalar, so any interaction's facets get demo data.
const COLLECTION_ROLES = new Set(["collection", "detail", "timeline", "comparison"]);

/**
 * Point each facet at a seed data path by role, so switching interaction kind still shows
 * something live in the playground. Explicit `spec.data` (once editing exists) wins.
 */
export function demoDataFor(spec: InteractionSpec): Record<string, string> {
  const data: Record<string, string> = {};
  for (const facet of resolveFacets(spec)) {
    data[facet.name] = COLLECTION_ROLES.has(facet.role)
      ? "fetched_sources.orders"
      : "computed_values.total";
  }
  return data;
}
