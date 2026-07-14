import type { Action, Json } from "../../../kernel/src/index";

export type InteractionKind = string;

export interface InteractionFacetView {
  capability?: string;
  props?: Record<string, Json>;
  read?: Record<string, string>;
  readExpr?: Record<string, string>;
  on?: Record<string, Action[]>;
  presentation?: string;
}

export interface InteractionSpec {
  interaction: InteractionKind;
  subject: string;
  capabilities?: string[];
  intent?: { goal?: string; [k: string]: unknown };
  data?: Record<string, string>;
  facetViews?: Record<string, InteractionFacetView>;
}

export interface WorkflowSpec {
  workflow: string;
  subject: string;
  interaction?: InteractionKind;
  capabilities?: string[];
  intent?: { goal?: string; [k: string]: unknown };
  data?: Record<string, string>;
  facetViews?: Record<string, InteractionFacetView>;
}

export type FacetRole = string;

export interface Facet {
  name: string;
  role: FacetRole;
  required: boolean;
}

export type InteractionTaxonomy = Record<string, Facet[]>;

export function resolveFacets(
  spec: InteractionSpec,
  taxonomy: InteractionTaxonomy
): Facet[] {
  const facets = taxonomy[spec.interaction] ?? [];
  if (spec.capabilities?.length) {
    const byName = new Map(facets.map((facet) => [facet.name, facet]));
    return spec.capabilities.map(
      (name) => byName.get(name) ?? { name, role: "detail" as FacetRole, required: true }
    );
  }
  return facets;
}