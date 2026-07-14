import documentSchemaJson from "../../../schemas/document.schema.json" with { type: "json" };
import interactionSchemaJson from "../../../profile-templates/genui/schemas/interaction.schema.json" with { type: "json" };
import runtimeDocumentSchemaJson from "../../../profile-templates/genui/schemas/runtime-document.schema.json" with { type: "json" };
import presentationSchemaJson from "../../../profile-templates/genui/schemas/presentation.schema.json" with { type: "json" };
import workflowSchemaJson from "../../../profile-templates/genui/schemas/workflow.schema.json" with { type: "json" };
import { runDeclarativeValidators } from "../../../shared/libs/validators";
import { lintLoweringRecipe as lintRecipeArtifact, type LayerRecipeArtifact } from "./layer-recipes";
import {
  layerSchema,
  loadProfile,
  loweringRecipeSchema,
  profileSchema,
  validateLoweringRecipeArtifact,
  validateProfileArtifact,
} from "../../../packages/profile/src/schema";
import type { AuthoringReport, RecipeLintWarning, StructuralValidator } from "../../../packages/profile/src/profile-core";

export {
  documentSchemaJson as documentSchema,
  interactionSchemaJson as interactionSchema,
  layerSchema,
  loadProfile,
  loweringRecipeSchema,
  profileSchema,
  runtimeDocumentSchemaJson as runtimeDocumentSchema,
  validateLoweringRecipeArtifact,
  validateProfileArtifact,
  workflowSchemaJson as workflowSchema,
};

const emptyReport = (): AuthoringReport => ({ ok: true, errors: [], warnings: [] });

type SchemaValidatorSpec = {
  schema: Record<string, unknown>;
  refs?: readonly { schema: Record<string, unknown>; key?: string }[];
  message: string;
};

const documentSchemaRef = {
  schema: documentSchemaJson as Record<string, unknown>,
  key: typeof (documentSchemaJson as { $id?: unknown }).$id === "string"
    ? (documentSchemaJson as { $id: string }).$id
    : undefined,
};

const genuiSchemaValidatorSpecs: Record<string, SchemaValidatorSpec> = {
  "genui/workflow.schema.json": {
    schema: workflowSchemaJson as Record<string, unknown>,
    message: "Invalid workflow spec",
  },
  "genui/interaction.schema.json": {
    schema: interactionSchemaJson as Record<string, unknown>,
    message: "Invalid interaction spec",
  },
  "genui/presentation.schema.json": {
    schema: presentationSchemaJson as Record<string, unknown>,
    message: "Invalid Presentation DSL",
  },
  "genui/runtime-document.schema.json": {
    schema: runtimeDocumentSchemaJson as Record<string, unknown>,
    refs: [documentSchemaRef],
    message: "Invalid runtime document",
  },
};

const structuralValidatorForSchema = (schemaRef: string): StructuralValidator => {
  const spec = genuiSchemaValidatorSpecs[schemaRef];
  return (args: Record<string, import("../../../kernel/src/index").Json>) => {
    const errors = runDeclarativeValidators([
      {
        kind: "ajv-schema",
        schema: spec.schema,
        ...(spec.refs ? { refs: spec.refs } : {}),
        message: spec.message,
      },
    ], args.spec as never);
    if (errors.length === 0) return emptyReport();
    return { ok: false, errors: errors.map((detail) => ({ detail })), warnings: [] };
  };
};

export const genuiStructuralValidators: Record<string, StructuralValidator> = Object.fromEntries(
  Object.keys(genuiSchemaValidatorSpecs).map((schemaRef) => [schemaRef, structuralValidatorForSchema(schemaRef)])
);

export function lintLoweringRecipeArtifact(
  artifact: LayerRecipeArtifact,
  ...args: Parameters<typeof lintRecipeArtifact>[1][]
): RecipeLintWarning[] {
  return lintRecipeArtifact(artifact, args[0]);
}