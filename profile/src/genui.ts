import type { Action, CapabilityDescriptor, Json } from "../../kernel/src/index";
import {
  matchProgramEmit,
  recipeForKinds as recipeForKindsCore,
  resolveProfile,
  lintProfileArtifacts,
  rulesForSlot,
  traceStages,
  capOrderedItems,
  matchesFacts,
  orderByRank,
  renderTemplate,
  requireProgramEmit,
  type AuthoringRegistry,
  type AuthoringReport,
  type AuthoringToolDecl,
  type EmitRule,
  type LayerContext,
  type LayerDefinition,
  type LoweringRecipeRef,
  type Profile,
  type ProfileArtifact,
  type ProfileAuthoring,
  type ProgramRule,
  type RecipeBase,
  type RecipeArtifactBase,
  type RecipeLintWarning,
  type ResolvedProfile as ResolvedProfileCore,
  type ResolvedProfileStage as ResolvedProfileStageCore,
  type RuleFacts,
  type StageExecutor,
  type StageTrace,
} from "./profile-core";

export { resolveProfile, lintProfileArtifacts, traceStages };
export type {
  LayerDefinition,
  LoweringRecipeRef,
  Profile,
  ProfileArtifact,
  RecipeBase,
  RecipeArtifactBase,
  RecipeLintWarning,
  StageExecutor,
  StageTrace,
  AuthoringToolDecl,
  ProfileAuthoring,
  AuthoringRegistry,
  AuthoringReport,
};

export type InteractionKind = string;

export interface InteractionFacetView {
  capability?: string;
  props?: Record<string, Json>;
  read?: Record<string, string>;
  readExpr?: Record<string, string>;
  on?: Record<string, Action[]>;
  presentation?: string;
  materialize?: boolean;
}

export interface InteractionSpec {
  interaction: InteractionKind;
  subject: string;
  capabilities?: string[];
  intent?: { goal?: string; [k: string]: unknown };
  data?: Record<string, string>;
  facetViews?: Record<string, InteractionFacetView>;
}

export interface WorkflowSpec {
  workflow: string;
  subject: string;
  interaction?: InteractionKind;
  capabilities?: string[];
  intent?: { goal?: string; [k: string]: unknown };
  data?: Record<string, string>;
  facetViews?: Record<string, InteractionFacetView>;
}

export type FacetRole = string;

export interface Facet {
  name: string;
  role: FacetRole;
  required: boolean;
}

export type InteractionTaxonomy = Record<string, Facet[]>;

export function resolveFacets(spec: InteractionSpec, taxonomy: InteractionTaxonomy): Facet[] {
  const facets = taxonomy[spec.interaction] ?? [];
  if (spec.capabilities?.length) {
    const byName = new Map(facets.map((facet) => [facet.name, facet]));
    return spec.capabilities.map(
      (name) => byName.get(name) ?? { name, role: "detail" as FacetRole, required: true }
    );
  }
  return facets;
}

export type PresentationContext = LayerContext;
export type LayoutArrangement = string;
export type RegionPriority = string;
export type RegionDisclosure = string;

export interface LayoutTemplate {
  name: string;
  arrangement: LayoutArrangement;
  maxRegions?: number;
}

export type PresentationEdits = {
  disabled: string[];
  priority: Record<string, RegionPriority>;
  disclosure: Record<string, RegionDisclosure>;
  order: string[];
};

export interface PresentationRegion {
  name: string;
  role: FacetRole;
  group?: string;
  priority: RegionPriority;
  disclosure: RegionDisclosure;
  presentation?: string;
  materialize?: boolean;
  capability?: string;
  read?: Record<string, string>;
  readExpr?: Record<string, string>;
  on?: Record<string, Action[]>;
  props?: Record<string, Json>;
  rationale?: string;
}

export interface PresentationSpec {
  layout: string;
  arrangement: LayoutArrangement;
  regions: PresentationRegion[];
  source: InteractionSpec;
}

