import type { ServiceDeclaration, ServiceRequirement } from "@gik/kernel";
import type {
  BlueprintArtifact,
  LoweringRecipeDefinition,
  TierDefinition,
} from "./types";

export interface ResolvedBlueprintStage<
  TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition,
> {
  fromTier: TierDefinition;
  toTier: TierDefinition;
  recipe: TRecipe;
}

export interface ResolvedBlueprint<
  TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition,
> {
  artifact: BlueprintArtifact<TRecipe>;
  tiersById: Record<string, TierDefinition>;
  recipesById: Record<string, TRecipe>;
  stages: ResolvedBlueprintStage<TRecipe>[];
  services: Record<string, ServiceRequirement | ServiceDeclaration>;
}

export function resolveBlueprintExecution<
  TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition,
>(
  artifact: BlueprintArtifact<TRecipe>,
): ResolvedBlueprint<TRecipe> {
  const { id, tiers, recipes } = artifact.payload;
  const tiersById = Object.fromEntries(tiers.map((tier) => [tier.id, tier]));
  const recipesById = Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));

  if (recipes.length === 0) {
    if (tiers.length !== 1) {
      throw new Error(`Blueprint '${id}' with no recipes must have exactly one terminal tier; found ${tiers.length}`);
    }
    return resolvedBlueprint(artifact, tiersById, recipesById, []);
  }

  const outgoing = new Map(recipes.map((recipe) => [recipe.from, recipe]));
  const targets = new Set(recipes.map((recipe) => recipe.to));
  const source = tiers.find((tier) => outgoing.has(tier.id) && !targets.has(tier.id));
  if (!source) throw new Error(`Blueprint '${id}' has no source tier`);

  const stages: ResolvedBlueprintStage<TRecipe>[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = source.id;
  while (cursor !== undefined && outgoing.has(cursor)) {
    if (visited.has(cursor)) throw new Error(`Blueprint '${id}' has a cycle at tier '${cursor}'`);
    visited.add(cursor);
    const recipe: TRecipe = outgoing.get(cursor)!;
    stages.push({
      fromTier: tiersById[recipe.from],
      toTier: tiersById[recipe.to],
      recipe,
    });
    cursor = recipe.to;
  }

  if (stages.length !== recipes.length) {
    throw new Error(`Blueprint '${id}' recipes do not form a single connected chain`);
  }
  return resolvedBlueprint(artifact, tiersById, recipesById, stages);
}

function resolvedBlueprint<TRecipe extends LoweringRecipeDefinition>(
  artifact: BlueprintArtifact<TRecipe>,
  tiersById: Record<string, TierDefinition>,
  recipesById: Record<string, TRecipe>,
  stages: ResolvedBlueprintStage<TRecipe>[],
): ResolvedBlueprint<TRecipe> {
  return {
    artifact,
    tiersById,
    recipesById,
    stages,
    services: structuredClone(artifact.payload.services ?? {}),
  };
}
