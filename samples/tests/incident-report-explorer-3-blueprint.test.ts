import { describe, expect, it } from "vitest";
import { analyzeCellComposition, materializeBlueprint, type BlueprintArtifact, type CellDefinition } from "@gik/blueprint";
import { BlueprintController } from "@gik/react";
import { InMemoryStateModel } from "../../kernel/src/index";

import blueprintJson from "../blueprints/incident-report-explorer-3/blueprint.json" with { type: "json" };
import { openSampleBlueprint } from "../shared/blueprints";
import { createBlueprintAgentLifecycle } from "../shared/blueprint-agent-lifecycle";

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
  it("declares narrow UBX authority and admits analysis proposals without mutating state", async () => {
    expect(blueprint.payload.agentLifecycle?.profiles?.use).toMatchObject({
      id: "use-blueprint",
      version: "1.0.0",
      targetKinds: ["blueprint-instance", "incident-report"],
      intentKinds: ["select-sample", "save-report", "analyze-report"],
      constraints: expect.arrayContaining([
        expect.stringContaining("Do not select flights, fullscreen state, or presentation presets"),
      ]),
    });
    expect(blueprint.payload.agentLifecycle?.profiles).not.toHaveProperty("customize");
    expect(blueprint.payload.agentLifecycle?.profiles).not.toHaveProperty("author");

    const runtime = openSampleBlueprint("incident-report-explorer-3");
    const state = new InMemoryStateModel(Object.keys(runtime.state));
    state.apply(Object.entries(runtime.state).map(([path, value]) => ({ op: "set" as const, path, value })));
    const lifecycle = createBlueprintAgentLifecycle(runtime, state);
    const before = structuredClone(state.snapshot());
    const receipt = await lifecycle.tools.find(({ name }) => name === "use_blueprint_propose")?.handler({
      kind: "analyze-report",
      target: { kind: "blueprint-instance", id: runtime.blueprintId, instanceId: runtime.instanceId },
      payloadJson: JSON.stringify({ operation: "analyzeReport" }),
      rationale: "Request the declared source-faithful semantic analysis.",
    }) as { status: string; proposal: { actions: Array<{ kind: string }> } };

    expect(receipt).toMatchObject({
      status: "admitted",
      proposal: { actions: [{ kind: "analyze-report" }] },
    });
    expect(state.snapshot()).toEqual(before);
  });

  it("keeps the analyze command loading until success or failure settlement", () => {
    expect(blueprint.payload.runtime?.state?.incident3).toMatchObject({ analysisPending: false });
    expect(blueprint.payload.recipes[0].representations[0].views["incident-analyze-report"]?.bindings).toMatchObject({
      disabled: { from: "incident3.analysisPending" },
      loading: { from: "incident3.analysisPending" },
    });
    expect(blueprint.payload.cells?.["incident-analyze-report"]?.behavior?.events?.press).toEqual([
      { do: "assign", target: "incident3.analysisPending", args: { value: true } },
      { do: "invoke", args: { tool: "prepareAnalysis" } },
      { do: "invoke", args: { tool: "analyzeReport" } },
    ]);

    const operation = blueprint.payload.services?.["incident-semantic-analysis"]?.operations.analyzeReport;
    expect(operation?.settlement?.transform).toMatchObject({
      kind: "jsonata",
      expr: expect.stringContaining("'path':'incident3.analysisPending','value':false"),
    });
    expect(operation?.failureSettlement?.transform).toMatchObject({
      kind: "jsonata",
      expr: expect.stringContaining("'path':'incident3.analysisPending','value':false"),
    });
  });

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
