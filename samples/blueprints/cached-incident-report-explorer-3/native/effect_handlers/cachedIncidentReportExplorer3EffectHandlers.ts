import type { Json } from "@gik/kernel";
import type { EffectHandlerMap } from "@gik/react";

import { storageSeedValue, storageSeedValues, type StorageSeedCatalog } from "../../../../catalog/storage-seed";
import incidentAssetSeed from "../../../incident-analysis-assets/seed-data/catalog.json" with { type: "json" };

const seed = incidentAssetSeed as StorageSeedCatalog;
export const cachedSampleReports = storageSeedValues<{ id: string; label: string; content: string }>(seed, "source:")
  .map((source) => ({
    ...source,
    model: storageSeedValue<{ value: Json }>(seed, `seed-asset:${source.id}/incident-semantic/source-faithful-v1`)!.value,
  }));

function cachedSample(id: unknown) {
  const sample = cachedSampleReports.find((candidate) => candidate.id === id);
  if (!sample) throw new Error("Unknown cached incident report");
  return sample;
}

function sampleState(sample: typeof cachedSampleReports[number]) {
  return {
    selectedSampleId: sample.id,
    content: sample.content,
    model: sample.model as Json,
    analyzedContent: sample.content,
    fullscreen: false,
    analysisPending: false,
    error: "",
  };
}

export function hydrateState(state: Record<string, unknown>): void {
  const incident = state.incident3;
  if (!incident || typeof incident !== "object" || Array.isArray(incident)) return;
  Object.assign(incident, sampleState(cachedSampleReports[0]));
}

const handlers: EffectHandlerMap = {
  selectCachedSampleReport: (context) => {
    const sample = cachedSample(context.payload.value);
    const value = sampleState(sample);
    return {
      ops: Object.entries(value).map(([key, entry]) => context.set(`incident3.${key}`, entry as Json)),
    };
  },
};

export default handlers;
