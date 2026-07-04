// The Presentation Compiler (ADR-0018): Interaction Model (Layer 3) -> Presentation Model
// (Layer 4). This is the piece the user calls "the moat": it decides, given an interaction
// AND a context (surface / device / space / attention / expertise), how the experience
// should appear *right now*. The same interaction yields different presentations by context
// — desktop workspace vs mobile stack vs copilot narrative — while never dropping a facet
// the interaction marks as required.

import { resolveFacets, type Facet, type FacetRole, type InteractionSpec } from "./interaction";

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

/** Information hierarchy — how prominent a region is ("what should be prominent"). */
export type RegionPriority = "primary" | "secondary" | "tertiary";

/** Progressive disclosure — whether a region is shown up front, folded, or fetched on demand. */
export type RegionDisclosure = "always" | "collapsed" | "on-demand";

/**
 * One region of the Presentation DSL: a facet placed into the experience with a hierarchy and
 * a disclosure decision, plus an optional concrete presentation-type hint. This is the
 * renderer-agnostic, validatable, per-region unit a planner (deterministic or AI) produces.
 */
export interface PresentationRegion {
  /** region id = the facet name. */
  name: string;
  /** the facet's semantic role (drives capability binding downstream). */
  role: FacetRole;
  /** information hierarchy for attention management. */
  priority: RegionPriority;
  /** progressive-disclosure decision for this region. */
  disclosure: RegionDisclosure;
  /** optional concrete presentation-type hint (e.g. "relationship_graph", "timeline"). */
  presentation?: string;
  /** a short, inspectable reason for this placement — the explainability hook an AI planner fills. */
  rationale?: string;
}

/** Layer 4 — the Presentation DSL: a named layout + arrangement + ordered, enriched regions. */
export interface PresentationSpec {
  /** a specific layout name (e.g. investigate_workspace, stack, narrative, comparison). */
  layout: string;
  /** the arrangement archetype the layout uses. */
  arrangement: LayoutArrangement;
  /** ordered regions to render, each an enriched placement of one interaction facet. */
  regions: PresentationRegion[];
  /** the interaction this presentation materializes (kept for data + downstream lowering). */
  source: InteractionSpec;
}

/**
 * The Presentation *Planner* seam: interaction + context -> Presentation DSL. This is the slot an
 * AI presentation planner fills; {@link defaultPresentationPlanner} is the deterministic reference
 * planner. (The Presentation *Compiler* is the next stage down — see `lowerPresentation`.)
 */
export type PresentationPlanner = (
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

/** True when the surface/attention/space/device budget forces tighter disclosure. */
function isConstrained(ctx: PresentationContext): boolean {
  return (
    ctx.surface === "mobile" ||
    ctx.surface === "copilot" ||
    ctx.space === "compact" ||
    ctx.attention === "glanceable" ||
    ctx.device === "voice"
  );
}

/** The lead region is primary; other required facets are secondary; optional ones are tertiary. */
function priorityOf(facet: Facet, index: number): RegionPriority {
  if (index === 0) return "primary";
  return facet.required ? "secondary" : "tertiary";
}

/** Disclosure levels ordered from most to least visible. */
const DISCLOSURE_LEVELS: RegionDisclosure[] = ["always", "collapsed", "on-demand"];

/**
 * Disclosure follows hierarchy, then adapts to the audience: a tight surface hides more, an expert
 * tolerates denser/deferred detail, and a novice is guided (more shown up front). A primary region
 * is always shown regardless. This is the accessibility/density seam (device + expertise).
 */
function disclosureOf(priority: RegionPriority, ctx: PresentationContext): RegionDisclosure {
  if (priority === "primary") return "always";
  let level = priority === "secondary" ? 0 : 1; // base density from hierarchy
  if (isConstrained(ctx)) level += 1; // a tighter budget hides more
  if (ctx.expertise === "expert") level += 1; // experts tolerate denser, deferred detail
  else if (ctx.expertise === "novice") level -= 1; // novices are guided — show more up front
  level = Math.max(0, Math.min(DISCLOSURE_LEVELS.length - 1, level));
  return DISCLOSURE_LEVELS[level];
}

/** A short, inspectable reason for a region's placement (the explainability output of the planner). */
function rationaleFor(
  facet: Facet,
  priority: RegionPriority,
  disclosure: RegionDisclosure,
  ctx: PresentationContext
): string {
  const rank = priority === "primary" ? "lead facet" : facet.required ? "required facet" : "optional facet";
  const shown =
    disclosure === "always"
      ? "shown up front"
      : disclosure === "collapsed"
        ? "collapsed by default"
        : "revealed on demand";
  const budget = isConstrained(ctx) ? ` on a constrained ${ctx.surface} surface` : "";
  const audience = ctx.expertise ? ` for a ${ctx.expertise} audience` : "";
  return `${rank}, ${shown}${budget}${audience}`;
}

/** Default concrete presentation-type per role, where one is unambiguous (else the binding decides). */
const rolePresentation: Partial<Record<FacetRole, string>> = {
  graph: "relationship_graph",
  timeline: "timeline",
  comparison: "diff",
  metrics: "metric_grid",
  narrative: "narrative",
  form: "form",
};

/**
 * The reference planner. Same interaction, context-dependent presentation:
 *   - compare/monitor/create/configure choose an interaction-specific template;
 *   - a glanceable surface (copilot) collapses to a narrative subset;
 *   - a compact surface (mobile) linearizes to a stack;
 *   - otherwise a full workspace grid.
 * On a capped template, optional facets are shed but every required facet is kept. Each surviving
 * facet is placed with a priority (hierarchy), a disclosure decision (which tightens on constrained
 * surfaces), and a presentation-type hint. An AI planner may replace this whole function.
 */
export const defaultPresentationPlanner: PresentationPlanner = (spec, ctx) => {
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

  const regions: PresentationRegion[] = chosen.map((f, i) => {
    const priority = priorityOf(f, i);
    const disclosure = disclosureOf(priority, ctx);
    const region: PresentationRegion = {
      name: f.name,
      role: f.role,
      priority,
      disclosure,
      rationale: rationaleFor(f, priority, disclosure, ctx),
    };
    const presentation = rolePresentation[f.role];
    if (presentation) region.presentation = presentation;
    return region;
  });

  return {
    layout: layoutName(template, spec),
    arrangement: template.arrangement,
    regions,
    source: spec,
  };
};