export interface LayerRecipe extends RecipeBase {
  metadata?: { executor?: string } & Record<string, Json>;
}

export interface LayerProfile extends Profile {
  kind: "genui-profile";
}

export interface RecipeMatch extends RuleFacts, Partial<LayerContext> {
  workflow?: string;
  interaction?: InteractionKind;
  subject?: string;
  constrained?: boolean;
  region?: string;
  role?: FacetRole;
  required?: boolean;
  priority?: RegionPriority;
  disclosure?: RegionDisclosure;
  group?: string;
  index?: number;
  presentation?: string;
}

export interface TemplateDefinition {
  name: string;
  arrangement: LayoutArrangement;
  maxRegions?: number;
}

export type TemplateRule = EmitRule<RecipeMatch, { template: string; layout: string }>;
export type OrderRule = EmitRule<RecipeMatch, { rank: number }>;
export type PriorityRule = EmitRule<RecipeMatch, { priority: RegionPriority }>;
export type DisclosureRule = EmitRule<RecipeMatch, { disclosure: RegionDisclosure }>;
export type GroupRule = EmitRule<RecipeMatch, { group: string }>;
export type PresentationRule = EmitRule<RecipeMatch, { presentation?: string; materialize?: boolean }>;
export type RationaleRule = EmitRule<RecipeMatch, { template: string }>;

export type InteractionProgramSlot =
  | "template"
  | "rank"
  | "priority"
  | "disclosure"
  | "group"
  | "presentation"
  | "rationale";

export type InteractionProgramRule =
  | ProgramRule<"template", RecipeMatch, { template: string; layout: string }>
  | ProgramRule<"rank", RecipeMatch, { rank: number }>
  | ProgramRule<"priority", RecipeMatch, { priority: RegionPriority }>
  | ProgramRule<"disclosure", RecipeMatch, { disclosure: RegionDisclosure }>
  | ProgramRule<"group", RecipeMatch, { group: string }>
  | ProgramRule<"presentation", RecipeMatch, { presentation?: string; materialize?: boolean }>
  | ProgramRule<"rationale", RecipeMatch, { template: string }>;

export interface InteractionToPresentationRecipe extends LayerRecipe {
  from: string;
  to: string;
  constrainedWhen?: RecipeMatch[];
  templates: TemplateDefinition[];
  program: InteractionProgramRule[];
  cap: {
    preserveRequired: boolean;
  };
}

export type WorkflowProgramSlot = "interaction";

export type WorkflowToInteractionRule = ProgramRule<
  "interaction",
  RecipeMatch,
  { interaction: string; subject?: string; capabilities?: string[] }
>;

export interface WorkflowToInteractionRecipe extends LayerRecipe {
  from: string;
  to: string;
  program: WorkflowToInteractionRule[];
}

export interface RuntimeNodeRecipeFields {
  id?: string;
  capability?: string;
  props?: Record<string, Json>;
  read?: Record<string, string>;
  readExpr?: Record<string, string>;
  gate?: string;
  on?: Record<string, Action[]>;
  children?: RuntimeNodeRecipeFields[];
}

export interface PresentationRuntimeFacts extends RecipeMatch {
  subject?: string;
  layout?: string;
  arrangement?: LayoutArrangement;
}

export type PresentationRuntimeProgramSlot = "container" | "region";

export type PresentationContainerRule = ProgramRule<
  "container",
  PresentationRuntimeFacts,
  RuntimeNodeRecipeFields & { capability: string }
>;

export type PresentationRegionRule = ProgramRule<
  "region",
  PresentationRuntimeFacts,
  RuntimeNodeRecipeFields
>;

export type PresentationRuntimeProgramRule = PresentationContainerRule | PresentationRegionRule;

export interface PresentationToRuntimeRecipe extends LayerRecipe {
  from: string;
  to: string;
  program: PresentationRuntimeProgramRule[];
}

