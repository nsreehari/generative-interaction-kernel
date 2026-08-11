import { describe, expect, it } from "vitest";
import { analyzeCellComposition, type BlueprintArtifact, type CellDefinition } from "@gik/blueprint";
import { semanticComponentDefinitions } from "@gik/components";
import { InMemoryStateModel } from "@gik/kernel";

import { openSampleBlueprint, resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";
import { createBlueprintAgentLifecycle } from "../apps/browser-host/src/runtime/blueprint-agent-lifecycle";

const blueprint = resolveSampleBlueprintSource("incident-report-explorer-2") as BlueprintArtifact;
const cells = Object.values(blueprint.payload.cells ?? {}) as CellDefinition[];

describe("incident-report-explorer-2 Blueprint", () => {
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

  it("keeps analysis pending until success or failure settlement", () => {
    expect(blueprint.payload.runtime?.state?.incident2).toMatchObject({ analysisPending: false });
    expect(blueprint.payload.recipes[0].representations
      .filter(({ id }) => id === "operational" || id === "brief")
      .map(({ views }) => views["incident-semantic-analyzer"]?.bindings)).toEqual([
      expect.objectContaining({ pending: { from: "incident2.analysisPending" } }),
      expect.objectContaining({ pending: { from: "incident2.analysisPending" } }),
    ]);
    expect(blueprint.payload.cells?.["incident-semantic-analyzer"]?.behavior?.events?.analyze).toEqual([
      { do: "assign", target: "incident2.analysisPending", args: { value: true } },
      { do: "invoke", args: { tool: "prepareAnalysis" } },
      { do: "invoke", args: { tool: "analyzeReport" } },
    ]);

    const operation = blueprint.payload.services?.["incident-semantic-analysis"]?.operations.analyzeReport;
    expect(operation?.settlement?.transform).toMatchObject({
      kind: "jsonata",
      expr: expect.stringContaining("'path':'incident2.analysisPending','value':false"),
    });
    expect(operation?.failureSettlement?.transform).toMatchObject({
      kind: "jsonata",
      expr: expect.stringContaining("'path':'incident2.analysisPending','value':false"),
    });
  });

  it("authors valid specs for the imported semantic component provider", () => {
    const operational = blueprint.payload.recipes[0].representations.find(({ id }) => id === "operational");
    const views = operational?.views ?? {};
    const cases = [
      ["incident-verdict", "decision"],
      ["incident-blast-radius", "entity-set"],
      ["incident-timeline", "event-series"],
      ["incident-techniques", "process"],
      ["incident-response", "work-set"],
    ] as const;

    for (const [viewId, definitionId] of cases) {
      const view = views[viewId];
      const dataProp = semanticComponentDefinitions[definitionId].dataProp;
      const props = { ...view.props, [dataProp]: dataProp === "decision" ? {} : [] };
      expect(semanticComponentDefinitions[definitionId].validate(props).ok, viewId).toBe(true);
    }
  });

});