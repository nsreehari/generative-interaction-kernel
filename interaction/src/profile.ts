import type { Action, CapabilityDescriptor, Json } from "../../kernel/src/index";
import type { FacetRole, InteractionKind } from "./interaction";
import type {
  LayoutArrangement,
  PresentationContext,
  RegionDisclosure,
  RegionPriority,
} from "./presentation";

export type GenUiLayerKind = "interaction" | "presentation" | "runtime-document";

export interface LayerDefinition {
  id: string;
  kind: string;
  schema?: string;
  description?: string;
}

export interface LoweringRecipeRef {
  id: string;
  from: string;
  to: string;
}

export interface Profile {
  id: string;
  kind: string;
  version: string;
  layers: LayerDefinition[];
  recipes: LoweringRecipeRef[];
  metadata?: Record<string, Json>;
}

export interface GenUiProfile extends Profile {
  kind: "genui-profile";
}

export interface ProfileArtifact {
  gik: "0.1";
  type: "profile";
  payload: Profile;
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

export interface ResolvedProfileStage {
  ref: LoweringRecipeRef;
  fromLayer: LayerDefinition;
  toLayer: LayerDefinition;
  recipe: LoweringRecipe;
}

export interface ResolvedProfile {
  artifact: ProfileArtifact;
  layersById: Record<string, LayerDefinition>;
  recipesById: Record<string, LoweringRecipe>;
  /** Ordered execution chain from the profile's source layer to its terminal layer. */
  stages: ResolvedProfileStage[];
}

export interface RecipeLintWarning {
  code:
    | "duplicate-rule-match"
    | "unknown-template"
    | "unknown-capability"
    | "unreachable-fallback"
    | "missing-recipe-ref"
    | "unknown-layer-ref";
  detail: string;
}

function isInteractionToPresentationRecipe(recipe: LoweringRecipe): recipe is InteractionToPresentationRecipe {
  return recipe.from === "interaction" && recipe.to === "presentation";
}

/**
 * Resolve a profile artifact + its recipe artifacts into an ordered execution chain. The chain is
 * derived from the profile's declared layer graph — any number of layers connected by adjacent
 * lowering recipes — not a fixed interaction/presentation/runtime pipeline. A profile of a different
 * kind, or with extra layers, resolves the same way as long as its recipes form one connected chain.
 */
export function resolveProfile(
  artifact: ProfileArtifact,
  recipeArtifacts: readonly LoweringRecipeArtifact[]
): ResolvedProfile {
  const { id, layers, recipes } = artifact.payload;
  const layersById: Record<string, LayerDefinition> = Object.fromEntries(
    layers.map((layer) => [layer.id, layer])
  );
  const recipesById: Record<string, LoweringRecipe> = Object.fromEntries(
    recipeArtifacts.map((recipe) => [recipe.payload.id, recipe.payload])
  );

  const outgoing = new Map<string, LoweringRecipeRef>();
  for (const ref of recipes) {
    if (!layersById[ref.from]) throw new Error(`Profile '${id}' references unknown layer '${ref.from}'`);
    if (!layersById[ref.to]) throw new Error(`Profile '${id}' references unknown layer '${ref.to}'`);
    if (!recipesById[ref.id]) throw new Error(`Profile '${id}' is missing recipe artifact '${ref.id}'`);
    if (outgoing.has(ref.from)) throw new Error(`Profile '${id}' has more than one recipe leaving layer '${ref.from}'`);
    outgoing.set(ref.from, ref);
  }

  const targets = new Set(recipes.map((ref) => ref.to));
  const sources = layers.filter((layer) => outgoing.has(layer.id) && !targets.has(layer.id));
  if (sources.length !== 1) {
    throw new Error(`Profile '${id}' must have exactly one source layer; found ${sources.length}`);
  }

  const stages: ResolvedProfileStage[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = sources[0].id;
  while (cursor !== undefined && outgoing.has(cursor)) {
    if (visited.has(cursor)) throw new Error(`Profile '${id}' has a cycle at layer '${cursor}'`);
    visited.add(cursor);
    const ref: LoweringRecipeRef = outgoing.get(cursor)!;
    const fromLayer = layersById[ref.from];
    const toLayer = layersById[ref.to];
    const recipe = recipesById[ref.id];
    if (recipe.from !== fromLayer.kind || recipe.to !== toLayer.kind) {
      throw new Error(
        `Recipe '${ref.id}' declares '${recipe.from} -> ${recipe.to}' but connects layer kinds '${fromLayer.kind} -> ${toLayer.kind}'`
      );
    }
    stages.push({ ref, fromLayer, toLayer, recipe });
    cursor = ref.to;
  }

  if (stages.length !== recipes.length) {
    throw new Error(`Profile '${id}' recipes do not form a single connected chain`);
  }

  return { artifact, layersById, recipesById, stages };
}

/** Look up the recipe connecting two layer *kinds* in a resolved profile's chain. */
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
  const stage = profile.stages.find((s) => s.fromLayer.kind === fromKind && s.toLayer.kind === toKind);
  if (!stage) {
    throw new Error(`Profile '${profile.artifact.payload.id}' has no '${fromKind} -> ${toKind}' recipe`);
  }
  return stage.recipe;
}

export function lintProfileArtifacts(
  artifact: ProfileArtifact,
  recipeArtifacts: readonly LoweringRecipeArtifact[]
): RecipeLintWarning[] {
  const warnings: RecipeLintWarning[] = [];
  const layers = new Set(artifact.payload.layers.map((layer) => layer.id));
  const recipes = new Set(recipeArtifacts.map((recipe) => recipe.payload.id));
  for (const ref of artifact.payload.recipes) {
    if (!layers.has(ref.from)) {
      warnings.push({
        code: "unknown-layer-ref",
        detail: `recipe ref '${ref.id}' starts from unknown layer '${ref.from}'`,
      });
    }
    if (!layers.has(ref.to)) {
      warnings.push({
        code: "unknown-layer-ref",
        detail: `recipe ref '${ref.id}' targets unknown layer '${ref.to}'`,
      });
    }
    if (!recipes.has(ref.id)) {
      warnings.push({
        code: "missing-recipe-ref",
        detail: `profile '${artifact.payload.id}' does not have a matching recipe artifact for '${ref.id}'`,
      });
    }
  }
  return warnings;
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