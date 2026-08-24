import type { ServiceDeclaration } from "@gik/kernel";
import type {
  BlueprintArtifact,
  LoweringRecipeDefinition,
  ProjectionLoweringRecipeDefinition,
  ServiceLoweringRecipeDefinition,
  TierDefinition,
} from "./types";

export interface ResolvedBlueprintStage<
  TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition,
> {
  fromTier: TierDefinition;
  toTier: TierDefinition;
  recipe: TRecipe;
}

/** One fully resolved lowering axis. The service and projection axes resolve independently, under
 * identical chain invariants, and neither one's outcome is an input to the other's resolution. */
export interface ResolvedBlueprintAxis<
  TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition,
> {
  tiersById: Record<string, TierDefinition>;
  recipesById: Record<string, TRecipe>;
  stages: ResolvedBlueprintStage<TRecipe>[];
  sourceTier: TierDefinition;
  terminalTier: TierDefinition;
}

export interface ResolvedBlueprint {
  artifact: BlueprintArtifact;
  service: ResolvedBlueprintAxis<ServiceLoweringRecipeDefinition>;
  projection: ResolvedBlueprintAxis<ProjectionLoweringRecipeDefinition>;
  services: Record<string, ServiceDeclaration>;
}

export function resolveBlueprintExecution(artifact: BlueprintArtifact): ResolvedBlueprint {
  const { id, serviceTiers, serviceRecipes, projectionTiers, projectionRecipes } = artifact.payload;
  return {
    artifact,
    service: resolveLoweringAxis(id, "service", serviceTiers, serviceRecipes),
    projection: resolveLoweringAxis(id, "projection", projectionTiers, projectionRecipes),
    services: structuredClone(artifact.payload.services ?? {}),
  };
}

/** Resolves one axis' tier/recipe chain. Both axes run through this same function, so both are held
 * to identical invariants: a recipe-free axis requires exactly one terminal tier, and a
 * recipe-bearing axis must form a single connected, non-branching chain from one source tier to one
 * terminal tier. */
export function resolveLoweringAxis<TRecipe extends LoweringRecipeDefinition>(
  blueprintId: string,
  axis: "service" | "projection",
  tiers: readonly TierDefinition[],
  recipes: readonly TRecipe[],
): ResolvedBlueprintAxis<TRecipe> {
  const tiersById = Object.fromEntries(tiers.map((tier) => [tier.id, tier]));
  const recipesById = Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));

  if (recipes.length === 0) {
    if (tiers.length !== 1) {
      throw new Error(
        `Blueprint '${blueprintId}' with no ${axis} recipes must have exactly one terminal ${axis} tier; found ${tiers.length}`,
      );
    }
    return { tiersById, recipesById, stages: [], sourceTier: tiers[0], terminalTier: tiers[0] };
  }

  const outgoing = new Map(recipes.map((recipe) => [recipe.from, recipe]));
  const targets = new Set(recipes.map((recipe) => recipe.to));
  const source = tiers.find((tier) => outgoing.has(tier.id) && !targets.has(tier.id));
  if (!source) throw new Error(`Blueprint '${blueprintId}' has no source ${axis} tier`);

  const stages: ResolvedBlueprintStage<TRecipe>[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = source.id;
  while (cursor !== undefined && outgoing.has(cursor)) {
    if (visited.has(cursor)) throw new Error(`Blueprint '${blueprintId}' has a cycle at ${axis} tier '${cursor}'`);
    visited.add(cursor);
    const recipe: TRecipe = outgoing.get(cursor)!;
    stages.push({ fromTier: tiersById[recipe.from], toTier: tiersById[recipe.to], recipe });
    cursor = recipe.to;
  }

  if (stages.length !== recipes.length) {
    throw new Error(`Blueprint '${blueprintId}' ${axis} recipes do not form a single connected chain`);
  }
  return { tiersById, recipesById, stages, sourceTier: source, terminalTier: stages.at(-1)!.toTier };
}
