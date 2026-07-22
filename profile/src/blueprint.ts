import { validateBlueprintArtifact } from "./schema";
import type {
  LayerDefinition,
  Profile,
  ProfileArtifact,
  ProfileTemplateResolver,
  RecipeBase,
  ResolvedProfile,
  ResourceResolver,
} from "./profile-core";
import { applyProfileTemplate, resolveProfile } from "./profile-core";
import type { CellDefinition } from "./cells";

export interface BlueprintArtifact<TRecipe extends RecipeBase = RecipeBase> {
  gik: "0.1";
  type: "blueprint";
  payload: Omit<Profile, "profile-template" | "layers" | "recipes" | "runtime"> & {
    "blueprint-template"?: string;
    tiers: LayerDefinition[];
    recipes: TRecipe[];
    organism?: {
      root?: CellDefinition;
      cells?: CellDefinition[];
    };
    runtime: NonNullable<Profile["runtime"]>;
  };
}

export function createBlueprint<TRecipe extends RecipeBase = RecipeBase>(
  payload: BlueprintArtifact<TRecipe>["payload"],
): BlueprintArtifact<TRecipe> {
  const blueprint: BlueprintArtifact<TRecipe> = {
    gik: "0.1",
    type: "blueprint",
    payload: structuredClone(payload),
  };
  validateBlueprintArtifact<TRecipe>(blueprint);
  return blueprint;
}

export function loadBlueprint<TRecipe extends RecipeBase = RecipeBase>(
  value: unknown,
  resolve?: ResourceResolver,
  resolveTemplate?: ProfileTemplateResolver,
): ResolvedProfile<TRecipe> {
  validateBlueprintArtifact<TRecipe>(value);
  const blueprint = value;
  const organismResources = blueprint.payload.organism
    ? blueprint.payload.organism.root
      ? blueprint.payload.organism.cells
        ? {
            organismRoot: { inline: blueprint.payload.organism.root },
            cells: { inline: blueprint.payload.organism.cells },
          }
        : { document: { inline: { root: blueprint.payload.organism.root } } }
      : { cells: { inline: blueprint.payload.organism.cells ?? [] } }
    : {};
  const profile = {
    gik: "0.1",
    type: "profile",
    payload: {
      ...blueprint.payload,
      "profile-template": blueprint.payload["blueprint-template"],
      layers: blueprint.payload.tiers,
      recipes: blueprint.payload.recipes.map(({ id, from, to }) => ({ id, from, to })),
      resources: {
        ...blueprint.payload.resources,
        ...organismResources,
      },
    },
  } as const;
  return resolveProfile(
    applyProfileTemplate(profile as unknown as ProfileArtifact, resolveTemplate),
    blueprint.payload.recipes.map((payload) => ({ gik: "0.1", type: "lowering-recipe", payload })),
    resolve,
  );
}

export function parseBlueprintJson<TRecipe extends RecipeBase = RecipeBase>(
  text: string,
): BlueprintArtifact<TRecipe> {
  const blueprint: unknown = JSON.parse(text);
  validateBlueprintArtifact<TRecipe>(blueprint);
  return blueprint;
}

export function stringifyBlueprint<TRecipe extends RecipeBase = RecipeBase>(
  blueprint: BlueprintArtifact<TRecipe>,
): string {
  validateBlueprintArtifact<TRecipe>(blueprint);
  return JSON.stringify(blueprint, null, 2);
}