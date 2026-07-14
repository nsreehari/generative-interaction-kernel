import type { Json } from "../../../kernel/src/index";
import taxonomyJson from "../../../profile-templates/genui/taxonomy.json" with { type: "json" };
import {
  resolveFacets,
  type InteractionKind,
  type InteractionSpec,
  type InteractionTaxonomy,
} from "./interaction-model";
import { genuiStructuralValidators } from "./family-schema";
import type { PresentationSpec } from "./view-planner";
import type { AuthoringRegistry } from "../../../packages/profile/src/profile-core";
import type { AuthoringReport } from "../../../packages/profile/src/profile-core";

const emptyReport = (): AuthoringReport => ({ ok: true, errors: [], warnings: [] });
const interactionTaxonomy = taxonomyJson as InteractionTaxonomy;

const describeInteractions = () => {
  return (Object.keys(interactionTaxonomy) as InteractionKind[]).map((kind) => ({
    interaction: kind,
    facets: interactionTaxonomy[kind].map((facet) => ({ name: facet.name, role: facet.role, required: facet.required })),
  }));
};

const validatePresentationFacets = (spec: unknown): AuthoringReport => {
  const errors: { detail: string }[] = [];
  const warnings: { code: string; node?: string; detail: string }[] = [];
  const warn = (code: string, detail: string, node?: string) => warnings.push({ code, node, detail });

  const presentation = spec as PresentationSpec;
  const kind = presentation.source?.interaction as InteractionKind | undefined;
  if (!kind || !(kind in interactionTaxonomy)) {
    errors.push({ detail: `presentation.source.interaction '${String(kind)}' is not a known interaction kind` });
    return { ok: false, errors, warnings };
  }

  const facets = resolveFacets(presentation.source, interactionTaxonomy);
  const facetByName = new Map(facets.map((facet) => [facet.name, facet]));
  const regionNames = new Set(presentation.regions.map((region) => region.name));
  for (const facet of facets) {
    if (facet.required && !regionNames.has(facet.name)) {
      errors.push({ detail: `required facet '${facet.name}' was dropped from the presentation` });
    }
  }
  for (const region of presentation.regions) {
    const facet = facetByName.get(region.name);
    if (!facet) warn("unknown-region", `region '${region.name}' does not correspond to a facet of '${kind}'`, region.name);
    else if (facet.role !== region.role) {
      warn("role-mismatch", `region '${region.name}' role '${region.role}' differs from taxonomy role '${facet.role}'`, region.name);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
};

type IntentSpec = {
  goal?: string;
  priorities?: string[];
  constraints?: string[];
};

const validateIntent = (intent: unknown, interaction?: InteractionSpec): AuthoringReport => {
  const i = (intent ?? {}) as Partial<IntentSpec>;
  const warnings: { code: string; node?: string; detail: string }[] = [];

  if (interaction) {
    const facetNames = new Set(resolveFacets(interaction, interactionTaxonomy).map((facet) => facet.name));
    for (const name of [...(i.priorities ?? []), ...(i.constraints ?? [])]) {
      if (!facetNames.has(name)) {
        warnings.push({
          code: "intent-target-unknown",
          node: name,
          detail: `intent target '${name}' matches no facet of the interaction`,
        });
      }
    }
  }
  return { ok: true, errors: [], warnings };
};

export const genuiAuthoringRegistry: AuthoringRegistry = {
  describe: {
    "interaction-catalog": () => describeInteractions() as unknown as Json,
  },
  validators: genuiStructuralValidators,
  checks: {
    "presentation-facets": (args) => validatePresentationFacets(args.spec),
    "intent-spec": (args) => validateIntent(args.intent, args.interaction as unknown as InteractionSpec | undefined),
  },
};