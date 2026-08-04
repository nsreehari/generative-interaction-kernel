import { describe, expect, it } from "vitest";
import { analyzeCellComposition, materializeBlueprint, type BlueprintArtifact, type CellDefinition } from "@gik/blueprint";
import { BlueprintController } from "@gik/react";

import blueprintJson from "../blueprints/incident-report-explorer-3/blueprint.json" with { type: "json" };

const blueprint = blueprintJson as unknown as BlueprintArtifact;
const cells = Object.values(blueprint.payload.cells ?? {}) as CellDefinition[];

function waitForIncidentState(
  controller: BlueprintController,
  expected: { editing: boolean; fullscreen: boolean },
): Promise<void> {
  if (Object.entries(expected).every(([key, value]) =>
    (controller.getState().incident3 as Record<string, unknown>)[key] === value)) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      if (Object.entries(expected).every(([key, value]) =>
        (controller.getState().incident3 as Record<string, unknown>)[key] === value)) {
        unsubscribe();
        resolve();
      }
    });
  });
}

describe("incident-report-explorer-3 Blueprint", () => {
  it("keeps the agent source-faithful while the authored recipe owns both flights", () => {
    expect(blueprint.payload.tiers.map(({ id }) => id)).toEqual(["incident-semantic", "runtime-document"]);
    expect(blueprint.payload.recipes).toHaveLength(1);
    expect(analyzeCellComposition(cells)).toMatchObject({ externalInputs: [], diagnostics: [] });

    const operation = (blueprint.payload.services?.["incident-semantic-analysis"] as {
      operations: {
        analyzeReport: {
          request: { transform: { expr: string } };
          response: { validators: Array<{ schema?: { properties?: Record<string, unknown> } }> };
        };
      };
    }).operations.analyzeReport;
    const properties = operation.response.validators[0].schema?.properties ?? {};
    expect(Object.keys(properties)).toEqual(expect.arrayContaining([
      "identity", "verdict", "phases", "entities", "relationships", "events", "techniques", "evidence", "actions", "representationNotes",
    ]));
    expect(properties).not.toHaveProperty("projectionCandidates");
    expect(properties).not.toHaveProperty("layout");
    expect(properties).not.toHaveProperty("components");
    expect(operation.request.transform.expr).toContain("Do not infer causality, compromise status, severity, urgency, attribution, or recommendations");
    expect(operation.request.transform.expr).toContain("Do not choose components, layouts, disclosure, colors, flights, or presentation candidates");
    expect(operation.request.transform.expr).toContain("'maxOutputTokens':10000");
  });

  it.each(["operational", "brief"])("materializes both authored flights in the %s representation", (attention) => {
    const terminal = materializeBlueprint({ blueprint, externalContext: { attention } }).payload.terminalBlueprint;
    const placements = terminal.payload.projections?.presentation?.placements ?? [];
    const analyzerCells = placements.filter(({ parent }) => parent === "incident-semantic-analyzer").map(({ cell }) => cell);
    expect(analyzerCells.filter((cell) => cell.startsWith("incident-flight-"))).toEqual([
      "incident-flight-a",
      "incident-flight-b",
    ]);
    expect(analyzerCells.filter((cell) => !cell.startsWith("incident-flight-"))).toEqual([
      "incident-analyze-report",
      "incident-view-fullscreen",
      "incident-exit-fullscreen",
    ]);
    expect(terminal.payload.runtime.capabilities).toHaveProperty("incident3:incident-story");
    expect(terminal.payload.runtime.capabilities).toHaveProperty("incident3:investigation-canvas");
  });

  it("owns edit and fullscreen command state in the Blueprint", async () => {
    const controller = new BlueprintController(blueprint, { externalContext: { attention: "operational" } });
    await controller.start();

    const editing = waitForIncidentState(controller, { editing: true, fullscreen: false });
    await controller.emit("incident-edit-report", "press", {});
    await editing;
    expect(controller.getState().incident3).toMatchObject({ editing: true, fullscreen: false });

    const fullscreen = waitForIncidentState(controller, { editing: true, fullscreen: true });
    await controller.emit("incident-view-fullscreen", "press", {});
    await fullscreen;
    expect(controller.getState().incident3).toMatchObject({ editing: true, fullscreen: true });

    const windowed = waitForIncidentState(controller, { editing: true, fullscreen: false });
    await controller.emit("incident-exit-fullscreen", "press", {});
    await windowed;
    expect(controller.getState().incident3).toMatchObject({ editing: true, fullscreen: false });
  });
});
