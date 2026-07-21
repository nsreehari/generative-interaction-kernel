import {
  ControlFace,
  defineDeclarativeBlueprint,
  type BlueprintDefinition,
  type BlueprintRuntime,
} from "@gik/controlface";
import type { DocumentPayload, Json } from "@gik/kernel";
import {
  loadProfile,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
  runProfile,
  type LayerRecipe,
  type ProfileArtifact,
  type RecipeArtifactBase,
  type ResolvedProfile,
} from "@gik/profile";

const profileArtifacts = import.meta.glob("../profiles/*/profile.json", {
  eager: true,
  import: "default",
}) as Record<string, ProfileArtifact>;
const recipeArtifacts = import.meta.glob("../profiles/*/*.recipe.json", {
  eager: true,
  import: "default",
}) as Record<string, RecipeArtifactBase<LayerRecipe>>;

type JsonRecord = Record<string, Json>;
type PresentationPreset = {
  id?: string;
  actor?: string;
  role?: string;
  device?: string;
  task?: string;
  disclosure?: string;
  layout?: string;
  frame?: string;
  arrangement?: string;
  regions?: Json[];
};

const recipesByProfileId = new Map<string, RecipeArtifactBase<LayerRecipe>[]>();
for (const [path, artifact] of Object.entries(recipeArtifacts)) {
  const id = path.match(/\/profiles\/([^/]+)\//)?.[1];
  if (!id) continue;
  recipesByProfileId.set(id, [...(recipesByProfileId.get(id) ?? []), artifact]);
}

function jsonRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function defaultsFromSchema(schema: unknown): JsonRecord {
  const input = jsonRecord(schema);
  const properties = jsonRecord(input?.properties);
  if (!properties) return {};
  const defaults: JsonRecord = {};
  for (const [key, declaration] of Object.entries(properties)) {
    const field = jsonRecord(declaration);
    if (field && Object.hasOwn(field, "default")) {
      defaults[key] = structuredClone(field.default as Json);
    }
  }
  return defaults;
}

function normalizePresentationPreset(preset: PresentationPreset | undefined): JsonRecord {
  if (!preset) return {};
  const context: JsonRecord = {};
  for (const key of ["id", "actor", "role", "device", "task", "disclosure", "layout", "frame", "arrangement"] as const) {
    const value = preset[key];
    if (typeof value === "string") context[key] = value;
  }
  if (Array.isArray(preset.regions)) context.regions = structuredClone(preset.regions);
  return context;
}

function presentationPresetContexts(profile: ResolvedProfile<LayerRecipe>): PresentationPreset[] {
  const presets = profile.resources.presentationPresets;
  return Array.isArray(presets) ? presets as PresentationPreset[] : [];
}

function defaultContextFor(profile: ResolvedProfile<LayerRecipe>): JsonRecord {
  const presets = presentationPresetContexts(profile);
  const preferred = presets.find((preset) => preset.id === "full-substrate") ?? presets[0];
  return normalizePresentationPreset(preferred);
}

function resolveContextFor(profile: ResolvedProfile<LayerRecipe>, context: Record<string, Json>): JsonRecord {
  const requested = context.presentationContext;
  if (requested && typeof requested === "object" && !Array.isArray(requested)) {
    return structuredClone(requested as JsonRecord);
  }
  if (typeof requested === "string") {
    return normalizePresentationPreset(
      presentationPresetContexts(profile).find((preset) => preset.id === requested)
    );
  }
  return defaultContextFor(profile);
}

function defineRecipeBackedBlueprint(
  artifact: ProfileArtifact,
  profileId: string,
): BlueprintDefinition {
  const profile = loadProfile<LayerRecipe>(
    artifact,
    recipesByProfileId.get(profileId) ?? [],
    resolveProfileTemplateResource,
    resolveProfileTemplate,
  );
  const defaultSeed = defaultsFromSchema(profile.artifact.payload.layers[0]?.input);
  return {
    profile,
    lower: (context) => runProfile(
      profile,
      structuredClone(defaultSeed),
      resolveContextFor(profile, context),
    ) as DocumentPayload,
  };
}

const definitions = new Map<string, BlueprintDefinition>();
for (const [path, artifact] of Object.entries(profileArtifacts)) {
  const id = path.match(/\/profiles\/([^/]+)\//)?.[1];
  if (!id) continue;
  const definition = defineDeclarativeBlueprint(artifact);
  definitions.set(id, definition ?? defineRecipeBackedBlueprint(artifact, id));
}

const resolver = { resolve: (id: string) => definitions.get(id) };

export function hasSampleBlueprint(id: string): boolean {
  return definitions.has(id);
}

export function openSampleBlueprint(id: string): BlueprintRuntime {
  return ControlFace.openBlueprint(resolver, { blueprintId: id });
}