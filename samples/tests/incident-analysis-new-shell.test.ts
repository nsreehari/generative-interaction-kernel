import {
  analyzeCellComposition,
  materializeBlueprint,
  type BlueprintArtifact,
  type CellDefinition,
} from "@gik/blueprint";
import { describe, expect, it } from "vitest";

import shell from "../blueprints/incident-analysis-new-shell/blueprint.json" with { type: "json" };

const payload = shell.payload;
const cells = Object.values(payload.cells) as CellDefinition[];

describe("incident analysis shell", () => {
  it("selects the analysis model from external context and routes refinement to its agent", () => {
    expect(payload.serviceRecipes).toEqual([
      expect.objectContaining({
        id: "incident-analysis-to-runtime",
        implementationFallback: "semantic",
        implementationPrograms: [
          expect.objectContaining({ id: "semantic", when: "externalContext.model = 'semantic'" }),
          expect.objectContaining({
            id: "source-faithful",
            when: "externalContext.model = 'source-faithful'",
          }),
          expect.objectContaining({
            id: "refinement",
            when: "externalContext.model = 'refinement'",
          }),
        ],
      }),
    ]);
    // The projection axis is authored independently and carries no implementation selection.
    expect(payload.projectionRecipes).toEqual([
      expect.objectContaining({ id: "incident-analysis-to-runtime", fallback: "shared-shell" }),
    ]);
    expect(payload.services["incident-report-analysis"].config.agent)
      .toBe("Incident-Report-Semantic-Agent");

    for (const model of ["semantic", "source-faithful", "refinement"] as const) {
      const materialized = materializeBlueprint({
        blueprint: shell as BlueprintArtifact,
        externalContext: { model },
      }).payload.terminalBlueprint.payload;
      const modelCompute = materialized.cells?.["analysis-selection"].compute?.find(
        ({ id }) => id === "selected-model",
      );

      expect(modelCompute?.expression).toBe(`'${model}'`);
      const analysisSource = materialized.cells?.["report-analysis"].sources?.[0];
      const analysisService = materialized.services?.[analysisSource?.service ?? ""];
      expect(analysisService?.config).toMatchObject({
        agent: model === "refinement"
          ? "Incident-Report-Refinement-Agent"
          : "Incident-Report-Semantic-Agent",
      });
    }
  });

  it("declares the four-Cell interactive analysis pipeline", () => {
    expect(Object.keys(payload.cells)).toEqual([
      "analysis-selection",
      "report-analysis",
      "analysis-context",
      "report-resolution",
    ]);
    expect(payload.interface?.inputs).toBeUndefined();
    expect(analyzeCellComposition(cells)).toMatchObject({
      externalInputs: ["incident.analysisRequest", "incident.selection"],
      diagnostics: [],
    });
  });

  it("uses form save as the selection-to-token boundary", () => {
    expect(payload.cells["analysis-selection"]).toMatchObject({
      inputs: [
        { token: "incident.selection", as: "selection" },
      ],
      sources: [{ operation: "listSourceReports" }],
      outputs: [
        { token: "selected-report", from: "inputs.selection.sourceReport" },
        { token: "selected-model", from: "computed.model" },
      ],
      behavior: {
        on: {
          save: [{ do: "assign", target: "incident.selection", args: { from: "$event.values" } }],
        },
      },
      potentialViews: {
        primary: {
          capability: "primitive:form",
          before: [expect.objectContaining({ capability: "fluent:spinner" })],
        },
      },
      events: { save: { payloadSchema: { type: "object" } } },
    });
    expect(Object.keys(payload.cells["analysis-selection"].behavior.on)).toEqual(["save"]);
  });

  it("retrieves source and the last saved report from selection tokens", () => {
    expect(payload.cells["analysis-context"]).toMatchObject({
      inputs: [
        { token: "selected-report" },
        { token: "selected-model" },
      ],
      sources: [
        { operation: "getSourceReport", when: "$length(inputs.selectedReport) > 0" },
        {
          operation: "getSavedReport",
          when: "$length(inputs.selectedReport) > 0 and $length(inputs.selectedModel) > 0",
        },
      ],
      outputs: [
        { token: "selected-report-content" },
        { token: "saved-report-lookup-envelope" },
      ],
    });
  });

  it("keeps refresh analysis available regardless of a saved report", () => {
    expect(payload.cells["report-analysis"]).toMatchObject({
      systemInputs: ["numSourcesRunning"],
      inputs: [
        { token: "selected-report", as: "selectedReport", required: true },
        { token: "selected-model", as: "selectedModel", required: true },
        { token: "selected-report-content", as: "reportContent", required: true },
        { token: "saved-report-lookup-envelope", as: "savedReportEnvelope", required: true },
        { token: "incident.analysisRequest", as: "analysisRequest" },
      ],
      sources: [{
        operation: "analyzeReportBlueprint",
        when: "inputs.analysisRequest.selectedReport = inputs.selectedReport and inputs.analysisRequest.selectedModel = inputs.selectedModel",
      }],
      outputs: [{ token: "analysis-report-blueprint" }],
      behavior: { on: { press: [expect.objectContaining({ do: "assign", target: "incident.analysisRequest" })] } },
      potentialViews: {
        primary: {
          capability: "fluent:button",
          props: { label: "Analyze / refresh report" },
          before: [expect.objectContaining({
            capability: "fluent:spinner",
            visibility: "systemInputs.numSourcesRunning > 0",
          })],
        },
      },
      events: { press: { payloadSchema: { type: "object" } } },
    });
    expect(payload.cells["report-analysis"].potentialViews?.primary.visibility).toBeUndefined();
  });

  it("saves every newly generated report and prefers it over the loaded report", () => {
    expect(payload.cells["report-resolution"]).toMatchObject({
      inputs: [
        { token: "selected-report", as: "selectedReport", required: true },
        { token: "selected-model", as: "selectedModel", required: true },
        { token: "saved-report-lookup-envelope", as: "savedReportEnvelope", required: true },
        { token: "analysis-report-blueprint", as: "analysisReport", required: false },
      ],
      sources: [{
        operation: "putSavedReport",
        when: "inputs.analysisReport != null",
      }],
      potentialViews: {
        primary: {
          capability: "gik:blueprint",
          visibility: "incident.resolvedSavedReportEnvelope.found and incident.resolvedSavedReportEnvelope.analysisReport != null",
          bindings: {
            blueprint: {
              expression: "incident.resolvedSavedReportEnvelope.analysisReport",
            },
          },
        },
      },
    });
    expect(payload.cells["report-resolution"].compute).toContainEqual(expect.objectContaining({
      id: "resolved-saved-report-envelope",
      expression: expect.stringContaining(": inputs.savedReportEnvelope"),
    }));
  });

  it("keys saved reports by immutable source id and selected model", () => {
    const getExpression = payload.services["incident-saved-reports"].operations.getSavedReport
      .request.transform.expr;
    const putExpression = payload.services["incident-saved-reports"].operations.putSavedReport
      .request.transform.expr;

    expect(getExpression).toContain("'source_report_key':input.source_report_key");
    expect(getExpression).toContain("'analysis_key':input.model");
    expect(putExpression).toContain("'source_report_key':input.source_report_key");
    expect(putExpression).toContain("'analysis_key':input.model");
    expect(putExpression).not.toContain("source_content");
  });
});