import presentationSchemaJson from "../../../profile-templates/genui/schemas/presentation.schema.json" with { type: "json" };
import { runDeclarativeValidators } from "../../../shared/libs/validators";
import type { PresentationSpec } from "./view-planner";
import { lintLoweringRecipe as lintRecipeArtifact, type LayerRecipeArtifact } from "./layer-recipes";
import {
  layerSchema,
  loadProfile,
  loweringRecipeSchema,
  profileSchema,
  validateLoweringRecipeArtifact,
  validateProfileArtifact,
} from "../../../packages/profile/src/schema";
import type { RecipeLintWarning } from "../../../packages/profile/src/profile-core";

export {
  layerSchema,
  loadProfile,
  loweringRecipeSchema,
  profileSchema,
  validateLoweringRecipeArtifact,
  validateProfileArtifact,
};

export const presentationSchema = presentationSchemaJson;
const presentationSpecValidators = [{
  kind: "ajv-schema",
  schema: presentationSchema,
  refs: [{ schema: layerSchema, key: typeof layerSchema.$id === "string" ? layerSchema.$id : undefined }],
  message: "Invalid Presentation DSL",
}] as const;

export class PresentationValidationError extends Error {
  constructor(
    message: string,
    readonly errors: unknown
  ) {
    super(message);
    this.name = "PresentationValidationError";
  }
}

export function validatePresentationSpec(spec: unknown): asserts spec is PresentationSpec {
  const errors = runDeclarativeValidators(presentationSpecValidators, spec as never);
  if (errors.length === 0) return;
  throw new PresentationValidationError(errors.join("; "), errors);
}

export function lintLoweringRecipeArtifact(
  artifact: LayerRecipeArtifact,
  ...args: Parameters<typeof lintRecipeArtifact>[1][]
): RecipeLintWarning[] {
  return lintRecipeArtifact(artifact, args[0]);
}