// The GenUI profile *flavor*: the concrete layer-kind vocabulary (interaction / presentation /
// runtime-document), the `genui-profile` artifact kind, the two lowering recipe shapes, and their
// lint. The generic kind *mechanism* it builds on (Profile, LayerDefinition, resolveProfile,
// recipeForKinds, the stage runner) lives in ./profile-core (@gik/profile). This module is what
// @gik/profile-genui re-exports.

import type { Action, CapabilityDescriptor, Json } from "../../kernel/src/index";
import type { FacetRole, InteractionKind } from "./interaction";
import type {
  LayoutArrangement,
  PresentationContext,
  RegionDisclosure,
  RegionPriority,
} from "./presentation";
import {
  recipeForKinds as recipeForKindsCore,
  type Profile,
  type RecipeLintWarning,
  type ResolvedProfile as ResolvedProfileCore,
  type ResolvedProfileStage as ResolvedProfileStageCore,
} from "./profile-core";

// Re-export the generic core so importers of the GenUI surface (and the interaction barrel) still
// see the full profile API. `recipeForKinds`, `ResolvedProfile`, and `ResolvedProfileStage` are
// intentionally NOT re-exported here — this module ships GenUI-typed versions of them below.
export { resolveProfile, lintProfileArtifacts, traceStages } from "./profile-core";
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
} from "./profile-core";

export type GenUiLayerKind = "interaction" | "presentation" | "runtime-document";

export interface GenUiProfile extends Profile {
  kind: "genui-profile";
}

export interface RecipeMatch extends Partial<PresentationContext> {
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

export interface TemplateRule {
  match: RecipeMatch;
  emit: { template: string; layout: string };
}

export interface OrderRule {
  match: RecipeMatch;
  emit: { rank: number };
}

export interface PriorityRule {
  match: RecipeMatch;
  emit: { priority: RegionPriority };
}

export interface DisclosureRule {
  match: RecipeMatch;
  emit: { disclosure: RegionDisclosure };
}

export interface PresentationRule {
  match: RecipeMatch;
  emit: { presentation?: string };
}

export interface RationaleRule {
  match: RecipeMatch;
  emit: { template: string };
}

export interface InteractionToPresentationRecipe {
  id: string;
  from: "interaction";
  to: "presentation";
  constrainedWhen?: RecipeMatch[];
  templates: TemplateDefinition[];
  templateRules: TemplateRule[];
  orderRules: OrderRule[];
  priorityRules: PriorityRule[];
  disclosureRules: DisclosureRule[];
  regionRules?: PresentationRule[];
  rationaleRules?: RationaleRule[];
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

export interface PresentationToRuntimeRule {
  match: RecipeMatch;
  emit: RuntimeNodeRecipeFields;
}

export interface PresentationToRuntimeRecipe {
  id: string;
  from: "presentation";
  to: "runtime-document";
  container: RuntimeNodeRecipeFields & { capability: string };
  rules: PresentationToRuntimeRule[];
  fallback?: RuntimeNodeRecipeFields;
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
    for (const rule of recipe.templateRules) {
      if (!templates.has(rule.emit.template)) {
        warnings.push({
          code: "unknown-template",
          detail: `template rule emits unknown template '${rule.emit.template}'`,
        });
      }
      const key = JSON.stringify(rule.match);
      if (seen.has(key)) {
        warnings.push({
          code: "duplicate-rule-match",
          detail: `duplicate template rule match ${key}`,
        });
      }
      seen.add(key);
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

  for (const rule of recipe.rules) {
    const key = JSON.stringify(rule.match);
    if (seen.has(key)) {
      warnings.push({
        code: "duplicate-rule-match",
        detail: `duplicate runtime rule match ${key}`,
      });
    }
    seen.add(key);
    checkCapability(rule.emit.capability, `rule ${key}`);
  }
  checkCapability(recipe.container.capability, "container");
  checkCapability(recipe.fallback?.capability, "fallback");
  if (recipe.fallback && recipe.rules.some((rule) => Object.keys(rule.match).length === 0)) {
    warnings.push({
      code: "unreachable-fallback",
      detail: `fallback on recipe '${recipe.id}' is unreachable because an empty-match rule already catches every region`,
    });
  }
  return warnings;
}
