import { describe, expect, it } from "vitest";
import { analyzeCellComposition, materializeBlueprint, type BlueprintArtifact, type CellDefinition } from "@gik/blueprint";

import blueprintJson from "../blueprints/incident-report-explorer-2/blueprint.json" with { type: "json" };

const blueprint = blueprintJson as unknown as BlueprintArtifact;
const cells = Object.values(blueprint.payload.cells ?? {}) as CellDefinition[];

describe("incident-report-explorer-2 Blueprint", () => {
  it("keeps agent output semantic while the authored recipe owns presentation", () => {
    expect(blueprint.payload.tiers.map(({ id }) => id)).toEqual(["incident-semantic", "runtime-document"]);
    expect(blueprint.payload.recipes).toHaveLength(1);
    expect(analyzeCellComposition(cells)).toMatchObject({ externalInputs: [], diagnostics: [] });

    const operation = (blueprint.payload.services?.["incident-semantic-analysis"] as {
      operations: { analyzeReport: { response: { validators: Array<{ schema?: { properties?: Record<string, unknown> } }> } } };
    }).operations.analyzeReport;
    const properties = operation.response.validators[0].schema?.properties ?? {};
    expect(Object.keys(properties)).toEqual(expect.arrayContaining([
      "identity", "verdict", "phases", "entities", "relationships", "events", "techniques", "evidence", "actions", "representationNotes",
    ]));
    expect(properties).not.toHaveProperty("projectionCandidates");
    expect(properties).not.toHaveProperty("layout");
    expect(properties).not.toHaveProperty("components");
  });

  it.each([
    ["operational", ["incident-verdict", "incident-attack-path", "incident-blast-radius", "incident-timeline", "incident-techniques", "incident-response", "incident-notes"]],
    ["brief", ["incident-verdict", "incident-attack-path", "incident-response", "incident-notes"]],
  ])("materializes the authored %s preset", (attention, expectedLeaves) => {
    const terminal = materializeBlueprint({ blueprint, externalContext: { attention } }).payload.terminalBlueprint;
    expect(terminal.payload.tiers).toEqual([{ id: "runtime-document", kind: "runtime-document" }]);
    expect(terminal.payload.recipes).toEqual([]);
    const placements = terminal.payload.projections?.presentation?.placements ?? [];
    expect(placements.filter(({ parent }) => parent === "incident-semantic-analyzer").map(({ cell }) => cell)).toEqual(expectedLeaves);
  });
});