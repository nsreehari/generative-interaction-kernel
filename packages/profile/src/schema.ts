import Ajv, { type ValidateFunction } from "ajv";

import layerSchemaJson from "../../../schemas/layer.schema.json" with { type: "json" };
import profileSchemaJson from "../../../schemas/profile.schema.json" with { type: "json" };
import loweringRecipeSchemaJson from "../../../schemas/lowering-recipe.schema.json" with { type: "json" };
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

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(layerSchema, layerSchema.$id);
const validateProfileFn: ValidateFunction = ajv.compile(profileSchema);
const validateLoweringRecipeFn: ValidateFunction = ajv.compile(loweringRecipeSchema);

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
  if (!validateProfileFn(artifact)) {
    const detail = (validateProfileFn.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new ProfileValidationError(`Invalid profile artifact: ${detail}`, validateProfileFn.errors);
  }
}

export function validateLoweringRecipeArtifact<TRecipe extends RecipeBase = RecipeBase>(
  artifact: unknown
): asserts artifact is RecipeArtifactBase<TRecipe> {
  if (!validateLoweringRecipeFn(artifact)) {
    const detail = (validateLoweringRecipeFn.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new LoweringRecipeValidationError(
      `Invalid lowering recipe artifact: ${detail}`,
      validateLoweringRecipeFn.errors
    );
  }
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