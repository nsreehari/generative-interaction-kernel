import { validateBlueprintArtifact } from "./blueprint";
import type { BlueprintArtifact } from "./types";
import {
  resolveBlueprintExecution,
  type ResolvedBlueprint,
  type ResourceResolver,
} from "./execution";
import type { LoweringRecipeDefinition } from "./types";

/** Resolve a self-contained Blueprint into its ordered lowering stages and concrete resources. */
export function loadBlueprint<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition>(
  value: unknown,
  resolveResource?: ResourceResolver,
): ResolvedBlueprint<TRecipe> {
  validateBlueprintArtifact<TRecipe>(value);
  const blueprint: BlueprintArtifact<TRecipe> = value;
  return resolveBlueprintExecution(blueprint, resolveResource);
}