import { describe, expect, it } from "vitest";
import { materializeBlueprint, type BlueprintArtifact } from "@gik/blueprint";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { Json } from "@gik/kernel";

import handlers, {
  cachedSampleReports2,
  hydrateState,
} from "../blueprints/cached-incident-report-explorer-2/native/effect_handlers/cachedIncidentReportExplorer2EffectHandlers";
import { resolveSampleBlueprintSource } from "../shared/blueprints";

const cachedBlueprint = resolveSampleBlueprintSource("cached-incident-report-explorer-2") as BlueprintArtifact;
const liveBlueprint = resolveSampleBlueprintSource("incident-report-explorer-2") as BlueprintArtifact;
const set = (path: string, value: unknown) => ({ op: "set", path, value });

describe("cached incident-report-explorer-2", () => {
  it.each(["operational", "brief"])("materializes the offline read-only %s representation", (attention) => {
    expect(cachedBlueprint.payload.services).toEqual({});
    expect(cachedBlueprint.payload.cells).not.toHaveProperty("foundry-access-gate");
    expect(cachedBlueprint.payload.cells).not.toHaveProperty("incident-source-form");
    const representations = cachedBlueprint.payload.recipes[0]?.representations ?? [];
    const operationalSource = representations.find(({ id }) => id === "operational")
      ?.views["incident-source"];
    const report = representations.find(({ id }) => id === attention)
      ?.views["incident-semantic-analyzer"];
    expect(operationalSource?.props).toMatchObject({ readonly: true });
    expect(report?.props).toMatchObject({ readonly: true });

    const terminal = materializeBlueprint({
      blueprint: cachedBlueprint,
      externalContext: { attention },
    }).payload.terminalBlueprint;
    const placements = terminal.payload.projections?.presentation?.placements ?? [];
    expect(placements).toEqual(expect.arrayContaining([
      expect.objectContaining({ cell: "incident-semantic-analyzer", parent: "incident-workspace" }),
    ]));
  });

  it("validates every reused fixture against the live v2 semantic contract", () => {
    const validators = liveBlueprint.payload.services?.["incident-semantic-analysis"]
      ?.operations.analyzeReport.response.validators;
    expect(cachedSampleReports2).toHaveLength(5);

    for (const sample of cachedSampleReports2) {
      const report = runDeclarativeValidators(validators, sample.model as Json);
      expect(report.errors, sample.id).toEqual([]);
    }
  });

  it("hydrates and switches complete cached source/model pairs", async () => {
    const state = { incident2: {} };
    hydrateState(state);
    expect(state.incident2).toMatchObject({
      selectedSampleId: "password-spray-mailbox",
      content: cachedSampleReports2[0].content,
      model: cachedSampleReports2[0].model,
      analyzedContent: cachedSampleReports2[0].content,
    });

    const target = cachedSampleReports2.find(({ id }) => id === "device-code-bec");
    const result = await handlers.selectCachedSampleReport2({
      payload: { value: "device-code-bec" },
      set,
    } as never);
    expect(result.ops).toEqual(expect.arrayContaining([
      set("incident2.selectedSampleId", "device-code-bec"),
      set("incident2.content", target?.content),
      set("incident2.model", target?.model),
      set("incident2.analyzedContent", target?.content),
    ]));
  });
});
