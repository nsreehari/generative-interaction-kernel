import type { EffectHandlerMap } from "@gik/react";
import type { Json } from "@gik/kernel";

import { storageSeedValues, type StorageSeedCatalog } from "../../../../catalog/storage-seed";
import incidentAssetSeed from "../../../incident-analysis-assets/seed-data/catalog.json" with { type: "json" };

export const sampleReports = storageSeedValues<{ id: string; label: string; content: string }>(
  incidentAssetSeed as StorageSeedCatalog,
  "source:",
);

const defaultSample = sampleReports[0];

export function findSampleReport(id: unknown) {
  return sampleReports.find((sample) => sample.id === id);
}

export function hydrateState(state: Record<string, unknown>): void {
  const incident = state.incident;
  if (!incident || typeof incident !== "object" || Array.isArray(incident)) return;
  Object.assign(incident, {
    selectedSampleId: defaultSample.id,
    content: defaultSample.content,
    formValue: { content: defaultSample.content },
  });
}

const handlers: EffectHandlerMap = {
  selectSampleReport: (ctx) => {
    const sample = findSampleReport(ctx.payload.value);
    if (!sample) throw new Error("Unknown sample incident report");
    return {
      ops: [
        ctx.set("incident.selectedSampleId", sample.id),
        ctx.set("incident.content", sample.content),
        ctx.set("incident.formValue", { content: sample.content } as Json),
        ctx.set("incident.error", ""),
      ],
    };
  },
  saveReport: (ctx) => {
    const values = ctx.payload.values;
    const content = values && typeof values === "object" && !Array.isArray(values)
      ? String(values.content ?? "").trim()
      : "";
    if (!content) throw new Error("Report content is required");
    return {
      ops: [
        ctx.set("incident.content", content),
        ctx.set("incident.formValue", { content } as Json),
        ctx.set("incident.error", ""),
      ],
    };
  },
  prepareAnalysis: (ctx) => ({
    ops: [
      ctx.set("incident.pendingContent", ctx.get("incident.content") ?? ""),
      ctx.set("incident.error", ""),
    ],
  }),
};

export default handlers;