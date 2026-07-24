import { validateBlueprintArtifact } from "./schema";
import type {
  LayerDefinition,
  ProfileArtifact,
  ProfileAuthoring,
  ProfileRuntime,
  ProfileTemplateResolver,
  RecipeBase,
  ResourceRef,
  ResolvedProfile,
  ResourceResolver,
} from "./profile-core";
import { applyProfileTemplate, resolveProfile } from "./profile-core";
import type { CellDefinition, CellPlacement } from "./cells";
import type { Json, ServiceDeclaration, ServiceRequirement } from "../../kernel/src/index";

export interface BlueprintProjections {
  presentation?: {
    roots: string[];
    placements?: CellPlacement[];
  };
  [projection: string]: unknown;
}

export interface BlueprintArtifact<TRecipe extends RecipeBase = RecipeBase> {
  gik: "0.1";
  type: "blueprint";
  payload: {
    id: string;
    kind: string;
    version: string;
    "blueprint-template"?: string;
    tiers: LayerDefinition[];
    recipes: TRecipe[];
    context?: Record<string, Json>;
    resources?: Record<string, ResourceRef>;
    services?: Record<string, ServiceRequirement | ServiceDeclaration>;
    cells?: Record<string, CellDefinition>;
    relationships?: Record<string, Json>;
    projections?: BlueprintProjections;
    runtime: ProfileRuntime;
    authoring?: ProfileAuthoring;
    metadata?: Record<string, Json>;
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
  const profile = {
    gik: "0.1",
    type: "profile",
    payload: {
      ...blueprint.payload,
      "profile-template": blueprint.payload["blueprint-template"],
      layers: blueprint.payload.tiers,
      recipes: blueprint.payload.recipes.map(({ id, from, to }) => ({ id, from, to })),
      resources: blueprint.payload.resources,
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

export interface BlueprintReferenceContext {
  parentBlueprintId: string;
  cellId: string;
}

export type BlueprintReferenceResolver<TRecipe extends RecipeBase = RecipeBase> = (
  ref: string,
  context: BlueprintReferenceContext,
) => BlueprintArtifact<TRecipe>;

/** Resolve every child Blueprint reference into one self-contained transport artifact. */
export function assembleBlueprint<TRecipe extends RecipeBase = RecipeBase>(
  source: BlueprintArtifact<TRecipe>,
  resolveReference?: BlueprintReferenceResolver<TRecipe>,
): BlueprintArtifact<TRecipe> {
  const active = new Set<string>();
  const assemble = (blueprint: BlueprintArtifact<TRecipe>): BlueprintArtifact<TRecipe> => {
    validateBlueprintArtifact<TRecipe>(blueprint);
    if (active.has(blueprint.payload.id)) {
      throw new Error(`Recursive Blueprint reference cycle at '${blueprint.payload.id}'`);
    }
    active.add(blueprint.payload.id);
    const assembled = structuredClone(blueprint);
    for (const [cellId, cell] of Object.entries(assembled.payload.cells ?? {})) {
      const child = cell.blueprint;
      if (!child) continue;
      if ("$ref" in child) {
        const ref = child.$ref;
        if (typeof ref !== "string") {
          throw new Error(`Blueprint Cell '${cellId}' has an invalid child Blueprint reference`);
        }
        if (!resolveReference) {
          throw new Error(`Blueprint Cell '${cellId}' has unresolved reference '${ref}'`);
        }
        cell.blueprint = {
          inline: assemble(resolveReference(ref, {
            parentBlueprintId: blueprint.payload.id,
            cellId,
          })),
        };
      } else {
        cell.blueprint = { inline: assemble(child.inline as BlueprintArtifact<TRecipe>) };
      }
    }
    active.delete(blueprint.payload.id);
    validateBlueprintArtifact<TRecipe>(assembled);
    return assembled;
  };
  return assemble(source);
}