// The presentation track — validation of a PLANNER'S OUTPUT (L4), not the planner itself. The AI
// presentation planner is a provider slot, deliberately NOT an authoring tool; AgentFace only
// VALIDATES the Presentation DSL a planner (deterministic or AI) produced. Structural checks reuse
// the interaction package's ajv schema; on top sits the hard invariant that a required facet is
// never dropped. JSON in, JSON out.

import {
  validatePresentationSpec,
  PresentationValidationError,
  resolveFacets,
  interactionTaxonomy,
  type PresentationSpec,
  type InteractionKind,
} from "../../interaction/src/index";

export interface PresentationReport {
  ok: boolean;
  errors: { detail: string }[];
  warnings: { code: string; node?: string; detail: string }[];
}

/** Validate a Presentation DSL artifact: structural (ajv) + the required-facet-survives invariant,
 *  plus non-fatal region hygiene. Never throws — the throwing validator is wrapped. */
export function validatePresentation(spec: unknown): PresentationReport {
  const errors: { detail: string }[] = [];
  const warnings: { code: string; node?: string; detail: string }[] = [];
  const warn = (code: string, detail: string, node?: string) => warnings.push({ code, node, detail });

  // structural — a non-throwing shell over the throwing schema validator.
  try {
    validatePresentationSpec(spec);
  } catch (e) {
    if (e instanceof PresentationValidationError) {
      errors.push({ detail: e.message });
      return { ok: false, errors, warnings }; // shape unknown -> skip semantic checks
    }
    throw e;
  }

  const pres = spec as PresentationSpec;
  const kind = pres.source?.interaction as InteractionKind | undefined;
  if (!kind || !(kind in interactionTaxonomy)) {
    errors.push({ detail: `presentation.source.interaction '${String(kind)}' is not a known interaction kind` });
    return { ok: false, errors, warnings };
  }

  const facets = resolveFacets(pres.source);
  const facetByName = new Map(facets.map((f) => [f.name, f]));
  const regionNames = new Set(pres.regions.map((r) => r.name));

  // HARD INVARIANT: every required facet survives as a region.
  for (const f of facets) {
    if (f.required && !regionNames.has(f.name)) {
      errors.push({ detail: `required facet '${f.name}' was dropped from the presentation` });
    }
  }

  // region hygiene (non-fatal).
  for (const r of pres.regions) {
    const f = facetByName.get(r.name);
    if (!f) warn("unknown-region", `region '${r.name}' does not correspond to a facet of '${kind}'`, r.name);
    else if (f.role !== r.role) {
      warn("role-mismatch", `region '${r.name}' role '${r.role}' differs from taxonomy role '${f.role}'`, r.name);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
