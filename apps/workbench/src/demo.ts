// Self-contained demo data for the workbench playground. The workbench is a *consumer* of the
// platform, so it ships its own manifest + seed rather than reaching into the platform's test
// fixtures. It imports the platform only through the public barrels.

import { InMemoryStateModel, type Enveloped, type ManifestPayload } from "../../../kernel/src/index";
import { resolveFacets, type InteractionSpec } from "../../../interaction/src/index";

/** A minimal live-cards manifest: the capabilities the React adapter's registry renders. */
export const DEMO_MANIFEST: Enveloped<ManifestPayload> = {
  gup: "0.1",
  type: "manifest",
  payload: {
    version: "workbench-live-cards/1.0",
    expression: "jsonata",
    namespaces: ["card_data", "requires", "fetched_sources", "computed_values"],
    actions: ["assign", "derive", "invoke", "emit", "navigate", "confirm"],
    capabilities: {
      board: {
        propsSchema: { type: "object", properties: { title: { type: "string" } } },
        slots: ["children"],
      },
      metric: {
        propsSchema: {
          type: "object",
          required: ["label"],
          properties: { label: { type: "string" }, value: { type: ["number", "string"] } },
        },
      },
      table: {
        propsSchema: {
          type: "object",
          properties: { columns: { type: "array", items: { type: "string" } } },
        },
        emits: ["rowSelect"],
      },
      actions: {
        propsSchema: { type: "object", properties: { label: { type: "string" } } },
        emits: ["tap"],
      },
    },
  },
};

/** A fresh, seeded store so metric/table regions show real values in the playground. */
export function seedState(namespaces: string[]): InMemoryStateModel {
  const state = new InMemoryStateModel(namespaces);
  state.apply([
    { op: "set", path: "computed_values.total", value: 150 },
    {
      op: "set",
      path: "fetched_sources.orders",
      value: [
        { id: "order-42", amount: 120 },
        { id: "order-43", amount: 30 },
      ],
    },
  ]);
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
