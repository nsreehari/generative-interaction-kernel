import { describe, expect, it } from "vitest";
import {
  analyzeCellComposition,
  materializeBlueprint,
  runMaterializedTransition,
  type BlueprintArtifact,
  type CellDefinition,
} from "@gik/blueprint";
import { InMemoryStateModel } from "@gik/kernel";

import { openSampleBlueprint, resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";
import { resolveBlueprintInitialContext, resolveBlueprintNative } from "../apps/browser-host/src/runtime/sample-bundles";
import { createBlueprintAgentLifecycle, createBlueprintUseTools } from "../apps/browser-host/src/runtime/blueprint-agent-lifecycle";

const blueprint = resolveSampleBlueprintSource("incident-report-explorer-1a");
const cells = Object.values(blueprint.payload.cells ?? {}) as unknown as CellDefinition[];

describe("incident-report-explorer-1a Blueprint", () => {
  it("declares UBX material without claiming customization or authoring authority", () => {
    expect(blueprint.payload.agentLifecycle.profiles.use).toMatchObject({
      id: "use-blueprint",
      version: "1.0.0",
      targetKinds: ["blueprint-instance", "incident-report"],
      intentKinds: ["select-sample", "save-report", "improve-report"],
      constraints: expect.arrayContaining([
        "Do not propose structural changes to this fixed Blueprint.",
      ]),
    });
    expect(blueprint.payload.agentLifecycle.profiles).not.toHaveProperty("customize");
    expect(blueprint.payload.agentLifecycle.profiles).not.toHaveProperty("author");
  });

  it("binds UBX tools to the active host without applying proposals", async () => {
    const runtime = openSampleBlueprint("incident-report-explorer-1a");
    const state = new InMemoryStateModel(Object.keys(runtime.state));
    state.apply(Object.entries(runtime.state).map(([path, value]) => ({ op: "set" as const, path, value })));
    const tools = createBlueprintUseTools(runtime, state);
    expect(tools.map(({ name }) => name)).toEqual([
      "use_blueprint_manifest", "use_blueprint_discover", "use_blueprint_describe", "use_blueprint_inspect",
      "use_blueprint_validate", "use_blueprint_simulate", "use_blueprint_preflight", "use_blueprint_propose",
    ]);
    const target = { kind: "blueprint-instance", id: runtime.blueprintId, instanceId: runtime.instanceId };
    await expect(Promise.resolve(tools.find(({ name }) => name === "use_blueprint_discover")?.handler({}))).resolves.toMatchObject({
      targets: [target],
    });
    await expect(Promise.resolve(tools.find(({ name }) => name === "use_blueprint_inspect")?.handler(target))).resolves.toMatchObject({
      target,
      state: { incident1a: expect.any(Object) },
    });
    expect(() => tools.find(({ name }) => name === "use_blueprint_inspect")?.handler({
      ...target,
      instanceId: "another-instance",
    })).toThrow(/does not match the active Blueprint instance/);
    const before = structuredClone(state.snapshot());
    await expect(Promise.resolve(tools.find(({ name }) => name === "use_blueprint_propose")?.handler({
      kind: "improve-report",
      target,
      payloadJson: JSON.stringify({ operation: "improveReport" }),
      rationale: "Produce the declared semantic refinement.",
    }))).resolves.toMatchObject({
      status: "admitted",
      proposal: {
        capability: "use-blueprint",
        actions: [{ kind: "improve-report", payload: { operation: "improveReport" } }],
      },
    });
    expect(state.snapshot()).toEqual(before);
  });

  it("applies an admitted proposal settlement exactly once after validation", async () => {
    const runtime = openSampleBlueprint("incident-report-explorer-1a");
    const state = new InMemoryStateModel(["incident1a"]);
    state.apply([{ op: "set", path: "incident1a.refinementPending", value: true }]);
    const lifecycle = createBlueprintAgentLifecycle(runtime, state);
    const propose = lifecycle.tools.find(({ name }) => name === "use_blueprint_propose");
    const receipt = await propose?.handler({
      kind: "improve-report",
      target: { kind: "blueprint-instance", id: runtime.blueprintId, instanceId: runtime.instanceId },
      payloadJson: JSON.stringify({ operation: "improveReport" }),
      rationale: "Complete refinement.",
    }) as { id: string; status: string };
    expect(receipt.status).toBe("admitted");
    const settlement = {
      ops: [
        { op: "set" as const, path: "incident1a.refinementPending", value: false },
        { op: "set" as const, path: "incident1a.model", value: { sections: [] } },
      ],
    };
    await lifecycle.settle?.({ receiptId: receipt.id, settlement });
    await lifecycle.settle?.({ receiptId: receipt.id, settlement: {
      ops: [{ op: "set", path: "incident1a.model", value: { sections: ["duplicate"] } }],
    } });
    expect(state.get("incident1a.refinementPending")).toBe(false);
    expect(state.get("incident1a.model")).toEqual({ sections: [] });
  });

  it("keeps refinement semantic while the authored recipe owns presentation", () => {
    const source = blueprint as unknown as BlueprintArtifact;
    expect(source.payload.tiers.map(({ id }) => id)).toEqual(["incident-report-semantic", "runtime-document"]);
    expect(source.payload.recipes).toHaveLength(1);
    expect(analyzeCellComposition(cells)).toMatchObject({
      externalInputs: ["analysis_as_on", "cached_analysis_report", "incident_report"],
      diagnostics: [],
    });
    expect(Object.keys(source.payload.cells ?? {})).toEqual(["analysis-layout", "report-presentation", "analysis-as-on", "analysis-runner"]);
    expect(source.payload.services).not.toHaveProperty("incident-analysis-cache");

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

  it("materializes the analyzer into an ordered slotted presentation", () => {
    const source = blueprint as unknown as BlueprintArtifact;
    const terminal = materializeBlueprint({ blueprint: source }).payload.terminalBlueprint;
    expect(terminal.payload.tiers).toEqual([{ id: "runtime-document", kind: "runtime-document" }]);
    expect(terminal.payload.recipes).toEqual([]);
    const placements = terminal.payload.projections?.presentation?.placements ?? [];
    expect(terminal.payload.projections?.presentation?.roots).toEqual(["analysis-layout"]);
    expect(placements).toEqual([
      { cell: "analysis-runner", parent: "analysis-layout", slot: "children", order: 0 },
      { cell: "analysis-as-on", parent: "analysis-layout", slot: "children", order: 1 },
      { cell: "report-presentation", parent: "analysis-layout", slot: "children", order: 2 },
    ]);
  });

  it("uses standard container, datetime, narrative, and spinner providers", () => {
    const projectionViews = blueprint.payload.runtime.externals.projectionViews;
    expect(projectionViews).toEqual({
      primitive: { from: "primitive", use: ["container", "datetime"] },
      semantic: { from: "semantic", use: ["narrative"] },
      fluent: { from: "fluent", use: ["spinner"] },
    });
  });

  it("automatically refines once and publishes a fresh analysis report", () => {
    expect(blueprint.payload.runtime.state.incident1a).not.toHaveProperty("analysisRequested");
    expect(blueprint.payload.runtime.state.incident1a).not.toHaveProperty("analysisReport");
    const hosted = blueprint.payload.recipes[0].representations.find(({ id }) => id === "hosted-analysis");
    expect(hosted?.views).toMatchObject({
      "analysis-runner": {
        capability: "fluent:spinner",
        visibility: "systemInputs.numSourcesRunning != 0",
      },
    });
    expect(blueprint.payload.cells["analysis-runner"].behavior).toBeUndefined();
    expect(blueprint.payload.cells["analysis-runner"].sources?.[0]).toMatchObject({
      when: expect.stringContaining("sources.`analysis-runner.source`"),
      input: { expr: "{'incident_report':inputs.incident_report}" },
      output: { expr: "response" },
    });
    expect(blueprint.payload.cells["analysis-runner"].compute).toEqual([
      { id: "analysis-report", expression: "sources.`analysis-runner.source`", assign: "analysisReport" },
    ]);
    expect(blueprint.payload.cells["analysis-runner"].outputs).toEqual([
      { token: "analysis_report", from: "computed.analysisReport", when: "computed.analysisReport != null" },
    ]);
    expect(blueprint.payload.services["incident-report-refinement"].operations.improveReport.settlement.transform.expr)
      .toBe("{'ops':[]}");
    expect(JSON.stringify(blueprint)).not.toContain("cached_analysis_envelope");
  });

  it("invokes the analyzer during initial synchronization when no cache exists", async () => {
    const materialized = materializeBlueprint({
      blueprint: blueprint as unknown as BlueprintArtifact,
    });
    const result = await runMaterializedTransition({
      materializedBlueprint: materialized,
      state: {
        ...materialized.payload.initialState,
        incident_report: "# Incident",
        cached_analysis_report: null,
        analysis_as_on: null,
      },
      events: [],
    });
    expect(result.state.incident1a).not.toHaveProperty("analysisRequested");
    expect(result.effects).toEqual([
      expect.objectContaining({
        kind: "invoke",
        control: expect.objectContaining({
          tool: "improveReport",
          sourceId: "analysis-runner.source",
          sourceCellId: "analysis-runner",
        }),
      }),
    ]);
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

  it("starts without shell-owned source state or Blueprint-local native providers", () => {
    const context = resolveBlueprintInitialContext("incident-report-explorer-1a");
    expect(context.initialSeed.incident1a).not.toHaveProperty("analysisReport");
    expect(context.initialSeed.incident1a).not.toHaveProperty("content");
    expect(context.initialSeed.incident1a).not.toHaveProperty("selectedSampleId");
    expect(resolveBlueprintNative("incident-report-explorer-1a")).toMatchObject({
      effectHandlers: undefined,
      projectionViews: undefined,
    });
  });
});
