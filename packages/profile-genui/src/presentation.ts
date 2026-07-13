// The Presentation Compiler (ADR-0018): Interaction Model (Layer 3) -> Presentation Model
// (Layer 4). This is the piece the user calls "the moat": it decides, given an interaction
// AND a context (surface / device / space / attention / expertise), how the experience
// should appear *right now*. The same interaction yields different presentations by context
// — desktop workspace vs mobile stack vs copilot narrative — while never dropping a facet
// the interaction marks as required.

import type { Json } from "../../../kernel/src/index";
import { resolveFacets, type Facet, type FacetRole, type InteractionFacetView, type InteractionSpec, type InteractionTaxonomy } from "./interaction";
import type {
  InteractionToPresentationRecipe,
  RecipeMatch,
  TemplateDefinition,
} from "./profile";
import {
  capOrderedItems,
  matchesFacts,
  orderByRank,
  renderTemplate,
  requireProgramEmit,
  type LayerContext,
} from "../../profile/src/profile-core";
import { interactionProgramEmit } from "./profile";

/** Compatibility alias only. GenUI no longer privileges a presentation-specific context type;
 *  recipes consume the shared per-run layer context bag as-is. */
export type PresentationContext = LayerContext;

/** How a template arranges its regions — the shape a renderer materializes. A `string`; the
 *  authoritative arrangement vocabulary is the `arrangement` enum in presentation.schema.json. */
export type LayoutArrangement = string;

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

/** Information hierarchy — how prominent a region is ("what should be prominent"). A `string`; the
 *  authoritative vocabulary is the `priority` enum in presentation.schema.json. */
export type RegionPriority = string;

/** Progressive disclosure — whether a region is shown up front, folded, or fetched on demand. A
 *  `string`; the authoritative vocabulary is the `disclosure` enum in presentation.schema.json. */
export type RegionDisclosure = string;

/**
 * The override deltas an authoring session imposes on a planned presentation. Every field is a
 * *sparse* override: an absent entry means "defer to the planner". `disabled` never drops a facet
 * the interaction marks required; `order` lists the region names to lead with (any region not named
 * keeps its planner-relative order behind them). This is the platform's sanctioned override channel
 * (agents produce it via AgentFace intent); the reducers that apply it live with their consumer.
 */
export type PresentationEdits = {
  /** region names the user hid (required facets are ignored — they can't be dropped). */
  disabled: string[];
  /** per-region priority overrides (region name -> priority). */
  priority: Record<string, RegionPriority>;
  /** per-region disclosure overrides (region name -> disclosure). */
  disclosure: Record<string, RegionDisclosure>;
  /** the leading region order the user pinned (unlisted regions follow in planner order). */
  order: string[];
};

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
  on?: Record<string, import("../../../kernel/src/index").Action[]>;
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

/** Pick a template from the recipe based on the interaction and context. */
function selectTemplate(
  spec: InteractionSpec,
  ctx: LayerContext,
  recipe: InteractionToPresentationRecipe
): { template: LayoutTemplate; layout: string } {
  const templates = asTemplateRecord(recipe.templates);
  const facts: RecipeMatch = {
    ...ctx,
    interaction: spec.interaction,
    constrained: isConstrained(ctx, recipe),
  };
  const match = requireProgramEmit(
    recipe.program,
    "template",
    facts,
    `No template rule matched interaction '${spec.interaction}' in recipe '${recipe.id}'`
  );
  const templateName = match.template;
  const template = templateName ? templates[templateName] : undefined;
  if (!template) throw new Error(`No template '${templateName ?? "<none>"}' declared in recipe '${recipe.id}'`);
  return {
    template,
    layout: renderTemplate(match.layout, {
      ...ctx,
      interaction: spec.interaction,
      subject: spec.subject,
    }),
  };
}

/** True when the surface/attention/space/device budget forces tighter disclosure. */
function isConstrained(ctx: LayerContext, recipe: InteractionToPresentationRecipe): boolean {
  const facts: RecipeMatch = { ...ctx };
  return (recipe.constrainedWhen ?? []).some((rule) => matchesFacts(rule, facts));
}

function regionFacts(
  facet: Facet,
  index: number,
  spec: InteractionSpec,
  ctx: LayerContext,
  recipe: InteractionToPresentationRecipe,
  extra: Partial<RecipeMatch> = {}
): RecipeMatch {
  return {
    ...ctx,
    interaction: spec.interaction,
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
  ctx: LayerContext,
  recipe: InteractionToPresentationRecipe
): number {
  const emit = requireProgramEmit(
    recipe.program,
    "rank",
    regionFacts(facet, index, spec, ctx, recipe),
    `No order rule matched region '${facet.name}' in recipe '${recipe.id}'`
  );
  return emit.rank;
}

function priorityOf(
  facet: Facet,
  index: number,
  spec: InteractionSpec,
  ctx: LayerContext,
  recipe: InteractionToPresentationRecipe
): RegionPriority {
  const emit = requireProgramEmit(
    recipe.program,
    "priority",
    regionFacts(facet, index, spec, ctx, recipe),
    `No priority rule matched region '${facet.name}' in recipe '${recipe.id}'`
  );
  return emit.priority;
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
  ctx: LayerContext,
  recipe: InteractionToPresentationRecipe
): RegionDisclosure {
  const emit = requireProgramEmit(
    recipe.program,
    "disclosure",
    regionFacts(facet, index, spec, ctx, recipe, { priority }),
    `No disclosure rule matched region '${facet.name}' in recipe '${recipe.id}'`
  );
  return emit.disclosure;
}

function rationaleFor(
  facet: Facet,
  priority: RegionPriority,
  disclosure: RegionDisclosure,
  index: number,
  spec: InteractionSpec,
  ctx: LayerContext,
  recipe: InteractionToPresentationRecipe
): string | undefined {
  const emit = interactionProgramEmit(recipe, "rationale", regionFacts(facet, index, spec, ctx, recipe, { priority, disclosure }));
  if (!emit) return undefined;
  return renderTemplate(emit.template, {
    ...ctx,
    interaction: spec.interaction,
    subject: spec.subject,
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
  ctx: LayerContext,
  recipe: InteractionToPresentationRecipe
): string | undefined {
  return interactionProgramEmit(recipe, "presentation", regionFacts(facet, index, spec, ctx, recipe, { priority, disclosure }))?.presentation;
}

export function planPresentationWithRecipe(
  spec: InteractionSpec,
  ctx: LayerContext,
  recipe: InteractionToPresentationRecipe,
  taxonomy?: InteractionTaxonomy
): PresentationSpec {
  const { template, layout } = selectTemplate(spec, ctx, recipe);
  const facets = resolveFacets(spec, taxonomy);

  const ordered = orderByRank(facets, (facet, index) => orderRankOf(facet, index, spec, ctx, recipe));
  const chosen = capOrderedItems(
    ordered,
    template.maxRegions,
    recipe.cap.preserveRequired,
    (facet) => facet.required
  );

  const regions: PresentationRegion[] = chosen.map(({ item: facet }, i) => {
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
