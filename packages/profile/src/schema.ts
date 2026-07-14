import layerSchemaJson from "../../../schemas/layer.schema.json" with { type: "json" };
import profileSchemaJson from "../../../schemas/profile.schema.json" with { type: "json" };
import loweringRecipeSchemaJson from "../../../schemas/lowering-recipe.schema.json" with { type: "json" };
import { runDeclarativeValidators } from "../../../shared/libs/validators";
import {
  applyProfileTemplate,
  resolveProfile,
  type ProfileArtifact,
  type ProfileTemplateResolver,
  type RecipeArtifactBase,
  type RecipeBase,
  type ResolvedProfile,
  type ResourceResolver,
} from "./profile-core";

export const layerSchema = layerSchemaJson;
export const profileSchema = profileSchemaJson;
export const loweringRecipeSchema = loweringRecipeSchemaJson;

const sharedSchemaRefs = [{ schema: layerSchema, key: typeof layerSchema.$id === "string" ? layerSchema.$id : undefined }] as const;
const profileArtifactValidators = [{
  kind: "ajv-schema",
  schema: profileSchema,
  refs: sharedSchemaRefs,
  message: "Invalid profile artifact",
}] as const;
const loweringRecipeArtifactValidators = [{
  kind: "ajv-schema",
  schema: loweringRecipeSchema,
  refs: sharedSchemaRefs,
  message: "Invalid lowering recipe artifact",
}] as const;

export class ProfileValidationError extends Error {
  constructor(
    message: string,
    readonly errors: unknown
  ) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

export class LoweringRecipeValidationError extends Error {
  constructor(
    message: string,
    readonly errors: unknown
  ) {
    super(message);
    this.name = "LoweringRecipeValidationError";
  }
}

export function validateProfileArtifact(artifact: unknown): asserts artifact is ProfileArtifact {
  const errors = runDeclarativeValidators(profileArtifactValidators, artifact as never);
  if (errors.length === 0) return;
  throw new ProfileValidationError(errors.join("; "), errors);
}

export function validateLoweringRecipeArtifact<TRecipe extends RecipeBase = RecipeBase>(
  artifact: unknown
): asserts artifact is RecipeArtifactBase<TRecipe> {
  const errors = runDeclarativeValidators(loweringRecipeArtifactValidators, artifact as never);
  if (errors.length === 0) return;
  throw new LoweringRecipeValidationError(errors.join("; "), errors);
}

export function loadProfile<TRecipe extends RecipeBase = RecipeBase>(
  profileArtifact: unknown,
  recipeArtifacts: readonly unknown[],
  resolve?: ResourceResolver,
  resolveTemplate?: ProfileTemplateResolver
): ResolvedProfile<TRecipe> {
  validateProfileArtifact(profileArtifact);
  const recipes: RecipeArtifactBase<TRecipe>[] = [];
  for (const recipe of recipeArtifacts) {
    validateLoweringRecipeArtifact<TRecipe>(recipe);
    recipes.push(recipe);
  }
  return resolveProfile(
    applyProfileTemplate(profileArtifact as ProfileArtifact, resolveTemplate),
    recipes,
    resolve
  );
}