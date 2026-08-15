import { describe, expect, it } from "vitest";
import { analyzeCellComposition, type BlueprintArtifact, type CellDefinition } from "@gik/blueprint";
import { InMemoryStateModel } from "@gik/kernel";

import { openSampleBlueprint, resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";
import { createBlueprintAgentLifecycle } from "../apps/browser-host/src/runtime/blueprint-agent-lifecycle";

const blueprint = resolveSampleBlueprintSource("incident-report-explorer-2") as BlueprintArtifact;
const cells = Object.values(blueprint.payload.cells ?? {}) as CellDefinition[];

describe("incident-report-explorer-2 Blueprint", () => {
  it("uses a slotted layout with input and output ports and no analyzer-owned cache", () => {
    expect(Object.keys(blueprint.payload.cells ?? {})).toEqual(["analysis-layout", "report-presentation", "analysis-as-on", "analysis-runner"]);
    expect(blueprint.payload.cells?.["analysis-as-on"]?.inputs).toEqual([
      { token: "analysis_as_on", as: "analysis_as_on", required: false },
    ]);
    expect(blueprint.payload.cells?.["report-presentation"]?.inputs).toEqual([
      { token: "cached_analysis_report", as: "cached_analysis_report", required: false },
    ]);
    expect(blueprint.payload.cells?.["analysis-runner"]).toMatchObject({
      inputs: [
        { token: "incident_report", as: "incident_report", required: true },
        { token: "cached_analysis_report", as: "cached_analysis_report", required: false },
      ],
      compute: [{ expression: "sources.`analysis-runner.source`", assign: "analysisReport" }],
      outputs: [{ token: "analysis_report", from: "computed.analysisReport" }],
      sources: [{
        service: "incident-semantic-analysis",
        operation: "analyzeReport",
        input: { expr: "{'incident_report':inputs.incident_report}" },
        output: { expr: "response" },
      }],
    });
    expect(blueprint.payload.services).not.toHaveProperty("incident-analysis-cache");
    const representations = blueprint.payload.recipes[0].representations;
    expect(representations.map(({ views }) => views["report-presentation"]?.capability))
      .toEqual(Array(3).fill("semantic:narrative"));
    expect(representations.map(({ views }) => views["report-presentation"]?.bindings?.sections?.expression))
      .toEqual(Array(3).fill(expect.stringContaining("cached_analysis_report.identity.title")));
    expect(representations.map(({ presentation }) => presentation)).toEqual(Array(3).fill({
      roots: ["analysis-layout"],
      placements: [
        { cell: "analysis-runner", parent: "analysis-layout", slot: "children", order: 0 },
        { cell: "analysis-as-on", parent: "analysis-layout", slot: "children", order: 1 },
        { cell: "report-presentation", parent: "analysis-layout", slot: "children", order: 2 },
      ],
    }));
    const settlement = blueprint.payload.services?.["incident-semantic-analysis"]?.operations.analyzeReport
      .settlement?.transform;
    expect(settlement).toMatchObject({
      kind: "jsonata",
      expr: "{'ops':[]}",
    });
    expect(JSON.stringify(blueprint)).not.toContain("cached_analysis_envelope");
    expect(JSON.stringify(settlement)).not.toContain("incident-cache");
    expect(analyzeCellComposition(cells)).toMatchObject({
      externalInputs: ["analysis_as_on", "cached_analysis_report", "incident_report"],
      diagnostics: [],
    });
  });

  it("declares narrow UBX authority and admits analysis proposals without mutating state", async () => {
    expect(blueprint.payload.agentLifecycle?.profiles?.use).toMatchObject({
      id: "use-blueprint",
      version: "1.0.0",
      targetKinds: ["blueprint-instance", "incident-report"],
      intentKinds: ["select-sample", "save-report", "analyze-report"],
      constraints: expect.arrayContaining([
        expect.stringContaining("authored lowering own representation selection"),
      ]),
    });
    expect(blueprint.payload.agentLifecycle?.profiles).not.toHaveProperty("customize");
    expect(blueprint.payload.agentLifecycle?.profiles).not.toHaveProperty("author");

    const runtime = openSampleBlueprint("incident-report-explorer-2");
    const state = new InMemoryStateModel(Object.keys(runtime.state));
    state.apply(Object.entries(runtime.state).map(([path, value]) => ({ op: "set" as const, path, value })));
    const lifecycle = createBlueprintAgentLifecycle(runtime, state);
    const before = structuredClone(state.snapshot());
    const receipt = await lifecycle.tools.find(({ name }) => name === "use_blueprint_propose")?.handler({
      kind: "analyze-report",
      target: { kind: "blueprint-instance", id: runtime.blueprintId, instanceId: runtime.instanceId },
      payloadJson: JSON.stringify({ operation: "analyzeReport" }),
      rationale: "Request the declared presentation-neutral semantic analysis.",
    }) as { status: string; proposal: { actions: Array<{ kind: string }> } };

    expect(receipt).toMatchObject({
      status: "admitted",
      proposal: { actions: [{ kind: "analyze-report" }] },
    });
    expect(state.snapshot()).toEqual(before);
  });

  it("applies an admitted analysis settlement exactly once", async () => {
    const runtime = openSampleBlueprint("incident-report-explorer-2");
    const state = new InMemoryStateModel(["incident2"]);
    state.apply([{ op: "set", path: "incident2.pendingContent", value: "# Incident report" }]);
    const lifecycle = createBlueprintAgentLifecycle(runtime, state);
    const receipt = await lifecycle.tools.find(({ name }) => name === "use_blueprint_propose")?.handler({
      kind: "analyze-report",
      target: { kind: "blueprint-instance", id: runtime.blueprintId, instanceId: runtime.instanceId },
      payloadJson: JSON.stringify({ operation: "analyzeReport" }),
      rationale: "Complete semantic analysis.",
    }) as { id: string; status: string };
    expect(receipt.status).toBe("admitted");

    await lifecycle.settle?.({
      receiptId: receipt.id,
      settlement: {
        ops: [
          { op: "set", path: "incident2.model", value: { identity: { incidentId: "incident-1" } } },
          { op: "set", path: "incident2.analyzedContent", value: "# Incident report" },
          { op: "set", path: "incident2.pendingContent", value: null },
        ],
      },
    });
    await lifecycle.settle?.({
      receiptId: receipt.id,
      settlement: {
        ops: [{ op: "set", path: "incident2.model", value: { identity: { incidentId: "duplicate" } } }],
      },
    });

    expect(state.get("incident2.model")).toEqual({ identity: { incidentId: "incident-1" } });
    expect(state.get("incident2.analyzedContent")).toBe("# Incident report");
    expect(state.get("incident2.pendingContent")).toBeNull();
  });

  it("keeps agent output semantic while the authored recipe owns presentation", () => {
    expect(blueprint.payload.tiers.map(({ id }) => id)).toEqual(["incident-semantic", "runtime-document"]);
    expect(blueprint.payload.recipes).toHaveLength(1);
    expect(analyzeCellComposition(cells)).toMatchObject({
      externalInputs: ["analysis_as_on", "cached_analysis_report", "incident_report"],
      diagnostics: [],
    });

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

  it("automatically analyzes through source admission and renders platform run state", () => {
    expect(blueprint.payload.runtime?.state?.incident2).not.toHaveProperty("analysisRequested");
    expect(blueprint.payload.runtime?.state?.incident2).not.toHaveProperty("analysisReport");
    expect(blueprint.payload.recipes[0].representations
      .filter(({ id }) => id === "operational" || id === "brief")
      .map(({ views }) => views["analysis-runner"])).toEqual([
      expect.objectContaining({ capability: "fluent:spinner", visibility: "systemInputs.numSourcesRunning != 0" }),
      expect.objectContaining({ capability: "fluent:spinner", visibility: "systemInputs.numSourcesRunning != 0" }),
    ]);
    expect(blueprint.payload.cells?.["analysis-runner"]?.behavior).toBeUndefined();
    expect(blueprint.payload.cells?.["analysis-runner"]?.sources?.[0].when)
      .toContain("sources.`analysis-runner.source`");

    const operation = blueprint.payload.services?.["incident-semantic-analysis"]?.operations.analyzeReport;
    expect(JSON.stringify(operation?.settlement?.transform)).not.toContain("analysisPending");
    expect(JSON.stringify(operation?.failureSettlement?.transform)).not.toContain("analysisPending");
  });

});