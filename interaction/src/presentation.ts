// The Presentation Compiler (ADR-0018): Interaction Model (Layer 3) -> Presentation Model
// (Layer 4). This is the piece the user calls "the moat": it decides, given an interaction
// AND a context (surface / device / space / attention / expertise), how the experience
// should appear *right now*. The same interaction yields different presentations by context
// — desktop workspace vs mobile stack vs copilot narrative — while never dropping a facet
// the interaction marks as required.

import { resolveFacets, type FacetRole, type InteractionSpec } from "./interaction";

/**
 * Where and how the experience is being surfaced. `surface` is the primary axis; the rest
 * refine it. A richer compiler can read every field — the reference one below uses surface,
 * space, and attention.
 */
export interface PresentationContext {
  /** the host surface. */
  surface: "desktop" | "web" | "mobile" | "copilot" | "teams";
  /** primary input modality. */
  device?: "pointer" | "touch" | "voice";
  /** available room to render into. */
  space?: "compact" | "regular" | "expanded";
  /** how much of the user's attention this has. */
  attention?: "focused" | "glanceable";
  /** the user's familiarity with the domain (affects density / disclosure). */
  expertise?: "novice" | "intermediate" | "expert";
  [k: string]: unknown;
}

/** How a template arranges its regions — the shape a renderer materializes. */
export type LayoutArrangement = "stack" | "narrative" | "split" | "grid" | "dashboard" | "wizard";

/** A named layout template: an arrangement plus an optional cap on how many regions it shows. */
export interface LayoutTemplate {
  name: string;
  arrangement: LayoutArrangement;
  /** hard cap on regions on constrained surfaces; omitted = no cap. Required facets always survive. */
  maxRegions?: number;
}

/** The catalog of named layout templates the compiler can choose from. */
export const layoutTemplates: Record<string, LayoutTemplate> = {
  stack: { name: "stack", arrangement: "stack" },
  narrative: { name: "narrative", arrangement: "narrative", maxRegions: 3 },
  comparison: { name: "comparison", arrangement: "split" },
  workspace: { name: "workspace", arrangement: "grid" },
  dashboard: { name: "dashboard", arrangement: "dashboard" },
  wizard: { name: "wizard", arrangement: "wizard" },
};

/** Layer 4 — a materialization plan: a named layout + arrangement + the ordered regions to fill. */
export interface PresentationSpec {
  /** a specific layout name (e.g. investigate_workspace, stack, narrative, comparison). */
  layout: string;
  /** the arrangement archetype the layout uses. */
  arrangement: LayoutArrangement;
  /** ordered regions/panes to render; each corresponds to an interaction facet. */
  regions: string[];
  /** region name -> its facet role, so lowering can bind by role. */
  roles: Record<string, FacetRole>;
  /** the interaction this presentation materializes (kept for data + downstream lowering). */
  source: InteractionSpec;
}

/** A presentation compiler maps an interaction + context to a materialization plan. */
export type PresentationCompiler = (
  spec: InteractionSpec,
  ctx: PresentationContext
) => PresentationSpec;

/** Pick a template from the catalog based on the interaction and context. */
function selectTemplate(spec: InteractionSpec, ctx: PresentationContext): LayoutTemplate {
  const compact = ctx.surface === "mobile" || ctx.space === "compact";
  const glanceable = ctx.surface === "copilot" || ctx.attention === "glanceable";

  // interaction-driven templates take precedence over surface heuristics.
  if (spec.interaction === "compare") return layoutTemplates.comparison;
  if (spec.interaction === "monitor") return layoutTemplates.dashboard;
  if (spec.interaction === "create" || spec.interaction === "configure") return layoutTemplates.wizard;

  // then context-driven templates.
  if (glanceable) return layoutTemplates.narrative;
  if (compact) return layoutTemplates.stack;
  return layoutTemplates.workspace;
}

/** The generic workspace archetype gets an interaction-specific name (investigate_workspace, ...). */
function layoutName(template: LayoutTemplate, spec: InteractionSpec): string {
  return template.name === "workspace" ? `${spec.interaction}_workspace` : template.name;
}

/**
 * The reference compiler. Same interaction, context-dependent presentation:
 *   - compare/monitor/create/configure choose an interaction-specific template;
 *   - a glanceable surface (copilot) collapses to a narrative subset;
 *   - a compact surface (mobile) linearizes to a stack;
 *   - otherwise a full workspace grid.
 * On a capped template, optional facets are shed but every required facet is kept.
 * A profile may substitute a richer compiler; this one makes the seam concrete.
 */
export const defaultPresentationCompiler: PresentationCompiler = (spec, ctx) => {
  const template = selectTemplate(spec, ctx);
  const facets = resolveFacets(spec);

  // Required facets first (stable within each group), so a cap can only drop optional ones.
  const ordered = [...facets].sort((a, b) => Number(b.required) - Number(a.required));
  let chosen = ordered;
  if (template.maxRegions != null && ordered.length > template.maxRegions) {
    const required = ordered.filter((f) => f.required);
    const optional = ordered.filter((f) => !f.required);
    chosen = [...required, ...optional].slice(0, Math.max(template.maxRegions, required.length));
  }

  const roles: Record<string, FacetRole> = {};
  for (const f of chosen) roles[f.name] = f.role;

  return {
    layout: layoutName(template, spec),
    arrangement: template.arrangement,
    regions: chosen.map((f) => f.name),
    roles,
    source: spec,
  };
};
