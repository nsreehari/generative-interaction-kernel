import { validateBlueprintArtifact } from "./blueprint";
import type { BlueprintArtifact } from "./types";
import {
  resolveBlueprintExecution,
  type ResolvedBlueprint,
} from "./execution";
import type { LoweringRecipeDefinition } from "./types";

/** Resolve a self-contained Blueprint into its ordered lowering stages. */
export function loadBlueprint<TRecipe extends LoweringRecipeDefinition = LoweringRecipeDefinition>(
  value: unknown,
): ResolvedBlueprint<TRecipe> {
  validateBlueprintArtifact<TRecipe>(value);
  const blueprint: BlueprintArtifact<TRecipe> = value;
  return resolveBlueprintExecution(blueprint);
}