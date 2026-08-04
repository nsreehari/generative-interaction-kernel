import { describe, expect, it } from "vitest";
import { analyzeCellComposition, materializeBlueprint, type BlueprintArtifact, type CellDefinition } from "@gik/blueprint";

import blueprint from "../blueprints/incident-report-explorer-1a/blueprint.json" with { type: "json" };
import { openSampleBlueprint, resolveSampleBlueprintSource } from "../shared/blueprints";
import { resolveBlueprintInitialContext, resolveBlueprintNative } from "../shared/sample-bundles";

const cells = Object.values(blueprint.payload.cells) as unknown as CellDefinition[];

describe("incident-report-explorer-1a Blueprint", () => {
  it("keeps refinement semantic while the authored recipe owns presentation", () => {
    const source = blueprint as unknown as BlueprintArtifact;
    expect(source.payload.tiers.map(({ id }) => id)).toEqual(["incident-report-semantic", "runtime-document"]);
    expect(source.payload.recipes).toHaveLength(1);
    expect(analyzeCellComposition(cells)).toMatchObject({ externalInputs: [], diagnostics: [] });

    const operation = source.payload.services?.["incident-report-refinement"]?.operations.improveReport;
    const schemaValidator = operation?.response?.validators?.find((validator) => validator.code === "provider-structured-output");
    const schema = schemaValidator && "schema" in schemaValidator ? schemaValidator.schema as Record<string, unknown> : {};
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(Object.keys(properties)).toEqual(expect.arrayContaining([
      "identity", "verdict", "summary", "phases", "entities", "relationships", "alerts", "events",
      "techniques", "indicators", "actions", "sectionCoverage", "preservationSummary", "factualChanges", "omissions",
    ]));
    expect(properties).not.toHaveProperty("improvedMarkdown");
    expect(properties).not.toHaveProperty("components");
    expect(properties).not.toHaveProperty("layout");
  });

  it("materializes semantic concepts into authored runtime components", () => {
    const source = blueprint as unknown as BlueprintArtifact;
    const terminal = materializeBlueprint({ blueprint: source }).payload.terminalBlueprint;
    expect(terminal.payload.tiers).toEqual([{ id: "runtime-document", kind: "runtime-document" }]);
    expect(terminal.payload.recipes).toEqual([]);
    const placements = terminal.payload.projections?.presentation?.placements ?? [];
    expect(placements.filter(({ parent }) => parent === "incident-refinement").map(({ cell }) => cell)).toEqual([
      "incident-verdict",
      "incident-attack-path",
      "incident-alerts",
      "incident-timeline",
      "incident-entities",
      "incident-techniques",
      "incident-indicators",
      "incident-actions",
    ]);
  });

  it("binds a dedicated semantic refinement agent with strict preservation constraints", () => {
    const source = resolveSampleBlueprintSource("incident-report-explorer-1a");
    const service = source.payload.services?.["incident-report-refinement"];
    const operation = service?.operations?.improveReport;
    const schemaValidator = operation?.response?.validators?.find((validator) => validator.code === "provider-structured-output");
    const schema = schemaValidator && "schema" in schemaValidator ? schemaValidator.schema as Record<string, unknown> : {};
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(service?.config).toMatchObject({ agent: "Incident-Report-Refinement-Agent" });
    expect(operation?.contract).toBe("incident-report-semantic-refinement/v1");
    expect(properties.factualChanges).toMatchObject({ type: "array", maxItems: 0 });
    expect(properties.omissions).toMatchObject({ type: "array", maxItems: 0 });
    expect(operation?.response?.validators).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "content-preservation" }),
    ]));
  });

  it("hydrates the report and resolves its native providers", () => {
    const context = resolveBlueprintInitialContext("incident-report-explorer-1a");
    expect(context.initialSeed.incident1a).toMatchObject({
      selectedSampleId: "password-spray-mailbox",
      content: expect.stringContaining("## Verdict"),
      model: null,
    });
    expect(resolveBlueprintNative("incident-report-explorer-1a")).toMatchObject({
      effectHandlers: expect.any(Object),
      projectionViews: expect.objectContaining({
        workspace: expect.any(Function),
        editor: expect.any(Function),
        refinement: expect.any(Function),
      }),
    });
  });
});
