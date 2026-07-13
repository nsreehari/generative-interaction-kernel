// The Presentation Compiler (ADR-0018): Interaction Model (Layer 3) -> Presentation Model
// (Layer 4). This is the piece the user calls "the moat": it decides, given an interaction
// AND a context (surface / device / space / attention / expertise), how the experience
// should appear *right now*. The same interaction yields different presentations by context
// — desktop workspace vs mobile stack vs copilot narrative — while never dropping a facet
// the interaction marks as required.

import type { Json } from "../../kernel/src/index";
import { resolveFacets, type Facet, type FacetRole, type InteractionFacetView, type InteractionSpec } from "./interaction";
import type {
  InteractionToPresentationRecipe,
  RecipeMatch,
  TemplateDefinition,
} from "./profile";

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

function asTemplateRecord(templates: readonly TemplateDefinition[]): Record<string, LayoutTemplate> {
  return Object.fromEntries(templates.map((template) => [template.name, template]));
}

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
  /** the facet's semantic role (drives capability selection downstream). */
  role: FacetRole;
  /** information hierarchy for attention management. */
  priority: RegionPriority;
  /** progressive-disclosure decision for this region. */
  disclosure: RegionDisclosure;
  /** optional concrete presentation-type hint (e.g. "relationship_graph", "timeline"). */
  presentation?: string;
  /** optional concrete capability override supplied by authored facet views. */
  capability?: string;
  /** optional explicit read edge override supplied by authored facet views. */
  read?: Record<string, string>;
  /** optional explicit shaped read edge override supplied by authored facet views. */
  readExpr?: Record<string, string>;
  /** optional explicit runtime event handlers supplied by authored facet views. */
  on?: Record<string, import("../../kernel/src/index").Action[]>;
  /**
   * Static, per-capability presentation config (the "spec" channel, orthogonal to the dynamic
   * `read`/data edge): columns for a table, chartType/series for a chart, thresholds for an alert.
   * The compiler merges this into the node's `props`, where the capability's `propsSchema` validates
   * it. A planner (deterministic or AI) is the natural author; omit it and each component derives its
   * own sensible defaults from the bound data.
   */
  props?: Record<string, Json>;
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

function readToken(path: string, tokens: Record<string, unknown>): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, tokens);
}

function renderTemplate(template: string, tokens: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_full, key: string) => {
    const value = readToken(key.trim(), tokens);
    return value == null ? "" : String(value);
  });
}

function matchesRecipe(match: RecipeMatch, facts: RecipeMatch): boolean {
  return Object.entries(match).every(([key, value]) => facts[key as keyof RecipeMatch] === value);
}

function firstMatchingRule<T extends { match: RecipeMatch }>(
  rules: readonly T[],
  facts: RecipeMatch
): T | undefined {
  return rules.find((rule) => matchesRecipe(rule.match, facts));
}

/** Pick a template from the recipe based on the interaction and context. */
function selectTemplate(
  spec: InteractionSpec,
  ctx: PresentationContext,
  recipe: InteractionToPresentationRecipe
): { template: LayoutTemplate; layout: string } {
  const templates = asTemplateRecord(recipe.templates);
  const facts: RecipeMatch = {
    interaction: spec.interaction,
    surface: ctx.surface,
    device: ctx.device,
    space: ctx.space,
    attention: ctx.attention,
    expertise: ctx.expertise,
    constrained: isConstrained(ctx, recipe),
  };
  const match = firstMatchingRule(recipe.templateRules, facts);
  if (!match) throw new Error(`No template rule matched interaction '${spec.interaction}' in recipe '${recipe.id}'`);
  const templateName = match.emit.template;
  const template = templateName ? templates[templateName] : undefined;
  if (!template) throw new Error(`No template '${templateName ?? "<none>"}' declared in recipe '${recipe.id}'`);
  return {
    template,
    layout: renderTemplate(match.emit.layout, {
      interaction: spec.interaction,
      subject: spec.subject,
      surface: ctx.surface,
      device: ctx.device,
      space: ctx.space,
      attention: ctx.attention,
      expertise: ctx.expertise,
    }),
  };
}

/** True when the surface/attention/space/device budget forces tighter disclosure. */
function isConstrained(ctx: PresentationContext, recipe: InteractionToPresentationRecipe): boolean {
  const facts: RecipeMatch = {
    surface: ctx.surface,
    device: ctx.device,
    space: ctx.space,
    attention: ctx.attention,
    expertise: ctx.expertise,
  };
  return (recipe.constrainedWhen ?? []).some((rule) => matchesRecipe(rule, facts));
}

function regionFacts(
  facet: Facet,
  index: number,
  spec: InteractionSpec,
  ctx: PresentationContext,
  recipe: InteractionToPresentationRecipe,
  extra: Partial<RecipeMatch> = {}
): RecipeMatch {
  return {
    interaction: spec.interaction,
    surface: ctx.surface,
    device: ctx.device,
    space: ctx.space,
    attention: ctx.attention,
    expertise: ctx.expertise,
    constrained: isConstrained(ctx, recipe),
    region: facet.name,
    role: facet.role,
    required: facet.required,
    index,
    ...extra,
  };
}

