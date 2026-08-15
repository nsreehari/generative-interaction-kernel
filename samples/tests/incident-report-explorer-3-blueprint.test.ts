import { describe, expect, it } from "vitest";
import { analyzeCellComposition, materializeBlueprint, type BlueprintArtifact, type CellDefinition } from "@gik/blueprint";
import { InMemoryStateModel } from "@gik/kernel";

import { openSampleBlueprint, resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";
import { createBlueprintAgentLifecycle } from "../apps/browser-host/src/runtime/blueprint-agent-lifecycle";

const blueprint = resolveSampleBlueprintSource("incident-report-explorer-3") as BlueprintArtifact;
const cells = Object.values(blueprint.payload.cells ?? {}) as CellDefinition[];

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

  it("automatically analyzes once and renders platform run state", () => {
    expect(blueprint.payload.runtime?.state?.incident3).not.toHaveProperty("analysisRequested");
    expect(blueprint.payload.runtime?.state?.incident3).not.toHaveProperty("analysisReport");
    expect(blueprint.payload.recipes[0].representations[0].views["analysis-runner"]).toMatchObject({
      capability: "fluent:spinner",
      visibility: "systemInputs.numSourcesRunning != 0",
    });
    expect(blueprint.payload.cells?.["analysis-runner"]?.behavior).toBeUndefined();
    expect(blueprint.payload.cells?.["analysis-runner"]?.sources?.[0]).toMatchObject({
      when: expect.stringContaining("sources.`analysis-runner.source`"),
      input: { expr: "{'incident_report':inputs.incident_report}" },
      output: { expr: "response" },
    });

    const operation = blueprint.payload.services?.["incident-semantic-analysis"]?.operations.analyzeReport;
    expect(JSON.stringify(operation?.settlement?.transform)).not.toContain("analysisPending");
    expect(JSON.stringify(operation?.failureSettlement?.transform)).not.toContain("analysisPending");
  });

  it("keeps the agent source-faithful while the authored recipe owns both flights", () => {
    expect(blueprint.payload.tiers.map(({ id }) => id)).toEqual(["incident-semantic", "runtime-document"]);
    expect(blueprint.payload.recipes).toHaveLength(1);
    expect(analyzeCellComposition(cells)).toMatchObject({
      externalInputs: ["analysis_as_on", "cached_analysis_report", "incident_report"],
      diagnostics: [],
    });
    expect(Object.keys(blueprint.payload.cells ?? {})).toEqual(["analysis-layout", "report-presentation", "analysis-as-on", "analysis-runner"]);
    expect(blueprint.payload.services).not.toHaveProperty("incident-analysis-cache");

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

  it.each(["operational", "brief"])("materializes the slotted analyzer in the %s representation", (attention) => {
    const terminal = materializeBlueprint({ blueprint, externalContext: { attention } }).payload.terminalBlueprint;
    const placements = terminal.payload.projections?.presentation?.placements ?? [];
    expect(terminal.payload.projections?.presentation?.roots).toEqual(["analysis-layout"]);
    expect(placements).toEqual([
      { cell: "analysis-runner", parent: "analysis-layout", slot: "children", order: 0 },
      { cell: "analysis-as-on", parent: "analysis-layout", slot: "children", order: 1 },
      { cell: "report-presentation", parent: "analysis-layout", slot: "children", order: 2 },
    ]);
  });

  it("publishes fresh analysis for the parent cache writer", () => {
    expect(blueprint.payload.cells?.["analysis-runner"]?.compute).toEqual([
      { id: "analysis-report", expression: "sources.`analysis-runner.source`", assign: "analysisReport" },
    ]);
    expect(blueprint.payload.cells?.["analysis-runner"]?.outputs).toEqual([
      { token: "analysis_report", from: "computed.analysisReport", when: "computed.analysisReport != null" },
    ]);
    expect(blueprint.payload.services?.["incident-semantic-analysis"]?.operations.analyzeReport.settlement).toMatchObject({
      transform: { expr: "{'ops':[]}" },
    });
    expect(JSON.stringify(blueprint)).not.toContain("cached_analysis_envelope");
  });
});
