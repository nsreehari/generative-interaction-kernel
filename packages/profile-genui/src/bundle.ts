import { loadProfile, validateLoweringRecipeArtifact, validateProfileArtifact } from "../../../interaction/src/schema";
import type { LoweringRecipeArtifact, ProfileArtifact, ResolvedProfile } from "../../../interaction/src/profile";

export const PROFILE_BUNDLE_FORMAT = "gik-profile-bundle/1";

export interface ProfileArtifactBundle {
  format: typeof PROFILE_BUNDLE_FORMAT;
  profileArtifact: ProfileArtifact;
  recipeArtifacts: LoweringRecipeArtifact[];
}

export function createProfileBundle(
  profileArtifact: ProfileArtifact,
  recipeArtifacts: readonly LoweringRecipeArtifact[]
): ProfileArtifactBundle {
  return {
    format: PROFILE_BUNDLE_FORMAT,
    profileArtifact,
    recipeArtifacts: [...recipeArtifacts],
  };
}

export function validateProfileBundle(bundle: unknown): asserts bundle is ProfileArtifactBundle {
  if (!bundle || typeof bundle !== "object") {
    throw new Error("Invalid profile bundle: expected an object.");
  }

  const candidate = bundle as Partial<ProfileArtifactBundle>;
  if (candidate.format !== PROFILE_BUNDLE_FORMAT) {
    throw new Error(`Invalid profile bundle: expected format '${PROFILE_BUNDLE_FORMAT}'.`);
  }

  validateProfileArtifact(candidate.profileArtifact);

  if (!Array.isArray(candidate.recipeArtifacts)) {
    throw new Error("Invalid profile bundle: recipeArtifacts must be an array.");
  }

  for (const recipe of candidate.recipeArtifacts) {
    validateLoweringRecipeArtifact(recipe);
  }
}

export function loadProfileBundle(bundle: unknown): ResolvedProfile {
  validateProfileBundle(bundle);
  return loadProfile(bundle.profileArtifact, bundle.recipeArtifacts);
}

export function parseProfileBundleJson(text: string): ProfileArtifactBundle {
  const parsed = JSON.parse(text) as unknown;
  validateProfileBundle(parsed);
  return parsed;
}

export function stringifyProfileBundle(bundle: ProfileArtifactBundle): string {
  validateProfileBundle(bundle);
  return JSON.stringify(bundle, null, 2);
}
