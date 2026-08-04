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
    expect(Object.keys(properties)).toEqual([
      "sections", "sectionCoverage", "preservationSummary", "factualChanges", "omissions",
    ]);
    const sectionSchema = properties.sections.items as Record<string, any>;
    const optionSchema = sectionSchema.properties.options.items as Record<string, any>;
    expect(sectionSchema.properties.options).toMatchObject({ minItems: 1, maxItems: 3 });
    expect(optionSchema.properties.capability.enum).toEqual([
      "semantic:argument", "semantic:decision", "semantic:entity-set", "semantic:event-series",
      "semantic:evidence-case", "semantic:measure-set", "semantic:milestones", "semantic:narrative",
      "semantic:process", "semantic:relationship-set", "semantic:work-set", "security:attack-path",
    ]);
    expect(optionSchema.properties.relationship.enum).toEqual(["preferred", "alternative", "complementary"]);
    expect(optionSchema.required).toContain("data");
    expect(optionSchema.properties.data).toMatchObject({ type: "string", minLength: 2 });
    expect(properties).not.toHaveProperty("improvedMarkdown");
    expect(properties).not.toHaveProperty("components");
    expect(properties).not.toHaveProperty("layout");
  });

  it("materializes agent-selected semantic data through the authored runtime host", () => {
    const source = blueprint as unknown as BlueprintArtifact;
    const terminal = materializeBlueprint({ blueprint: source }).payload.terminalBlueprint;
    expect(terminal.payload.tiers).toEqual([{ id: "runtime-document", kind: "runtime-document" }]);
    expect(terminal.payload.recipes).toEqual([]);
    const placements = terminal.payload.projections?.presentation?.placements ?? [];
    expect(placements.filter(({ parent }) => parent === "incident-refinement").map(({ cell }) => cell)).toEqual([
      "incident-sections", "incident-improve-report",
    ]);
    expect(source.payload.recipes[0].representations[0].views["incident-sections"]).toMatchObject({
      capability: "semantic:component-data-sections",
      bindings: { sections: { from: "incident1a.model.sections" } },
    });
  });

  it("resolves the catalog-backed host from the shared semantic provider", () => {
    const projectionViews = blueprint.payload.runtime.externals.projectionViews;
    expect(projectionViews.semantic).toEqual({ from: "semantic", use: ["component-data-sections"] });
    expect(projectionViews).not.toHaveProperty("security");
  });

  it("owns improve and refresh execution in one authored command cell", () => {
    expect(blueprint.payload.runtime.state.incident1a.refinementPending).toBe(false);
    expect(blueprint.payload.recipes[0].representations[0].views).toMatchObject({
      "incident-improve-report": {
        bindings: {
          disabled: { from: "incident1a.refinementPending" },
          loading: { from: "incident1a.refinementPending" },
        },
        visibility: "incident1a.model = null or incident1a.content != incident1a.refinedContent",
      },
    });
    expect(blueprint.payload.cells["incident-improve-report"].behavior.events.press).toEqual([
      { do: "assign", target: "incident1a.refinementPending", args: { value: true } },
      { do: "invoke", args: { tool: "prepareRefinement" } },
      { do: "invoke", args: { tool: "improveReport" } },
    ]);
    expect(blueprint.payload.cells).not.toHaveProperty("incident-refresh-report");
    expect(blueprint.payload.cells["incident-refinement"].behavior).toBeUndefined();
  });

  it("keeps coverage as a response invariant instead of prescribing a coverage component", () => {
    const views = blueprint.payload.recipes[0].representations[0].views;
    expect(views).not.toHaveProperty("incident-coverage");
    expect(blueprint.payload.cells).not.toHaveProperty("incident-coverage");
  });

  it("binds a dedicated semantic refinement agent with strict preservation constraints", () => {
    const source = resolveSampleBlueprintSource("incident-report-explorer-1a");
    const service = source.payload.services?.["incident-report-refinement"];
    const operation = service?.operations?.improveReport;
    const schemaValidator = operation?.response?.validators?.find((validator) => validator.code === "provider-structured-output");
    const schema = schemaValidator && "schema" in schemaValidator ? schemaValidator.schema as Record<string, unknown> : {};
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(service?.config).toMatchObject({ agent: "Incident-Report-Refinement-Agent" });
    expect(operation?.contract).toBe("incident-report-component-data/v2");
    expect(properties.factualChanges).toMatchObject({ type: "array", maxItems: 0 });
    expect(properties.omissions).toMatchObject({ type: "array", maxItems: 0 });
    const request = operation?.request?.transform;
    const requestExpression = request && "expr" in request ? String(request.expr) : "";
    expect(requestExpression).toContain("Suggestions are guidance only");
    expect(requestExpression).toContain("Choose another available contract when more appropriate");
    expect(requestExpression).toContain("Return data, not components");
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
