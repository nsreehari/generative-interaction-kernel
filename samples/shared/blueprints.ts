import {
  ControlFace,
  type BlueprintRuntime,
} from "@gik/controlface";
import type { Json } from "@gik/kernel";
import { createProfileBundle, type LayerRecipe, type ProfileArtifact, type ProfileArtifactBundle, type RecipeArtifactBase } from "@gik/profile";

const profileArtifacts = import.meta.glob("../profiles/*/profile.json", {
  eager: true,
  import: "default",
}) as Record<string, ProfileArtifact>;
const recipeArtifacts = import.meta.glob("../profiles/*/*.recipe.json", {
  eager: true,
  import: "default",
}) as Record<string, RecipeArtifactBase<LayerRecipe>>;

const recipesByProfileId = new Map<string, RecipeArtifactBase<LayerRecipe>[]>();
for (const [path, artifact] of Object.entries(recipeArtifacts)) {
  const id = path.match(/\/profiles\/([^/]+)\//)?.[1];
  if (!id) continue;
  recipesByProfileId.set(id, [...(recipesByProfileId.get(id) ?? []), artifact]);
}
const blueprints = new Map<string, ProfileArtifact | ProfileArtifactBundle<LayerRecipe>>();
for (const [path, artifact] of Object.entries(profileArtifacts)) {
  const id = path.match(/\/profiles\/([^/]+)\//)?.[1];
  if (!id) continue;
  const recipes = recipesByProfileId.get(id) ?? [];
  blueprints.set(
    id,
    artifact.payload.recipes.length > 0
      ? createProfileBundle(artifact, recipes) as ProfileArtifactBundle<LayerRecipe>
      : artifact,
  );
}

export function hasSampleBlueprint(id: string): boolean {
  return blueprints.has(id);
}

export function resolveSampleBlueprintSource(id: string): ProfileArtifact | ProfileArtifactBundle<LayerRecipe> {
  const blueprint = blueprints.get(id);
  if (!blueprint) throw new Error(`Unknown Blueprint '${id}'`);
  return blueprint;
}

export function openSampleBlueprint(id: string): BlueprintRuntime {
  return ControlFace.openBlueprint(resolveSampleBlueprintSource(id));
}