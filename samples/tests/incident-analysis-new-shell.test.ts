import { describe, expect, it } from "vitest";

import shell from "../blueprints/incident-analysis-new-shell/blueprint.json" with { type: "json" };

const payload = shell.payload;

describe("incident analysis shell", () => {
  it("owns source selection, opaque cache transport, drawer layout, and a runtime-bound analyzer", () => {
    expect(Object.keys(payload.cells)).toEqual([
      "analysis-loader",
      "incident-analyzer",
      "analyzer-options",
      "source-options",
      "selected-report-key",
      "selected-source",
      "cache-retriever",
      "cache-writer",
      "source-drawer",
    ]);
    expect(payload.projections.presentation.roots).toEqual(["analysis-loader", "incident-analyzer", "source-drawer"]);
    expect(payload.projections.presentation.placements).toEqual([
      { cell: "analyzer-options", parent: "source-drawer", slot: "children", order: 0 },
      { cell: "source-options", parent: "source-drawer", slot: "children", order: 1 },
      { cell: "selected-source", parent: "source-drawer", slot: "children", order: 2 },
    ]);
  });

  it("shows a task-agnostic loader while source and cache readiness are unresolved", () => {
    expect(payload.cells["analysis-loader"].view).toMatchObject({
      capability: "fluent:spinner",
      props: { label: "Loading analysis" },
      visibility: "$not(incidentShell.cache_lookup_complete) or $length(incidentShell.incident_report) = 0",
    });
    expect(payload.runtime.externals.projectionViews.fluent.use).toEqual(["dropdown", "spinner"]);
  });

  it("selects the analyzer at runtime and passes only analyzer-owned inputs", () => {
    expect(payload.cells["analyzer-options"]).toMatchObject({
      inputs: [{ token: "analyzer_blueprint_ref", as: "analyzerBlueprintRef" }],
      outputs: [{ token: "analysis_key", from: "inputs.analyzerBlueprintRef" }],
      view: {
        capability: "fluent:dropdown",
        props: {
          label: "Incident analyzer",
          ariaLabel: "Choose incident analyzer",
          options: [
            { value: "blueprint:incident-report-explorer-1a@1.0.0" },
            { value: "blueprint:incident-report-explorer-2@1.0.0" },
            { value: "blueprint:incident-report-explorer-3@1.0.0" },
          ],
        },
        bindings: { value: { from: "analyzer_blueprint_ref" } },
      },
      behavior: {
        on: {
          select: [
            { do: "assign", target: "analyzer_blueprint_ref", args: { from: "$event.value" } },
            { do: "assign", target: "incidentShell.cached_analysis_report", args: { value: null } },
            { do: "assign", target: "incidentShell.analysis_report", args: { value: null } },
            { do: "assign", target: "incidentShell.analysis_as_on", args: { value: null } },
            { do: "assign", target: "incidentShell.cache_lookup_complete", args: { value: false } },
          ],
        },
      },
    });
    expect(payload.cells["incident-analyzer"]).toMatchObject({
      inputs: [
        { token: "incident_report", as: "incident_report", required: true },
        { token: "cached_analysis_report", as: "cached_analysis_report", required: false },
        { token: "analysis_as_on", as: "analysis_as_on", required: false },
        { token: "incidentShell.analysis_report", as: "analysisReport", required: false },
      ],
      outputs: [
        { token: "analysis_report", from: "inputs.analysisReport" },
      ],
      blueprint: { $ref: { expression: "analyzer_blueprint_ref" } },
      view: {
        props: { hostedAnalysis: true },
        visibility: "incidentShell.cache_lookup_complete and $length(incidentShell.incident_report) > 0",
        bindings: {
          incident_report: { from: "incidentShell.incident_report" },
          cached_analysis_report: { from: "incidentShell.cached_analysis_report" },
          analysis_as_on: { from: "incidentShell.analysis_as_on" },
        },
      },
    });
    expect(JSON.stringify(payload.cells["incident-analyzer"])).not.toMatch(/explorer|analyzerId|variant|attention/);
  });

  it("retrieves and writes opaque envelopes through the shared cache token", () => {
    const retriever = payload.cells["cache-retriever"];
    const writer = payload.cells["cache-writer"];
    expect(retriever.inputs.map(({ token }) => token)).toEqual(["selected_report_key", "analysis_key"]);
    expect(writer.inputs).toEqual([
      { token: "analysis_report", as: "analysisReport", required: true },
    ]);
    expect(writer.compute[0]).toMatchObject({
      expression: "inputs.analysisReport",
      assign: "incidentShell.analysis_report",
    });
    expect(retriever.outputs.map(({ token }) => token)).toEqual([
      "cached_analysis_report",
      "analysis_as_on",
    ]);
    expect(writer.outputs.map(({ token }) => token)).toEqual([
      "cached_analysis_report",
      "analysis_as_on",
    ]);
    expect(payload.services["incident-cache"].operations).toMatchObject({
      getCachedAnalysis: { operation: "get-asset", contract: "cached-analysis-envelope/v1" },
      putCachedAnalysis: { operation: "put-asset", contract: "cached-analysis-envelope/v1" },
    });
    const operations = payload.services["incident-cache"].operations;
    expect(operations.putCachedAnalysis.request.transform.expr).toContain(
      "'cached_analysis_envelope':{'asOn':$now(),'analysisReport':state.incidentShell.analysis_report}",
    );
    expect(operations.getCachedAnalysis.settlement.transform.expr).toContain("response.analysisReport");
    expect(operations.getCachedAnalysis.settlement.transform.expr).toContain("response.asOn");
    expect(operations.getCachedAnalysis.settlement.transform.expr).toContain("'path':'incidentShell.cache_lookup_complete','value':true");
    expect(JSON.stringify({ retriever, writer })).not.toMatch(/variant|verdict|summary|model|presentation/);
  });

  it("loads source options and the selected report through the asset Blueprint service", () => {
    expect(payload.services["incident-sources"].blueprint.$ref).toBe("blueprint:incident-analysis-assets@1.0.0");
    expect(payload.cells["source-options"].sources[0]).toMatchObject({
      service: "incident-sources",
      operation: "listSourceReports",
    });
    expect(payload.cells["selected-source"].sources[0]).toMatchObject({
      service: "incident-sources",
      operation: "getSourceReport",
    });
    expect(payload.cells["selected-report-key"]).toMatchObject({
      inputs: [{ token: "incidentShell.selected_report_key", as: "selectedReportKey" }],
      outputs: [{ token: "selected_report_key", from: "inputs.selectedReportKey" }],
    });
    expect(payload.cells["selected-source"].inputs[0]).toMatchObject({ token: "selected_report_key", required: true });
    expect(payload.cells["selected-source"].outputs[0].token).toBe("incident_report");
  });

  it("renders source controls in an 80 percent left floating drawer", () => {
    expect(payload.cells["source-drawer"].view).toEqual({
      capability: "primitive:drawer",
      props: {
        variant: "panel-vertical",
        fabPosition: "top-left",
        title: "Incident source",
        ariaLabel: "Incident source",
        panelWidthPercent: 80,
      },
      bindings: { open: { from: "incidentShell.drawer_open" } },
    });
  });
});
