// The interaction track — the PRIMARY authoring altitude (the moat). Discovery + validation of an
// InteractionSpec (L3): the domain-neutral "human goal pattern" an agent states instead of picking
// widgets. JSON in, JSON out.

import {
  interactionTaxonomy,
  resolveFacets,
  type InteractionKind,
  type InteractionSpec,
} from "../../interaction/src/index";

export interface InteractionCatalogEntry {
  interaction: InteractionKind;
  facets: { name: string; role: string; required: boolean }[];
}

export interface InteractionReport {
  ok: boolean;
  errors: { detail: string }[];
  warnings: { code: string; node?: string; detail: string }[];
}

/** Project the interaction taxonomy into a flat catalog an authoring agent can read: every
 *  interaction kind with its facets (name + role + required). The vocabulary discovery peer of
 *  describeCatalog, one altitude up. */
export function describeInteractions(): InteractionCatalogEntry[] {
  return (Object.keys(interactionTaxonomy) as InteractionKind[]).map((kind) => ({
    interaction: kind,
    facets: interactionTaxonomy[kind].map((f) => ({ name: f.name, role: f.role, required: f.required })),
  }));
}

/** Validate an InteractionSpec as a definition. Errors are fatal; warnings are advisory. */
export function validateInteraction(spec: unknown): InteractionReport {
  const s = (spec ?? {}) as Partial<InteractionSpec>;
  const errors: { detail: string }[] = [];
  const warnings: { code: string; node?: string; detail: string }[] = [];
  const warn = (code: string, detail: string, node?: string) => warnings.push({ code, node, detail });

  const kind = s.interaction;
  const known = typeof kind === "string" && kind in interactionTaxonomy;
  if (!known) {
    errors.push({ detail: `interaction '${String(kind)}' is not a known interaction kind` });
  }
  if (typeof s.subject !== "string" || s.subject.length === 0) {
    errors.push({ detail: "interaction.subject (non-empty string) is required" });
  }

  if (known) {
    const facetNames = new Set(interactionTaxonomy[kind as InteractionKind].map((f) => f.name));
    let explicitOk = true;
    if (s.capabilities !== undefined) {
      if (!Array.isArray(s.capabilities)) {
        errors.push({ detail: "interaction.capabilities must be an array of facet names" });
        explicitOk = false;
      } else {
        for (const c of s.capabilities) {
          if (typeof c !== "string") {
            errors.push({ detail: "interaction.capabilities entries must be strings" });
            explicitOk = false;
          } else if (!facetNames.has(c)) {
            warn("synthesized-facet", `'${c}' is not a taxonomy facet of '${kind}'; it becomes a required detail facet`, c);
          }
        }
      }
    }

    if (s.data && typeof s.data === "object" && !Array.isArray(s.data)) {
      // explicit capabilities REPLACE the taxonomy facets (see resolveFacets); otherwise all facets apply.
      const resolved =
        explicitOk && Array.isArray(s.capabilities)
          ? new Set(s.capabilities as string[])
          : facetNames;
      for (const key of Object.keys(s.data)) {
        if (!resolved.has(key)) {
          warn("data-for-unknown-facet", `data binding '${key}' matches no facet of this interaction`, key);
        }
      }
    }

    if (s.facetViews && typeof s.facetViews === "object" && !Array.isArray(s.facetViews)) {
      const resolved =
        explicitOk && Array.isArray(s.capabilities)
          ? new Set(s.capabilities as string[])
          : facetNames;
      for (const key of Object.keys(s.facetViews)) {
        if (!resolved.has(key)) {
          warn("view-for-unknown-facet", `facetViews entry '${key}' matches no facet of this interaction`, key);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