export interface InteractionToRuntimeRecipe extends LayerRecipe {
  from: string;
  to: string;
  planner: InteractionToPresentationRecipe;
  runtime: PresentationToRuntimeRecipe;
}

export interface LayerRecipeArtifact {
  gik: "0.1";
  type: "lowering-recipe";
  payload: LayerRecipe;
}

export type ResolvedLayerProfileStage = ResolvedProfileStageCore<LayerRecipe>;
export type ResolvedLayerProfile = ResolvedProfileCore<LayerRecipe>;

export function recipeExecutor(recipe: LayerRecipe): string {
  return typeof recipe.metadata?.executor === "string" ? recipe.metadata.executor : `${recipe.from}->${recipe.to}`;
}

export function interactionProgramRules<TSlot extends InteractionProgramSlot>(
  recipe: InteractionToPresentationRecipe,
  slot: TSlot
): Extract<InteractionProgramRule, { slot: TSlot }>[] {
  return rulesForSlot(recipe.program, slot);
}

export function interactionProgramEmit(
  recipe: InteractionToPresentationRecipe,
  slot: "template",
  facts: RecipeMatch
): { template: string; layout: string } | undefined;
export function interactionProgramEmit(
  recipe: InteractionToPresentationRecipe,
  slot: "rank",
  facts: RecipeMatch
): { rank: number } | undefined;
export function interactionProgramEmit(
  recipe: InteractionToPresentationRecipe,
  slot: "priority",
  facts: RecipeMatch
): { priority: RegionPriority } | undefined;
export function interactionProgramEmit(
  recipe: InteractionToPresentationRecipe,
  slot: "disclosure",
  facts: RecipeMatch
): { disclosure: RegionDisclosure } | undefined;
export function interactionProgramEmit(
  recipe: InteractionToPresentationRecipe,
  slot: "group",
  facts: RecipeMatch
): { group: string } | undefined;
export function interactionProgramEmit(
  recipe: InteractionToPresentationRecipe,
  slot: "presentation",
  facts: RecipeMatch
): { presentation?: string; materialize?: boolean } | undefined;
export function interactionProgramEmit(
  recipe: InteractionToPresentationRecipe,
  slot: "rationale",
  facts: RecipeMatch
): { template: string } | undefined;
export function interactionProgramEmit(
  recipe: InteractionToPresentationRecipe,
  slot: InteractionProgramSlot,
  facts: RecipeMatch
): InteractionProgramRule["emit"] | undefined {
  return matchProgramEmit(recipe.program, slot, facts);
}

export function workflowProgramRules<TSlot extends WorkflowProgramSlot>(
  recipe: WorkflowToInteractionRecipe,
  slot: TSlot
): Extract<WorkflowToInteractionRule, { slot: TSlot }>[] {
  return rulesForSlot(recipe.program, slot);
}

export function workflowProgramEmit(
  recipe: WorkflowToInteractionRecipe,
  slot: "interaction",
  facts: RecipeMatch
): { interaction: string; subject?: string; capabilities?: string[] } | undefined;
export function workflowProgramEmit(
  recipe: WorkflowToInteractionRecipe,
  slot: WorkflowProgramSlot,
  facts: RecipeMatch
): WorkflowToInteractionRule["emit"] | undefined {
  return matchProgramEmit(recipe.program, slot, facts);
}

export function presentationRuntimeProgramRules<TSlot extends PresentationRuntimeProgramSlot>(
  recipe: PresentationToRuntimeRecipe,
  slot: TSlot
): Extract<PresentationRuntimeProgramRule, { slot: TSlot }>[] {
  return rulesForSlot(recipe.program, slot);
}

