import type { Json } from "../../../kernel/src/index";
import {
  resolveFacets,
  type Facet,
  type FacetRole,
  type InteractionFacetView,
  type InteractionSpec,
  type InteractionTaxonomy,
} from "./interaction-model";
import { planningRecipeOf, type InteractionToPresentationRecipe, type LayerRecipe, type RecipeMatch, type TemplateDefinition } from "./layer-recipes";
import {
  capOrderedItems,
  matchesFacts,
  orderByRank,
  renderTemplate,
  requireProgramEmit,
  type LayerContext,
} from "../../../packages/profile/src/profile-core";
import { interactionProgramEmit } from "./layer-recipes";

export type PresentationContext = LayerContext;
export type LayoutArrangement = string;

export interface LayoutTemplate {
  name: string;
  arrangement: LayoutArrangement;
  maxRegions?: number;
}

function asTemplateRecord(templates: readonly TemplateDefinition[]): Record<string, LayoutTemplate> {
  return Object.fromEntries(templates.map((template) => [template.name, template]));
}

export type RegionPriority = string;
export type RegionDisclosure = string;

export type PresentationEdits = {
  disabled: string[];
  priority: Record<string, RegionPriority>;
  disclosure: Record<string, RegionDisclosure>;
  order: string[];
};

export interface PresentationRegion {
  name: string;
  role: FacetRole;
  priority: RegionPriority;
  disclosure: RegionDisclosure;
  presentation?: string;
  capability?: string;
  read?: Record<string, string>;
  readExpr?: Record<string, string>;
  on?: Record<string, import("../../../kernel/src/index").Action[]>;
  props?: Record<string, Json>;
  rationale?: string;
}

export interface PresentationSpec {
  layout: string;
  arrangement: LayoutArrangement;
  regions: PresentationRegion[];
  source: InteractionSpec;
}

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
  recipe: LayerRecipe,
  taxonomy: InteractionTaxonomy
): PresentationSpec {
  const plannerRecipe = planningRecipeOf(recipe);
  if (!plannerRecipe) {
    throw new Error(`Recipe '${recipe.id}' does not carry presentation planning data`);
  }
  const { template, layout } = selectTemplate(spec, ctx, plannerRecipe);
  const facets = resolveFacets(spec, taxonomy);
  const ordered = orderByRank(facets, (facet, index) => orderRankOf(facet, index, spec, ctx, plannerRecipe));
  const chosen = capOrderedItems(ordered, template.maxRegions, plannerRecipe.cap.preserveRequired, (facet) => facet.required);

  const regions: PresentationRegion[] = chosen.map(({ item: facet }, index) => {
    const priority = priorityOf(facet, index, spec, ctx, plannerRecipe);
    const disclosure = disclosureOf(facet, priority, index, spec, ctx, plannerRecipe);
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
      rationale: rationaleFor(facet, priority, disclosure, index, spec, ctx, plannerRecipe),
    };
    const presentation = facetView?.presentation ?? defaultPresentation(facet, priority, disclosure, index, spec, ctx, plannerRecipe);
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