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
  const incident = state.incident1a;
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
        ctx.set("incident1a.selectedSampleId", sample.id),
        ctx.set("incident1a.content", sample.content),
        ctx.set("incident1a.formValue", { content: sample.content } as Json),
        ctx.set("incident1a.error", ""),
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
        ctx.set("incident1a.content", content),
        ctx.set("incident1a.formValue", { content } as Json),
        ctx.set("incident1a.error", ""),
      ],
    };
  },
  prepareRefinement: (ctx) => ({
    ops: [
      ctx.set("incident1a.pendingContent", ctx.get("externalContext.content") ?? ctx.get("incident1a.content") ?? ""),
      ctx.set("incident1a.error", ""),
    ],
  }),
};

export default handlers;
