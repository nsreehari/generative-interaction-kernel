import { describe, expect, it } from "vitest";
import { materializeBlueprint, type BlueprintArtifact } from "@gik/blueprint";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { Json } from "@gik/kernel";

import cachedBlueprintJson from "../blueprints/cached-incident-report-explorer-3/blueprint.json" with { type: "json" };
import handlers, {
  cachedSampleReports,
  hydrateState,
} from "../blueprints/cached-incident-report-explorer-3/native/effect_handlers/cachedIncidentReportExplorer3EffectHandlers";
import liveBlueprintJson from "../blueprints/incident-report-explorer-3/blueprint.json" with { type: "json" };

const cachedBlueprint = cachedBlueprintJson as unknown as BlueprintArtifact;
const liveBlueprint = liveBlueprintJson as unknown as BlueprintArtifact;
const set = (path: string, value: unknown) => ({ op: "set", path, value });

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function assertKnownReferences(model: Record<string, unknown>): void {
  const ids = (key: string) => new Set(records(model[key]).map((entry) => String(entry.id)));
  const entities = ids("entities");
  const phases = ids("phases");
  const events = ids("events");
  const evidence = ids("evidence");
  const check = (values: unknown, known: Set<string>, label: string) => {
    for (const value of Array.isArray(values) ? values : []) {
      expect(known.has(String(value)), `${label} references '${String(value)}'`).toBe(true);
    }
  };

  for (const relationship of records(model.relationships)) {
    check([relationship.sourceId, relationship.targetId], entities, "relationship entity");
    if (relationship.phaseId) check([relationship.phaseId], phases, "relationship phase");
    check(relationship.evidenceIds, evidence, "relationship evidence");
  }
  for (const event of records(model.events)) {
    if (event.phaseId) check([event.phaseId], phases, "event phase");
    check(event.entityIds, entities, "event entity");
    check(event.evidenceIds, evidence, "event evidence");
  }
  for (const technique of records(model.techniques)) {
    if (technique.phaseId) check([technique.phaseId], phases, "technique phase");
    check(technique.evidenceIds, evidence, "technique evidence");
  }
  for (const alert of records(model.alerts)) {
    check(alert.eventIds, events, "alert event");
    check(alert.evidenceIds, evidence, "alert evidence");
  }
  for (const entry of [...records(model.impacts), ...records(model.actions)]) {
    check(entry.entityIds, entities, "impact/action entity");
  }
}

describe("cached incident-report-explorer-3", () => {
  it("is an offline read-only Blueprint with the two authored flights", () => {
    expect(cachedBlueprint.payload.services).toEqual({});
    expect(cachedBlueprint.payload.cells).not.toHaveProperty("foundry-access-gate");
    expect(cachedBlueprint.payload.cells).not.toHaveProperty("incident-analyze-report");
    expect(cachedBlueprint.payload.cells).not.toHaveProperty("incident-edit-report");
    expect(cachedBlueprint.payload.cells).not.toHaveProperty("incident-source-form");

    const terminal = materializeBlueprint({
      blueprint: cachedBlueprint,
      externalContext: { attention: "operational" },
    }).payload.terminalBlueprint;
    const placements = terminal.payload.projections?.presentation?.placements ?? [];
    expect(placements).toEqual(expect.arrayContaining([
      expect.objectContaining({ cell: "incident-semantic-analyzer", parent: "incident-workspace" }),
      expect.objectContaining({ cell: "incident-flight-a", parent: "incident-semantic-analyzer" }),
      expect.objectContaining({ cell: "incident-flight-b", parent: "incident-semantic-analyzer" }),
    ]));
  });

  it("validates every fixture against the live semantic contract and reference graph", () => {
    const validators = liveBlueprint.payload.services?.["incident-semantic-analysis"]
      ?.operations.analyzeReport.response.validators;
    expect(cachedSampleReports).toHaveLength(5);

    for (const sample of cachedSampleReports) {
      const model = sample.model as unknown as Record<string, unknown>;
      const report = runDeclarativeValidators(validators, model as Json);
      expect(report.errors, sample.id).toEqual([]);
      assertKnownReferences(model);
    }
  });

  it("hydrates and switches complete cached source/model pairs", async () => {
    const state = { incident3: {} };
    hydrateState(state);
    expect(state.incident3).toMatchObject({
      selectedSampleId: "password-spray-mailbox",
      content: cachedSampleReports[0].content,
      model: cachedSampleReports[0].model,
      analyzedContent: cachedSampleReports[0].content,
    });

    const target = cachedSampleReports.find(({ id }) => id === "device-code-bec");
    const result = await handlers.selectCachedSampleReport({
      payload: { value: "device-code-bec" },
      set,
    } as never);
    expect(result.ops).toEqual(expect.arrayContaining([
      set("incident3.selectedSampleId", "device-code-bec"),
      set("incident3.content", target?.content),
      set("incident3.model", target?.model),
      set("incident3.analyzedContent", target?.content),
    ]));
  });
});