export function presentationRuntimeProgramEmit(
  recipe: PresentationToRuntimeRecipe,
  slot: "container",
  facts: PresentationRuntimeFacts
): (RuntimeNodeRecipeFields & { capability: string }) | undefined;
export function presentationRuntimeProgramEmit(
  recipe: PresentationToRuntimeRecipe,
  slot: "region",
  facts: PresentationRuntimeFacts
): RuntimeNodeRecipeFields | undefined;
export function presentationRuntimeProgramEmit(
  recipe: PresentationToRuntimeRecipe,
  slot: PresentationRuntimeProgramSlot,
  facts: PresentationRuntimeFacts
): PresentationRuntimeProgramRule["emit"] | undefined {
  return matchProgramEmit(recipe.program, slot, facts);
}

function isInteractionToPresentationRecipe(recipe: LayerRecipe): recipe is InteractionToPresentationRecipe {
  const candidate = recipe as Partial<InteractionToPresentationRecipe>;
  return Array.isArray(candidate.templates) && Array.isArray(candidate.program) && !!candidate.cap;
}

export function isWorkflowToInteractionRecipe(recipe: LayerRecipe): recipe is WorkflowToInteractionRecipe {
  const candidate = recipe as Partial<WorkflowToInteractionRecipe>;
  return !Array.isArray((candidate as Partial<InteractionToPresentationRecipe>).templates)
    && !("planner" in candidate)
    && Array.isArray(candidate.program)
    && candidate.program.every((rule) => rule && typeof rule === "object" && (rule as { slot?: string }).slot === "interaction");
}

export function isPresentationToRuntimeRecipe(recipe: LayerRecipe): recipe is PresentationToRuntimeRecipe {
  const candidate = recipe as Partial<PresentationToRuntimeRecipe>;
  return !("planner" in candidate)
    && Array.isArray(candidate.program)
    && !Array.isArray((candidate as Partial<InteractionToPresentationRecipe>).templates)
    && candidate.program.every((rule) => rule && typeof rule === "object" && ["container", "region"].includes((rule as { slot?: string }).slot ?? ""));
}

export function isInteractionToRuntimeRecipe(recipe: LayerRecipe): recipe is InteractionToRuntimeRecipe {
  const candidate = recipe as Partial<InteractionToRuntimeRecipe>;
  return !!candidate.planner && !!candidate.runtime;
}

export function planningRecipeOf(recipe: LayerRecipe): InteractionToPresentationRecipe | undefined {
  if (isInteractionToPresentationRecipe(recipe)) return recipe;
  if (isInteractionToRuntimeRecipe(recipe)) return recipe.planner;
  return undefined;
}

export function runtimeRecipeOf(recipe: LayerRecipe): PresentationToRuntimeRecipe | undefined {
  if (isPresentationToRuntimeRecipe(recipe)) return recipe;
  if (isInteractionToRuntimeRecipe(recipe)) return recipe.runtime;
  return undefined;
}

export function recipeForLayerKinds(profile: ResolvedLayerProfile, fromKind: string, toKind: string): LayerRecipe;
export function recipeForLayerKinds(profile: ResolvedLayerProfile, fromKind: string, toKind: string): LayerRecipe {
  return recipeForKindsCore(profile, fromKind, toKind);
}

function asTemplateRecord(templates: readonly TemplateDefinition[]): Record<string, LayoutTemplate> {
  return Object.fromEntries(templates.map((template) => [template.name, template]));
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

function groupOf(
  facet: Facet,
  priority: RegionPriority,
  disclosure: RegionDisclosure,
  index: number,
  spec: InteractionSpec,
  ctx: LayerContext,
  recipe: InteractionToPresentationRecipe
): string | undefined {
  return interactionProgramEmit(recipe, "group", regionFacts(facet, index, spec, ctx, recipe, { priority, disclosure }))?.group;
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
): { presentation?: string; materialize?: boolean } | undefined {
  return interactionProgramEmit(recipe, "presentation", regionFacts(facet, index, spec, ctx, recipe, { priority, disclosure }));
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
      group: groupOf(facet, priority, disclosure, index, spec, ctx, plannerRecipe),
      priority,
      disclosure,
      capability: facetView?.capability,
      props: facetView?.props,
      read: facetView?.read,
      readExpr: facetView?.readExpr,
      on: facetView?.on,
      rationale: rationaleFor(facet, priority, disclosure, index, spec, ctx, plannerRecipe),
    };
    const presentationDefaults = defaultPresentation(facet, priority, disclosure, index, spec, ctx, plannerRecipe);
    const presentation = facetView?.presentation ?? presentationDefaults?.presentation;
    if (presentation) region.presentation = presentation;
    const materialize = facetView?.materialize ?? presentationDefaults?.materialize;
    if (materialize !== undefined) region.materialize = materialize;
    return region;
  });

  return {
    layout,
    arrangement: template.arrangement,
    regions,
    source: spec,
  };
}

