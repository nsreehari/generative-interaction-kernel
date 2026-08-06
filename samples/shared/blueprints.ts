import {
  materializeBlueprint,
  parseBlueprintReference,
  type ExternalContext,
  type BlueprintArtifact,
} from "@gik/blueprint";
import {
  openBlueprint,
  type BlueprintRuntime,
} from "@gik/controlface/blueprint";
import type { BlueprintCatalogSnapshot } from "./blueprint-catalog";
import { applyHostConfig } from "./host-config";

export const sampleBlueprints: Record<string, BlueprintArtifact> = {};
let catalog: BlueprintCatalogSnapshot | undefined;

export function installSampleBlueprintCatalog(snapshot: BlueprintCatalogSnapshot): void {
  catalog = snapshot;
  for (const id of Object.keys(sampleBlueprints)) delete sampleBlueprints[id];
  Object.assign(sampleBlueprints, snapshot.entries);
}

export function getSampleBlueprintCatalog(): BlueprintCatalogSnapshot {
  if (!catalog) throw new Error("Sample Blueprint catalog has not been bootstrapped.");
  return catalog;
}

export function hasSampleBlueprint(id: string): boolean {
  return id in sampleBlueprints;
}

export function resolveSampleBlueprintSource(id: string): BlueprintArtifact {
  const blueprint = sampleBlueprints[id];
  if (!blueprint) throw new Error(`Unknown Blueprint '${id}'`);
  return applyHostConfig(blueprint);
}

export function openSampleBlueprint(
  id: string,
  externalContext?: ExternalContext,
): BlueprintRuntime {
  const materialized = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource(id),
    externalContext,
    resolveBlueprint(reference) {
      const parsed = parseBlueprintReference(reference);
      const child = resolveSampleBlueprintSource(parsed.id);
      if (parsed.version !== undefined && child.payload.version !== parsed.version) {
        throw new Error(`Blueprint '${parsed.id}' version '${parsed.version}' is unavailable`);
      }
      return child;
    },
  });
  return openBlueprint(materialized.payload.terminalBlueprint);
}

export function installUserBlueprints(blueprints: Record<string, BlueprintArtifact>): void {
  const current = getSampleBlueprintCatalog();
  installSampleBlueprintCatalog({
    ...current,
    entries: Object.freeze({ ...blueprints, ...current.seedEntries }),
  });
}