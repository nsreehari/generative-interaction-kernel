// The GenUI profile *flavor*: the concrete layer-kind vocabulary (interaction / presentation /
// runtime-document), the `genui-profile` artifact kind, the two lowering recipe shapes, and their
// lint. The generic kind *mechanism* it builds on (Profile, LayerDefinition, resolveProfile,
// recipeForKinds, the stage runner) lives in ./profile-core (@gik/profile). This module is what
// @gik/profile-genui re-exports.

import type { Action, CapabilityDescriptor, Json } from "../../../kernel/src/index";
import type { FacetRole, InteractionKind } from "./interaction";
import type {
  LayoutArrangement,
  RegionDisclosure,
  RegionPriority,
} from "./presentation";
import {
  matchProgramEmit,
  matchesFacts,
  rulesForSlot,
  recipeForKinds as recipeForKindsCore,
  type EmitRule,
  type LayerContext,
  type Profile,
  type ProgramRule,
  type RecipeLintWarning,
  type RuleFacts,
  type ResolvedProfile as ResolvedProfileCore,
  type ResolvedProfileStage as ResolvedProfileStageCore,
} from "../../profile/src/profile-core";

// Re-export the generic core so importers of the GenUI surface (and the interaction barrel) still
// see the full profile API. `recipeForKinds`, `ResolvedProfile`, and `ResolvedProfileStage` are
// intentionally NOT re-exported here — this module ships GenUI-typed versions of them below.
export { resolveProfile, lintProfileArtifacts, traceStages } from "../../profile/src/profile-core";
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
} from "../../profile/src/profile-core";

export type GenUiLayerKind = "interaction" | "presentation" | "runtime-document";

export interface GenUiProfile extends Profile {
  kind: "genui-profile";
}

export interface RecipeMatch extends RuleFacts, Partial<LayerContext> {
  interaction?: InteractionKind;
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

export interface InteractionToPresentationRecipe {
  id: string;
  from: "interaction";
  to: "presentation";
  constrainedWhen?: RecipeMatch[];
  templates: TemplateDefinition[];
  program: InteractionProgramRule[];
  cap: {
    preserveRequired: boolean;
  };
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

export interface PresentationToRuntimeRecipe {
  id: string;
  from: "presentation";
  to: "runtime-document";
  program: PresentationRuntimeProgramRule[];
}

export type LoweringRecipe = InteractionToPresentationRecipe | PresentationToRuntimeRecipe;

export interface LoweringRecipeArtifact {
  gik: "0.1";
  type: "lowering-recipe";
  payload: LoweringRecipe;
}

/** A GenUI profile resolved into its interaction -> presentation -> runtime-document chain. */
export type ResolvedProfileStage = ResolvedProfileStageCore<LoweringRecipe>;
export type ResolvedProfile = ResolvedProfileCore<LoweringRecipe>;

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

function isInteractionToPresentationRecipe(recipe: LoweringRecipe): recipe is InteractionToPresentationRecipe {
  return recipe.from === "interaction" && recipe.to === "presentation";
}

/** Look up the recipe connecting two GenUI layer *kinds* in a resolved profile's chain. */
export function recipeForKinds(
  profile: ResolvedProfile,
  fromKind: "interaction",
  toKind: "presentation"
): InteractionToPresentationRecipe;
export function recipeForKinds(
  profile: ResolvedProfile,
  fromKind: "presentation",
  toKind: "runtime-document"
): PresentationToRuntimeRecipe;
export function recipeForKinds(profile: ResolvedProfile, fromKind: string, toKind: string): LoweringRecipe;
export function recipeForKinds(profile: ResolvedProfile, fromKind: string, toKind: string): LoweringRecipe {
  return recipeForKindsCore(profile, fromKind, toKind);
}

export function lintLoweringRecipe(
  artifact: LoweringRecipeArtifact,
  capabilities?: Record<string, CapabilityDescriptor>
): RecipeLintWarning[] {
  const warnings: RecipeLintWarning[] = [];
  const recipe = artifact.payload;
  if (isInteractionToPresentationRecipe(recipe)) {
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
    return warnings;
  }

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
  return warnings;
}
