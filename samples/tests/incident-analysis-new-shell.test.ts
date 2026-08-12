import { describe, expect, it } from "vitest";

import shell from "../blueprints/incident-analysis-new-shell/blueprint.json" with { type: "json" };

const payload = shell.payload;

describe("incident analysis shell", () => {
  it("owns only source selection, source display, drawer layout, and a runtime-bound analyzer", () => {
    expect(Object.keys(payload.cells)).toEqual([
      "incident-analyzer",
      "source-options",
      "selected-source",
      "source-drawer",
    ]);
    expect(payload.projections.presentation.roots).toEqual(["incident-analyzer", "source-drawer"]);
    expect(payload.projections.presentation.placements).toEqual([
      { cell: "source-options", parent: "source-drawer", slot: "children", order: 0 },
      { cell: "selected-source", parent: "source-drawer", slot: "children", order: 1 },
    ]);
  });

  it("binds the analyzer reference at runtime and passes only the incident report", () => {
    expect(payload.cells["incident-analyzer"]).toMatchObject({
      inputs: [{ token: "incident_report", as: "incident_report", required: true }],
      blueprint: { $ref: { expression: "externalContext.analyzer_blueprint_ref" } },
      view: {
        props: { hostedAnalysis: true },
        bindings: { incident_report: { from: "incidentShell.incident_report" } },
      },
    });
    expect(JSON.stringify(payload.cells["incident-analyzer"])).not.toMatch(/explorer|analyzerId|variant|attention|analysis/);
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
    expect(payload.cells["source-options"].outputs[0].token).toBe("selected_report_key");
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
