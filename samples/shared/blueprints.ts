import {
  openBlueprint,
  type BlueprintRuntime,
} from "@gik/controlface/blueprint";
import type { Json } from "@gik/kernel";
import type { BlueprintArtifact, LayerRecipe } from "@gik/profile";
import { applyHostConfig } from "./host-config";

const blueprintArtifacts = import.meta.glob(["../profiles/*/blueprint.json", "../profiles/*/profile.json"], {
  eager: true,
  import: "default",
}) as Record<string, BlueprintArtifact<LayerRecipe>>;

const blueprints = new Map<string, BlueprintArtifact<LayerRecipe>>();
for (const [path, artifact] of Object.entries(blueprintArtifacts)) {
  const id = path.match(/\/profiles\/([^/]+)\//)?.[1];
  if (!id) continue;
  if (blueprints.has(id)) throw new Error(`Multiple declarative definitions found for Blueprint '${id}'`);
  blueprints.set(id, artifact);
}

export function hasSampleBlueprint(id: string): boolean {
  return blueprints.has(id);
}

export function resolveSampleBlueprintSource(id: string): BlueprintArtifact<LayerRecipe> {
  const blueprint = blueprints.get(id);
  if (!blueprint) throw new Error(`Unknown Blueprint '${id}'`);
  return applyHostConfig(blueprint);
}

export function openSampleBlueprint(id: string): BlueprintRuntime {
  return openBlueprint(resolveSampleBlueprintSource(id));
}