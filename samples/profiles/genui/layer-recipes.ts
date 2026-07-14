import type { Action, CapabilityDescriptor, Json } from "../../../kernel/src/index";
import type { FacetRole, InteractionKind } from "./interaction-model";
import type { LayoutArrangement, RegionDisclosure, RegionPriority } from "./view-planner";
import {
  matchProgramEmit,
  recipeForKinds as recipeForKindsCore,
  resolveProfile,
  lintProfileArtifacts,
  rulesForSlot,
  traceStages,
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
} from "../../../packages/profile/src/profile-core";

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
export type PresentationRule = EmitRule<RecipeMatch, { presentation?: string }>;
export type RationaleRule = EmitRule<RecipeMatch, { template: string }>;

export type InteractionProgramSlot =
  | "template"
  | "rank"
  | "priority"
  | "disclosure"
  | "presentation"
  | "rationale";

export type InteractionProgramRule =
  | ProgramRule<"template", RecipeMatch, { template: string; layout: string }>
  | ProgramRule<"rank", RecipeMatch, { rank: number }>
  | ProgramRule<"priority", RecipeMatch, { priority: RegionPriority }>
  | ProgramRule<"disclosure", RecipeMatch, { disclosure: RegionDisclosure }>
  | ProgramRule<"presentation", RecipeMatch, { presentation?: string }>
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
  capability?: string;
  props?: Record<string, Json>;
  read?: Record<string, string>;
  readExpr?: Record<string, string>;
  on?: Record<string, Action[]>;
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
  slot: "presentation",
  facts: RecipeMatch
): { presentation?: string } | undefined;
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

  for (const rule of recipe.program) {
    const key = `${rule.slot}:${JSON.stringify(rule.match)}`;
    if (seen.has(key)) {
      warnings.push({
        code: "duplicate-rule-match",
        detail: `duplicate runtime ${rule.slot} rule match ${key}`,
      });
    }
    seen.add(key);
    checkCapability(rule.emit.capability, `${rule.slot} rule ${key}`);
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