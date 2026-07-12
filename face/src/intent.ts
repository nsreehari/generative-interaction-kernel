// The intent context — the agent's stated priorities/constraints, CONSUMED to bias the presentation
// planner, never kernel-owned and never a separate runtime artifact. AgentFace validates its shape
// and projects it into the SANCTIONED override channel (PresentationEdits) that the existing pure
// reducer applyPresentationEdits already applies. Intent thus stays consumed-only: it produces
// edits, it does not own planner or kernel behaviour. TS-only. JSON in, JSON out.

import {
  resolveFacets,
  type InteractionSpec,
  type PresentationEdits,
} from "../../interaction/src/index";

/** The agent's intent context. Priorities lead (most important first); constraints are advisory. */
export interface IntentSpec {
  goal?: string;
  /** facet/region names to emphasise, most important first. */
  priorities?: string[];
  /** advisory constraints (e.g. facet names that must stay prominent). */
  constraints?: string[];
}

export interface IntentReport {
  ok: boolean;
  errors: { detail: string }[];
  warnings: { code: string; node?: string; detail: string }[];
}

/** Validate an IntentSpec. When an interaction is supplied, priorities/constraints are checked
 *  (advisory) against its facets. */
export function validateIntent(intent: unknown, interaction?: InteractionSpec): IntentReport {
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
