import type { Json } from "@gik/kernel";
import type { EffectHandlerMap } from "@gik/react";

import { storageSeedValue, storageSeedValues, type StorageSeedCatalog } from "../../../../catalog/storage-seed";
import incidentAssetSeed from "../../../incident-analysis-assets/seed-data/catalog.json" with { type: "json" };

const seed = incidentAssetSeed as StorageSeedCatalog;
export const cachedSampleReports2 = storageSeedValues<{ id: string; label: string; content: string }>(seed, "source:")
  .map((source) => ({
    ...source,
    model: storageSeedValue<{ value: Json }>(seed, `seed-asset:${source.id}/incident-semantic/source-faithful-v1`)!.value,
  }));

function sample(id: unknown) {
  const value = cachedSampleReports2.find((candidate) => candidate.id === id);
  if (!value) throw new Error("Unknown cached incident report");
  return value;
}

function sampleState(value: typeof cachedSampleReports2[number]) {
  return {
    selectedSampleId: value.id,
    content: value.content,
    model: value.model as Json,
    analyzedContent: value.content,
    error: "",
  };
}

export function hydrateState(state: Record<string, unknown>): void {
  const incident = state.incident2;
  if (!incident || typeof incident !== "object" || Array.isArray(incident)) return;
  Object.assign(incident, sampleState(cachedSampleReports2[0]));
}

const handlers: EffectHandlerMap = {
  selectCachedSampleReport2: (context) => ({
    ops: Object.entries(sampleState(sample(context.payload.value)))
      .map(([key, value]) => context.set(`incident2.${key}`, value as Json)),
  }),
};

export default handlers;
