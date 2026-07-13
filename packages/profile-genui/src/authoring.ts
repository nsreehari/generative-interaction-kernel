// The GenUI authoring surface, expressed DECLARATIVELY. This is what makes the genui tools a
// data-driven contribution rather than hardcoded vocabulary in the generic agent face:
//
//   • `genuiAuthoringProfile` — a GenUiProfile whose `authoring.tools` block DECLARES the five
//     genui authoring tools (describe/validate/project ops over the interaction & presentation
//     layers). This is pure data: names, descriptions, input schemas, layer bindings, agent-safety.
//   • `genuiAuthoringRegistry` — the small, named, IRREDUCIBLE code seam the declarations bind to
//     (the structural presentation validator, the semantic checks, the intent projector, the
//     interaction-vocabulary describer). Same shape as the lowering stage executors.
//
// A face engine (`toolsFromProfile`, in @gik/agentface) maps the two together into `McpTool`s. This
// module knows nothing about MCP or the face — it owns only the genui MEANING.

import {
  interactionTaxonomy,
  resolveFacets,
  type InteractionKind,
  type InteractionSpec,
} from "./interaction";
import type { PresentationEdits, PresentationSpec } from "./presentation";
import { validatePresentationSpec, PresentationValidationError } from "./schema";
import type { AuthoringRegistry, AuthoringReport } from "../../profile/src/profile-core";
import type { GenUiProfile } from "./profile";
import type { Json } from "../../../kernel/src/index";

// --- shared report helpers ---------------------------------------------------------------------

const emptyReport = (): AuthoringReport => ({ ok: true, errors: [], warnings: [] });

// --- interaction track -------------------------------------------------------------------------

export interface InteractionCatalogEntry {
  interaction: InteractionKind;
  facets: { name: string; role: string; required: boolean }[];
}

/** Project the interaction taxonomy into a flat catalog an authoring agent can read: every
 *  interaction kind with its facets (name + role + required) — vocabulary discovery. */
export function describeInteractions(): InteractionCatalogEntry[] {
  return (Object.keys(interactionTaxonomy) as InteractionKind[]).map((kind) => ({
    interaction: kind,
    facets: interactionTaxonomy[kind].map((f) => ({ name: f.name, role: f.role, required: f.required })),
  }));
}

