import type { ServiceDeclaration } from "@gik-ai/kernel";
import type {
  BlueprintArtifact,
  LoweringRecipeDefinition,
  ProjectionLoweringRecipeDefinition,
  ServiceLoweringRecipeDefinition,
  TierDefinition,
} from "./types";

export interface ResolvedBlueprintStage<
  TTier extends TierDefinition = TierDefinition,
  TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition,
> {
  fromTier: TTier;
  toTier: TTier;
  recipe: TRecipe;
}

/** One fully resolved lowering axis. The service and projection axes resolve independently, under
 * identical chain invariants, and neither one's outcome is an input to the other's resolution. */
export interface ResolvedBlueprintAxis<
  TTier extends TierDefinition = TierDefinition,
  TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition,
> {
  stages: ResolvedBlueprintStage<TTier, TRecipe>[];
  sourceTier: TTier;
  terminalTier: TTier;
}

export interface ResolvedBlueprint {
  artifact: BlueprintArtifact;
  service: ResolvedBlueprintAxis<TierDefinition, ServiceLoweringRecipeDefinition>;
  projection: ResolvedBlueprintAxis<
    BlueprintArtifact["payload"]["projectionTiers"][number],
    ProjectionLoweringRecipeDefinition
  >;
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
export function resolveLoweringAxis<
  TTier extends TierDefinition,
  TRecipe extends LoweringRecipeDefinition,
>(
  blueprintId: string,
  axis: "service" | "projection",
  tiers: readonly TTier[],
  recipes: readonly TRecipe[],
): ResolvedBlueprintAxis<TTier, TRecipe> {
  if (tiers.length === 0) {
    throw new Error(`Blueprint '${blueprintId}' requires at least one ${axis} tier`);
  }
  const tierIds = new Set<string>();
  for (const tier of tiers) {
    if (!tier.id || !tier.kind) {
      throw new Error(`Blueprint '${blueprintId}' ${axis} tier identity is incomplete`);
    }
    if (tierIds.has(tier.id)) {
      throw new Error(`Blueprint '${blueprintId}' has duplicate ${axis} tier '${tier.id}'`);
    }
    tierIds.add(tier.id);
  }
  const recipeIds = new Set<string>();
  const incoming = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();
  for (const recipe of recipes) {
    if (!recipe.id || !recipe.from || !recipe.to) {
      throw new Error(`Blueprint '${blueprintId}' ${axis} recipe is incomplete`);
    }
    if (recipeIds.has(recipe.id)) {
      throw new Error(`Blueprint '${blueprintId}' has duplicate ${axis} recipe '${recipe.id}'`);
    }
    if (!tierIds.has(recipe.from)) {
      throw new Error(`Blueprint '${blueprintId}' ${axis} recipe '${recipe.id}' starts from unknown ${axis} tier '${recipe.from}'`);
    }
    if (!tierIds.has(recipe.to)) {
      throw new Error(`Blueprint '${blueprintId}' ${axis} recipe '${recipe.id}' targets unknown ${axis} tier '${recipe.to}'`);
    }
    recipeIds.add(recipe.id);
    incoming.set(recipe.to, (incoming.get(recipe.to) ?? 0) + 1);
    outgoingCounts.set(recipe.from, (outgoingCounts.get(recipe.from) ?? 0) + 1);
  }
  for (const tier of tiers) {
    if ((incoming.get(tier.id) ?? 0) > 1 || (outgoingCounts.get(tier.id) ?? 0) > 1) {
      throw new Error(`Blueprint '${blueprintId}' ${axis} tier '${tier.id}' branches or merges`);
    }
  }

  const tiersById = new Map(tiers.map((tier) => [tier.id, tier] as const));

  if (recipes.length === 0) {
    if (tiers.length !== 1) {
      throw new Error(
        `Blueprint with no ${axis} recipes must declare exactly one terminal ${axis} tier; found ${tiers.length}`,
      );
    }
    return { stages: [], sourceTier: tiers[0], terminalTier: tiers[0] };
  }

  const outgoing = new Map(recipes.map((recipe) => [recipe.from, recipe]));
  const targets = new Set(recipes.map((recipe) => recipe.to));
  const source = tiers.find((tier) => outgoing.has(tier.id) && !targets.has(tier.id));
  if (!source) throw new Error(`Blueprint '${blueprintId}' ${axis} recipes have no source ${axis} tier`);

  const stages: ResolvedBlueprintStage<TTier, TRecipe>[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = source.id;
  while (cursor !== undefined && outgoing.has(cursor)) {
    if (visited.has(cursor)) throw new Error(`Blueprint '${blueprintId}' has a cycle at ${axis} tier '${cursor}'`);
    visited.add(cursor);
    const recipe: TRecipe = outgoing.get(cursor)!;
    stages.push({
      fromTier: tiersById.get(recipe.from)!,
      toTier: tiersById.get(recipe.to)!,
      recipe,
    });
    cursor = recipe.to;
  }

  if (stages.length !== recipes.length) {
    throw new Error(`Blueprint '${blueprintId}' ${axis} recipes do not form a single connected chain`);
  }
  return { stages, sourceTier: source, terminalTier: stages.at(-1)!.toTier };
}
