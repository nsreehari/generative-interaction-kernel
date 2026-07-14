import { loadProfile, validateLoweringRecipeArtifact, validateProfileArtifact } from "./schema";
import type {
  ProfileArtifact,
  ProfileTemplateResolver,
  RecipeArtifactBase,
  RecipeBase,
  ResolvedProfile,
  ResourceResolver,
} from "./profile-core";

export const PROFILE_BUNDLE_FORMAT = "gik-profile-bundle/1";

export interface ProfileArtifactBundle<TRecipe extends RecipeBase = RecipeBase> {
  format: typeof PROFILE_BUNDLE_FORMAT;
  profileArtifact: ProfileArtifact;
  recipeArtifacts: RecipeArtifactBase<TRecipe>[];
}

export function createProfileBundle<TRecipe extends RecipeBase = RecipeBase>(
  profileArtifact: ProfileArtifact,
  recipeArtifacts: readonly RecipeArtifactBase<TRecipe>[]
): ProfileArtifactBundle<TRecipe> {
  return {
    format: PROFILE_BUNDLE_FORMAT,
    profileArtifact,
    recipeArtifacts: [...recipeArtifacts],
  };
}

export function validateProfileBundle<TRecipe extends RecipeBase = RecipeBase>(
  bundle: unknown
): asserts bundle is ProfileArtifactBundle<TRecipe> {
  if (!bundle || typeof bundle !== "object") {
    throw new Error("Invalid profile bundle: expected an object.");
  }

  const candidate = bundle as Partial<ProfileArtifactBundle<TRecipe>>;
  if (candidate.format !== PROFILE_BUNDLE_FORMAT) {
    throw new Error(`Invalid profile bundle: expected format '${PROFILE_BUNDLE_FORMAT}'.`);
  }

  validateProfileArtifact(candidate.profileArtifact);

  if (!Array.isArray(candidate.recipeArtifacts)) {
    throw new Error("Invalid profile bundle: recipeArtifacts must be an array.");
  }

  for (const recipe of candidate.recipeArtifacts) {
    validateLoweringRecipeArtifact<TRecipe>(recipe);
  }
}

export function loadProfileBundle<TRecipe extends RecipeBase = RecipeBase>(
  bundle: unknown,
  resolve?: ResourceResolver,
  resolveTemplate?: ProfileTemplateResolver
): ResolvedProfile<TRecipe> {
  validateProfileBundle<TRecipe>(bundle);
  return loadProfile<TRecipe>(bundle.profileArtifact, bundle.recipeArtifacts, resolve, resolveTemplate);
}

export function parseProfileBundleJson<TRecipe extends RecipeBase = RecipeBase>(
  text: string
): ProfileArtifactBundle<TRecipe> {
  const parsed = JSON.parse(text) as unknown;
  validateProfileBundle<TRecipe>(parsed);
  return parsed;
}

export function stringifyProfileBundle<TRecipe extends RecipeBase = RecipeBase>(
  bundle: ProfileArtifactBundle<TRecipe>
): string {
  validateProfileBundle<TRecipe>(bundle);
  return JSON.stringify(bundle, null, 2);
}