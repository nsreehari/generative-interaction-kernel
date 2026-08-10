import { describe, expect, it } from "vitest";
import { materializeBlueprint, type BlueprintArtifact } from "@gik/blueprint";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { Json } from "@gik/kernel";

import handlers, {
  cachedSampleReports,
  hydrateState,
} from "../blueprints/cached-incident-report-explorer/native/effect_handlers/cachedIncidentReportExplorerEffectHandlers";
import { resolveSampleBlueprintSource } from "../shared/blueprint-catalog";

const cachedBlueprint = resolveSampleBlueprintSource("cached-incident-report-explorer") as BlueprintArtifact;
const liveBlueprint = resolveSampleBlueprintSource("incident-report-explorer") as BlueprintArtifact;
const set = (path: string, value: unknown) => ({ op: "set", path, value });

describe("cached incident-report-explorer", () => {
  it("materializes as an offline read-only Blueprint", () => {
    expect(cachedBlueprint.payload.services).toEqual({});
    expect(cachedBlueprint.payload.cells).not.toHaveProperty("foundry-access-gate");
    expect(cachedBlueprint.payload.cells).not.toHaveProperty("incident-report-form");
    expect(cachedBlueprint.payload.cells["incident-report"]?.view?.props).toMatchObject({ readonly: true });
    expect(cachedBlueprint.payload.cells["incident-intelligence"]?.view?.props).toMatchObject({ readonly: true });

    const terminal = materializeBlueprint({ blueprint: cachedBlueprint }).payload.terminalBlueprint;
    expect(terminal.payload.projections?.presentation?.placements).toEqual(expect.arrayContaining([
      expect.objectContaining({ cell: "incident-intelligence", parent: "incident-workspace" }),
    ]));
  });

  it("validates every fixture and projection reference against the live v1 contract", () => {
    const validators = liveBlueprint.payload.services?.["incident-report-intelligence"]
      ?.operations.analyzeReport.response.validators;
    expect(cachedSampleReports).toHaveLength(5);

    for (const sample of cachedSampleReports) {
      const model = sample.model as unknown as {
        items: Array<{ id: string }>;
        projectionCandidates: Array<{ sections: Array<{ contentIds: string[] }> }>;
      };
      const report = runDeclarativeValidators(validators, model as unknown as Json);
      expect(report.errors, sample.id).toEqual([]);
      const itemIds = new Set(model.items.map(({ id }) => id));
      for (const candidate of model.projectionCandidates) {
        for (const section of candidate.sections) {
          for (const id of section.contentIds) expect(itemIds.has(id), `${sample.id}: ${id}`).toBe(true);
        }
      }
    }
  });

  it("hydrates and switches complete cached source/intelligence pairs", async () => {
    const state = { incident: {} };
    hydrateState(state);
    expect(state.incident).toMatchObject({
      selectedSampleId: "password-spray-mailbox",
      content: cachedSampleReports[0].content,
      intelligence: cachedSampleReports[0].model,
      analyzedContent: cachedSampleReports[0].content,
    });

    const target = cachedSampleReports.find(({ id }) => id === "device-code-bec");
    const result = await handlers.selectCachedSampleReport({
      payload: { value: "device-code-bec" },
      set,
    } as never);
    expect(result.ops).toEqual(expect.arrayContaining([
      set("incident.selectedSampleId", "device-code-bec"),
      set("incident.content", target?.content),
      set("incident.intelligence", target?.model),
      set("incident.analyzedContent", target?.content),
    ]));
  });
});