function orderRankOf(
  facet: Facet,
  index: number,
  spec: InteractionSpec,
  ctx: PresentationContext,
  recipe: InteractionToPresentationRecipe
): number {
  const rule = firstMatchingRule(recipe.orderRules, regionFacts(facet, index, spec, ctx, recipe));
  if (!rule) throw new Error(`No order rule matched region '${facet.name}' in recipe '${recipe.id}'`);
  return rule.emit.rank;
}

function priorityOf(
  facet: Facet,
  index: number,
  spec: InteractionSpec,
  ctx: PresentationContext,
  recipe: InteractionToPresentationRecipe
): RegionPriority {
  const rule = firstMatchingRule(recipe.priorityRules, regionFacts(facet, index, spec, ctx, recipe));
  if (!rule) throw new Error(`No priority rule matched region '${facet.name}' in recipe '${recipe.id}'`);
  return rule.emit.priority;
}

/**
 * Disclosure follows hierarchy, then adapts to the audience: a tight surface hides more, an expert
 * tolerates denser/deferred detail, and a novice is guided (more shown up front). A primary region
 * is always shown regardless. This is the accessibility/density seam (device + expertise).
 */
function disclosureOf(
  facet: Facet,
  priority: RegionPriority,
  index: number,
  spec: InteractionSpec,
  ctx: PresentationContext,
  recipe: InteractionToPresentationRecipe
): RegionDisclosure {
  const rule = firstMatchingRule(
    recipe.disclosureRules,
    regionFacts(facet, index, spec, ctx, recipe, { priority })
  );
  if (!rule) throw new Error(`No disclosure rule matched region '${facet.name}' in recipe '${recipe.id}'`);
  return rule.emit.disclosure;
}

function rationaleFor(
  facet: Facet,
  priority: RegionPriority,
  disclosure: RegionDisclosure,
  index: number,
  spec: InteractionSpec,
  ctx: PresentationContext,
  recipe: InteractionToPresentationRecipe
): string | undefined {
  const rule = firstMatchingRule(
    recipe.rationaleRules ?? [],
    regionFacts(facet, index, spec, ctx, recipe, { priority, disclosure })
  );
  if (!rule) return undefined;
  return renderTemplate(rule.emit.template, {
    interaction: spec.interaction,
    subject: spec.subject,
    surface: ctx.surface,
    device: ctx.device,
    space: ctx.space,
    attention: ctx.attention,
    expertise: ctx.expertise,
    constrained: isConstrained(ctx, recipe),
    region: {
      name: facet.name,
      role: facet.role,
      required: facet.required,
      index,
      priority,
      disclosure,
    },
  });
}

function defaultPresentation(
  facet: Facet,
  priority: RegionPriority,
  disclosure: RegionDisclosure,
  index: number,
  spec: InteractionSpec,
  ctx: PresentationContext,
  recipe: InteractionToPresentationRecipe
): string | undefined {
  return firstMatchingRule(
    recipe.regionRules ?? [],
    regionFacts(facet, index, spec, ctx, recipe, { priority, disclosure })
  )?.emit.presentation;
}

export function planPresentationWithRecipe(
  spec: InteractionSpec,
  ctx: PresentationContext,
  recipe: InteractionToPresentationRecipe
): PresentationSpec {
  const { template, layout } = selectTemplate(spec, ctx, recipe);
  const facets = resolveFacets(spec);

  const ordered = [...facets]
    .map((facet, index) => ({ facet, index, rank: orderRankOf(facet, index, spec, ctx, recipe) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);

  let chosen = ordered;
  if (template.maxRegions != null && ordered.length > template.maxRegions) {
    if (recipe.cap.preserveRequired) {
      const required = ordered.filter(({ facet }) => facet.required);
      const optional = ordered.filter(({ facet }) => !facet.required);
      chosen = [...required, ...optional].slice(0, Math.max(template.maxRegions, required.length));
    } else {
      chosen = ordered.slice(0, template.maxRegions);
    }
  }

  const regions: PresentationRegion[] = chosen.map(({ facet, index }, i) => {
    const priority = priorityOf(facet, i, spec, ctx, recipe);
    const disclosure = disclosureOf(facet, priority, i, spec, ctx, recipe);
    const facetView: InteractionFacetView | undefined = spec.facetViews?.[facet.name];
    const region: PresentationRegion = {
      name: facet.name,
      role: facet.role,
      priority,
      disclosure,
      capability: facetView?.capability,
      props: facetView?.props,
      read: facetView?.read,
      readExpr: facetView?.readExpr,
      on: facetView?.on,
      rationale: rationaleFor(facet, priority, disclosure, i, spec, ctx, recipe),
    };
    const presentation = facetView?.presentation ?? defaultPresentation(facet, priority, disclosure, i, spec, ctx, recipe);
    if (presentation) region.presentation = presentation;
    return region;
  });

  return {
    layout,
    arrangement: template.arrangement,
    regions,
    source: spec,
  };
}
