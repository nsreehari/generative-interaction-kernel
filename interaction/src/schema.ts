// The Presentation DSL as a first-class, validatable artifact (the vision's "renderer-agnostic,
// validatable" intermediate representation). A planner's output is structurally checked here
// before it reaches the presentation compiler, so a buggy planner (deterministic or AI) is caught
// at this boundary rather than at render time.

import Ajv, { type ValidateFunction } from "ajv";
import type { PresentationSpec } from "./presentation";
import type { LoweringRecipeArtifact, ProfileArtifact, RecipeLintWarning } from "./profile";
import presentationSchemaJson from "../../schemas/presentation.schema.json" with { type: "json" };
import layerSchemaJson from "../../schemas/layer.schema.json" with { type: "json" };
import profileSchemaJson from "../../schemas/profile.schema.json" with { type: "json" };
import loweringRecipeSchemaJson from "../../schemas/lowering-recipe.schema.json" with { type: "json" };
import { lintLoweringRecipe as lintRecipeArtifact, resolveProfile, type ResolvedProfile } from "./profile";

/** The normative JSON Schema (draft-07) for the Presentation DSL. */
export const presentationSchema = presentationSchemaJson;
export const layerSchema = layerSchemaJson;
export const profileSchema = profileSchemaJson;
export const loweringRecipeSchema = loweringRecipeSchemaJson;

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(layerSchema, layerSchema.$id);
const validateFn: ValidateFunction = ajv.compile(presentationSchema);
const validateProfileFn: ValidateFunction = ajv.compile(profileSchema);
const validateLoweringRecipeFn: ValidateFunction = ajv.compile(loweringRecipeSchema);

export class PresentationValidationError extends Error {
  constructor(
    message: string,
    readonly errors: unknown
  ) {
    super(message);
    this.name = "PresentationValidationError";
  }
}

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

/** Structurally validate a Presentation DSL artifact; throws {@link PresentationValidationError}. */
export function validatePresentationSpec(spec: unknown): asserts spec is PresentationSpec {
  if (!validateFn(spec)) {
    const detail = (validateFn.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new PresentationValidationError(`Invalid Presentation DSL: ${detail}`, validateFn.errors);
  }
}

/** Non-throwing variant: returns true when the artifact is a structurally valid Presentation DSL. */
export function isValidPresentationSpec(spec: unknown): spec is PresentationSpec {
  return validateFn(spec) as boolean;
}

export function validateProfileArtifact(artifact: unknown): asserts artifact is ProfileArtifact {
  if (!validateProfileFn(artifact)) {
    const detail = (validateProfileFn.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new ProfileValidationError(`Invalid profile artifact: ${detail}`, validateProfileFn.errors);
  }
}

export function isValidProfileArtifact(artifact: unknown): artifact is ProfileArtifact {
  return validateProfileFn(artifact) as boolean;
}

export function validateLoweringRecipeArtifact(
  artifact: unknown
): asserts artifact is LoweringRecipeArtifact {
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

export function isValidLoweringRecipeArtifact(artifact: unknown): artifact is LoweringRecipeArtifact {
  return validateLoweringRecipeFn(artifact) as boolean;
}

export function lintLoweringRecipeArtifact(
  artifact: LoweringRecipeArtifact,
  ...args: Parameters<typeof lintRecipeArtifact>[1][]
): RecipeLintWarning[] {
  return lintRecipeArtifact(artifact, args[0]);
}

/**
 * Validate a profile artifact and its recipe artifacts, then resolve them into an execution chain.
 * This is the one-call authoring primitive: a profile author (in-package or in `samples/profiles/`)
 * imports the JSON artifacts and hands them here to get a ready-to-run {@link ResolvedProfile}.
 */
export function loadProfile(
  profileArtifact: unknown,
  recipeArtifacts: readonly unknown[]
): ResolvedProfile {
  validateProfileArtifact(profileArtifact);
  const recipes: LoweringRecipeArtifact[] = [];
  for (const recipe of recipeArtifacts) {
    validateLoweringRecipeArtifact(recipe);
    recipes.push(recipe);
  }
  return resolveProfile(profileArtifact, recipes);
}
