import {
  openBlueprint,
  type BlueprintRuntime,
} from "@gik/controlface/blueprint";
import type { BlueprintArtifact } from "@gik/blueprint";
import { applyHostConfig } from "./host-config";

const blueprintArtifacts = import.meta.glob("../blueprints/*/blueprint.json", {
  eager: true,
  import: "default",
}) as Record<string, BlueprintArtifact>;

const blueprints = new Map<string, BlueprintArtifact>();
for (const [path, artifact] of Object.entries(blueprintArtifacts)) {
  const id = path.match(/\/blueprints\/([^/]+)\//)?.[1];
  if (!id) continue;
  if (blueprints.has(id)) throw new Error(`Multiple declarative definitions found for Blueprint '${id}'`);
  blueprints.set(id, artifact);
}

export function hasSampleBlueprint(id: string): boolean {
  return blueprints.has(id);
}

export function resolveSampleBlueprintSource(id: string): BlueprintArtifact {
  const blueprint = blueprints.get(id);
  if (!blueprint) throw new Error(`Unknown Blueprint '${id}'`);
  return applyHostConfig(blueprint);
}

export function openSampleBlueprint(id: string): BlueprintRuntime {
  return openBlueprint(resolveSampleBlueprintSource(id));
}