function lintInteractionToPresentationRecipe(
  recipe: InteractionToPresentationRecipe,
  warnings: RecipeLintWarning[]
): void {
  const templates = new Set(recipe.templates.map((template) => template.name));
  const seen = new Set<string>();
  for (const rule of recipe.program) {
    const key = `${rule.slot}:${JSON.stringify(rule.match)}`;
    if (seen.has(key)) {
      warnings.push({
        code: "duplicate-rule-match",
        detail: `duplicate ${rule.slot} rule match ${JSON.stringify(rule.match)}`,
      });
    }
    seen.add(key);
    if (rule.slot === "template" && !templates.has(rule.emit.template)) {
      warnings.push({
        code: "unknown-template",
        detail: `template rule emits unknown template '${rule.emit.template}'`,
      });
    }
  }
}

function lintWorkflowToInteractionRecipe(
  recipe: WorkflowToInteractionRecipe,
  warnings: RecipeLintWarning[]
): void {
  const seen = new Set<string>();
  for (const rule of recipe.program) {
    const key = `${rule.slot}:${JSON.stringify(rule.match)}`;
    if (seen.has(key)) {
      warnings.push({
        code: "duplicate-rule-match",
        detail: `duplicate workflow ${rule.slot} rule match ${JSON.stringify(rule.match)}`,
      });
    }
    seen.add(key);
  }
}

function lintPresentationToRuntimeRecipe(
  recipe: PresentationToRuntimeRecipe,
  warnings: RecipeLintWarning[],
  capabilities?: Record<string, CapabilityDescriptor>
): void {
  const seen = new Set<string>();
  const checkCapability = (capability: string | undefined, label: string) => {
    if (capability && capabilities && !capabilities[capability]) {
      warnings.push({
        code: "unknown-capability",
        detail: `${label} capability '${capability}' is not declared in the manifest catalog`,
      });
    }
  };
  const checkNode = (node: RuntimeNodeRecipeFields, label: string) => {
    checkCapability(node.capability, label);
    node.children?.forEach((child, index) => checkNode(child, `${label} child ${index}`));
  };

  for (const rule of recipe.program) {
    const key = `${rule.slot}:${JSON.stringify(rule.match)}`;
    if (seen.has(key)) {
      warnings.push({
        code: "duplicate-rule-match",
        detail: `duplicate runtime ${rule.slot} rule match ${key}`,
      });
    }
    seen.add(key);
    checkNode(rule.emit, `${rule.slot} rule ${key}`);
  }
}

export function lintLoweringRecipe(
  artifact: LayerRecipeArtifact,
  capabilities?: Record<string, CapabilityDescriptor>
): RecipeLintWarning[] {
  const warnings: RecipeLintWarning[] = [];
  const recipe = artifact.payload;
  if (isWorkflowToInteractionRecipe(recipe)) lintWorkflowToInteractionRecipe(recipe, warnings);
  const planner = planningRecipeOf(recipe);
  if (planner) lintInteractionToPresentationRecipe(planner, warnings);
  const runtime = runtimeRecipeOf(recipe);
  if (runtime) lintPresentationToRuntimeRecipe(runtime, warnings, capabilities);
  return warnings;
}