/** Validate an InteractionSpec as a definition. Errors are fatal; warnings are advisory. */
export function validateInteraction(spec: unknown): AuthoringReport {
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
      const resolved =
        explicitOk && Array.isArray(s.capabilities) ? new Set(s.capabilities as string[]) : facetNames;
      for (const key of Object.keys(s.data)) {
        if (!resolved.has(key)) {
          warn("data-for-unknown-facet", `data binding '${key}' matches no facet of this interaction`, key);
        }
      }
    }

    if (s.facetViews && typeof s.facetViews === "object" && !Array.isArray(s.facetViews)) {
      const resolved =
        explicitOk && Array.isArray(s.capabilities) ? new Set(s.capabilities as string[]) : facetNames;
      for (const key of Object.keys(s.facetViews)) {
        if (!resolved.has(key)) {
          warn("view-for-unknown-facet", `facetViews entry '${key}' matches no facet of this interaction`, key);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// --- presentation track ------------------------------------------------------------------------

/** Structural (ajv) validation of a Presentation DSL artifact — a non-throwing shell over the
 *  throwing schema validator. Semantic checks run separately, only once this passes. */
export function validatePresentationStructure(spec: unknown): AuthoringReport {
  try {
    validatePresentationSpec(spec);
  } catch (e) {
    if (e instanceof PresentationValidationError) {
      return { ok: false, errors: [{ detail: e.message }], warnings: [] };
    }
    throw e;
  }
  return emptyReport();
}

/** The semantic invariant on a STRUCTURALLY-VALID presentation: every required facet survives as a
 *  region, plus non-fatal region hygiene. */
export function validatePresentationFacets(spec: unknown): AuthoringReport {
  const errors: { detail: string }[] = [];
  const warnings: { code: string; node?: string; detail: string }[] = [];
  const warn = (code: string, detail: string, node?: string) => warnings.push({ code, node, detail });

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

/** Validate a Presentation DSL artifact end-to-end: structural then, only if that passes, the
 *  facet-survival invariant. Never throws. (The registry runs the two pieces separately.) */
export function validatePresentation(spec: unknown): AuthoringReport {
  const structural = validatePresentationStructure(spec);
  if (!structural.ok) return structural;
  return validatePresentationFacets(spec);
}

// --- intent track ------------------------------------------------------------------------------

/** The agent's intent context. Priorities lead (most important first); constraints are advisory. */
export interface IntentSpec {
  goal?: string;
  priorities?: string[];
  constraints?: string[];
}

/** Validate an IntentSpec. When an interaction is supplied, priorities/constraints are checked
 *  (advisory) against its facets. */
export function validateIntent(intent: unknown, interaction?: InteractionSpec): AuthoringReport {
  const i = (intent ?? {}) as Partial<IntentSpec>;
  const errors: { detail: string }[] = [];
  const warnings: { code: string; node?: string; detail: string }[] = [];

  const checkStrArr = (v: unknown, field: string) => {
    if (v === undefined) return;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      errors.push({ detail: `intent.${field} must be an array of strings` });
    }
  };
  checkStrArr(i.priorities, "priorities");
  checkStrArr(i.constraints, "constraints");
  if (i.goal !== undefined && typeof i.goal !== "string") {
    errors.push({ detail: "intent.goal must be a string" });
  }

  if (errors.length === 0 && interaction) {
    const facetNames = new Set(resolveFacets(interaction).map((f) => f.name));
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

  return { ok: errors.length === 0, errors, warnings };
}

/** Project intent into the sanctioned override channel: the lead priority becomes primary, the rest
 *  secondary, and all named priorities pin the leading region order. Produces PresentationEdits the
 *  existing pure reducer applies — so intent biases WITHOUT owning the planner or the kernel. */
export function intentToEdits(intent: IntentSpec): PresentationEdits {
  const priorities = intent.priorities ?? [];
  const priority: PresentationEdits["priority"] = {};
  priorities.forEach((name, idx) => {
    priority[name] = idx === 0 ? "primary" : "secondary";
  });
  return { disabled: [], priority, disclosure: {}, order: [...priorities] };
}

// --- declarative surface -----------------------------------------------------------------------

/** The schema ref the presentation layer carries; the registry registers its structural validator
 *  under the same key so `toolsFromProfile` can derive the structural pass from the layer alone. */
export const GENUI_PRESENTATION_SCHEMA = "genui/presentation.schema.json";

/** The GenUI family profile with its DECLARED authoring surface (data only). `toolsFromProfile`
 *  materializes `authoring.tools` into MCP tools by binding each op to `genuiAuthoringRegistry`. */
export const genuiAuthoringProfile: GenUiProfile = {
  id: "genui",
  kind: "genui-profile",
  version: "0.1",
  layers: [
    { id: "interaction", kind: "interaction", description: "the human-goal pattern (the moat)" },
    { id: "presentation", kind: "presentation", schema: GENUI_PRESENTATION_SCHEMA, description: "a planner's presentation DSL output" },
    { id: "runtime-document", kind: "runtime-document", description: "the lowered runtime UI document" },
  ],
  recipes: [
    { id: "interaction->presentation", from: "interaction", to: "presentation" },
    { id: "presentation->runtime-document", from: "presentation", to: "runtime-document" },
  ],
  authoring: {
    tools: [
      {
        id: "describeInteractions",
        op: "describe",
        layer: "interaction",
        agentSafe: true,
        description: "List the interaction taxonomy (every kind with its facets) — vocabulary discovery.",
      },
      {
        id: "validateInteraction",
        op: "validate",
        layer: "interaction",
        checks: ["interaction-spec"],
        agentSafe: true,
        description: "Validate an InteractionSpec (kind known, subject present, facet/data references).",
      },
      {
        id: "validatePresentation",
        op: "validate",
        layer: "presentation",
        checks: ["presentation-facets"],
        agentSafe: true,
        description: "Validate a Presentation DSL artifact (structure + the required-facet-survives invariant).",
      },
      {
        id: "validateIntent",
        op: "validate",
        checks: ["intent-spec"],
        agentSafe: true,
        description: "Validate an IntentSpec; when an interaction is supplied, check targets against its facets.",
        inputSchema: {
          type: "object",
          properties: { intent: { type: "object" }, interaction: { type: "object" } },
          required: ["intent"],
          additionalProperties: false,
        },
      },
      {
        id: "intentToEdits",
        op: "project",
        projector: "intent->edits",
        agentSafe: true,
        description: "Project an IntentSpec into PresentationEdits (the sanctioned override channel).",
        inputSchema: {
          type: "object",
          properties: { intent: { type: "object" } },
          required: ["intent"],
          additionalProperties: false,
        },
      },
    ],
  },
};

/** The irreducible code the declarations bind to. */
export const genuiAuthoringRegistry: AuthoringRegistry = {
  describe: {
    interaction: () => describeInteractions() as unknown as Json,
  },
  validators: {
    [GENUI_PRESENTATION_SCHEMA]: (args) => validatePresentationStructure(args.spec),
  },
  checks: {
    "interaction-spec": (args) => validateInteraction(args.spec),
    "presentation-facets": (args) => validatePresentationFacets(args.spec),
    "intent-spec": (args) => validateIntent(args.intent, args.interaction as unknown as InteractionSpec | undefined),
  },
  projectors: {
    "intent->edits": (args) => intentToEdits(args.intent as unknown as IntentSpec) as unknown as Json,
  },
};
