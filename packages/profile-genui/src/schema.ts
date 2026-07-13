// The Presentation DSL as a first-class, validatable artifact (the vision's "renderer-agnostic,
// validatable" intermediate representation). A planner's output is structurally checked here
// before it reaches the presentation compiler, so a buggy planner (deterministic or AI) is caught
// at this boundary rather than at render time.

import Ajv, { type ValidateFunction } from "ajv";
import type { PresentationSpec } from "./presentation";
import type { LoweringRecipeArtifact, RecipeLintWarning } from "./profile";
import presentationSchemaJson from "../../../schemas/presentation.schema.json" with { type: "json" };
import { lintLoweringRecipe as lintRecipeArtifact, resolveProfile, type ResolvedProfile } from "./profile";
import {
  layerSchema,
  loadProfile,
  loweringRecipeSchema,
  profileSchema,
  validateLoweringRecipeArtifact,
  validateProfileArtifact,
} from "../../profile/src/schema";
export {
  layerSchema,
  loadProfile,
  loweringRecipeSchema,
  profileSchema,
  validateLoweringRecipeArtifact,
  validateProfileArtifact,
};

/** The normative JSON Schema (draft-07) for the Presentation DSL. */
export const presentationSchema = presentationSchemaJson;

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(layerSchema, layerSchema.$id);
const validateFn: ValidateFunction = ajv.compile(presentationSchema);

export class PresentationValidationError extends Error {
  constructor(
    message: string,
    readonly errors: unknown
  ) {
    super(message);
    this.name = "PresentationValidationError";
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

export function lintLoweringRecipeArtifact(
  artifact: LoweringRecipeArtifact,
  ...args: Parameters<typeof lintRecipeArtifact>[1][]
): RecipeLintWarning[] {
  return lintRecipeArtifact(artifact, args[0]);
}
