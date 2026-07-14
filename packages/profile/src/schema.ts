import layerSchemaJson from "../../../schemas/layer.schema.json" with { type: "json" };
import profileSchemaJson from "../../../schemas/profile.schema.json" with { type: "json" };
import loweringRecipeSchemaJson from "../../../schemas/lowering-recipe.schema.json" with { type: "json" };
import { runDeclarativeValidators } from "../../../shared/libs/validators";
import {
  applyProfileTemplate,
  resolveProfile,
  type AuthoringReport,
  type ProfileArtifact,
  type ProfileTemplateArtifact,
  type ProfileTemplateResolver,
  type RecipeArtifactBase,
  type RecipeBase,
  type ResolvedProfile,
  type ResourceResolver,
  type StructuralValidator,
} from "./profile-core";

export const layerSchema = layerSchemaJson;
export const profileSchema = profileSchemaJson;
export const loweringRecipeSchema = loweringRecipeSchemaJson;

export type StructuralSchemaValidatorRef = {
  schema: Record<string, unknown>;
  key?: string;
};

export type StructuralSchemaValidatorSpec = {
  schemaRef: string;
  schema: Record<string, unknown>;
  refs?: readonly StructuralSchemaValidatorRef[];
  message: string;
};

export type TemplateSchemaValidatorSpec = {
  file: string;
  refs?: readonly string[];
  message: string;
};

export type TemplateSchemaValidatorManifest = {
  schemas: readonly TemplateSchemaValidatorSpec[];
};

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

const emptyAuthoringReport = (): AuthoringReport => ({ ok: true, errors: [], warnings: [] });

export function structuralValidatorFromSpec(
  spec: StructuralSchemaValidatorSpec,
  warningCode = "validator-warning"
): StructuralValidator {
  return (args) => {
    const report = runDeclarativeValidators([
      {
        kind: "ajv-schema",
        schema: spec.schema,
        ...(spec.refs ? { refs: spec.refs } : {}),
        message: spec.message,
      },
    ], args.spec as never);
    if (report.ok) return emptyAuthoringReport();
    return {
      ok: report.ok,
      errors: report.errors,
      warnings: report.warnings.map((issue) => ({
        code: issue.code ?? warningCode,
        ...(issue.node ? { node: issue.node } : {}),
        detail: issue.detail,
      })),
    };
  };
}

export function buildStructuralValidators(
  specs: readonly StructuralSchemaValidatorSpec[],
  warningCode = "validator-warning"
): Record<string, StructuralValidator> {
  return Object.fromEntries(specs.map((spec) => [spec.schemaRef, structuralValidatorFromSpec(spec, warningCode)]));
}

export function schemaRefFromTemplateSchema(
  templateId: string,
  schema: Record<string, unknown>
): string {
  const rawId = schema.$id;
  if (typeof rawId !== "string" || rawId.length === 0) {
    throw new Error(`Template '${templateId}' schema is missing a string $id`);
  }

  const lastSlash = rawId.lastIndexOf("/");
  const fileName = lastSlash >= 0 ? rawId.slice(lastSlash + 1) : rawId;
  if (!fileName.endsWith(".schema.json")) {
    throw new Error(`Template '${templateId}' schema $id '${rawId}' does not end with '.schema.json'`);
  }

  return `${templateId}/${fileName}`;
}

const requiredTemplateFile = (template: ProfileTemplateArtifact, name: string): string => {
  const file = template.payload.files?.[name];
  if (typeof file !== "string" || file.length === 0) {
    throw new Error(`Template '${template.payload.id}' file '${name}' is missing`);
  }
  return file;
};

const templateResourceRef = (templateId: string, file: string): string => `profile-template:${templateId}/${file}`;

export function resolveTemplateSchemaValidatorSpecs(
  template: ProfileTemplateArtifact,
  resolveTemplateResource: ResourceResolver,
  knownRefs: Record<string, StructuralSchemaValidatorRef> = {}
): StructuralSchemaValidatorSpec[] {
  const manifestFile = requiredTemplateFile(template, "schemaValidators");
  const manifest = resolveTemplateResource(
    templateResourceRef(template.payload.id, manifestFile),
    "schemaValidators"
  ) as unknown as TemplateSchemaValidatorManifest;

  const entries = Array.isArray(manifest?.schemas) ? manifest.schemas : [];
  return entries.map((entry) => {
    if (!entry || typeof entry.file !== "string" || typeof entry.message !== "string") {
      throw new Error(`Template '${template.payload.id}' has invalid schema validator metadata`);
    }

    const schema = resolveTemplateResource(
      templateResourceRef(template.payload.id, entry.file),
      entry.file
    ) as unknown as Record<string, unknown>;

    const refs = Array.isArray(entry.refs)
      ? entry.refs.map((refName: string) => {
          const ref = knownRefs[refName];
          if (!ref) {
            throw new Error(`Template '${template.payload.id}' references unknown schema ref '${String(refName)}'`);
          }
          return ref;
        })
      : undefined;

    return {
      schemaRef: schemaRefFromTemplateSchema(template.payload.id, schema),
      schema,
      ...(refs ? { refs } : {}),
      message: entry.message,
    } satisfies StructuralSchemaValidatorSpec;
  });
}

export function buildStructuralValidatorsForTemplate(
  template: ProfileTemplateArtifact,
  resolveTemplateResource: ResourceResolver,
  knownRefs: Record<string, StructuralSchemaValidatorRef> = {},
  warningCode = "validator-warning"
): Record<string, StructuralValidator> {
  return buildStructuralValidators(
    resolveTemplateSchemaValidatorSpecs(template, resolveTemplateResource, knownRefs),
    warningCode
  );
}

export function buildStructuralValidatorsForTemplates(
  templateIds: readonly string[],
  resolveTemplate: ProfileTemplateResolver,
  resolveTemplateResource: ResourceResolver,
  knownRefs: Record<string, StructuralSchemaValidatorRef> = {},
  warningCode = "validator-warning"
): Record<string, StructuralValidator> {
  return Object.assign(
    {},
    ...templateIds.map((templateId) =>
      buildStructuralValidatorsForTemplate(
        resolveTemplate(templateId),
        resolveTemplateResource,
        knownRefs,
        warningCode
      )
    )
  );
}

export function buildStructuralValidatorsForProfile(
  profileArtifact: ProfileArtifact,
  resolveTemplate: ProfileTemplateResolver,
  resolveTemplateResource: ResourceResolver,
  knownRefs: Record<string, StructuralSchemaValidatorRef> = {},
  warningCode = "validator-warning"
): Record<string, StructuralValidator> {
  const templateId = profileArtifact.payload["profile-template"];
  if (typeof templateId !== "string" || templateId.length === 0) {
    return {};
  }
  return buildStructuralValidatorsForTemplate(
    resolveTemplate(templateId),
    resolveTemplateResource,
    knownRefs,
    warningCode
  );
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

export function validateProfileArtifact(artifact: unknown): asserts artifact is ProfileArtifact {
  const report = runDeclarativeValidators(profileArtifactValidators, artifact as never);
  if (report.ok) return;
  throw new ProfileValidationError(report.errors.map((issue) => issue.detail).join("; "), report.errors);
}

export function validateLoweringRecipeArtifact<TRecipe extends RecipeBase = RecipeBase>(
  artifact: unknown
): asserts artifact is RecipeArtifactBase<TRecipe> {
  const report = runDeclarativeValidators(loweringRecipeArtifactValidators, artifact as never);
  if (report.ok) return;
  throw new LoweringRecipeValidationError(report.errors.map((issue) => issue.detail).join("; "), report.errors);
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