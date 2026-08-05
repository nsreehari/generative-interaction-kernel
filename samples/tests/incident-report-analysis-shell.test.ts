import { describe, expect, it } from "vitest";
import shellJson from "../blueprints/incident-report-analysis-shell/blueprint.json" with { type: "json" };
import explorer1aHandlers from "../blueprints/incident-report-explorer-1a/native/effect_handlers/incidentReportExplorer1aEffectHandlers";
import explorer2Handlers from "../blueprints/incident-report-explorer-2/native/effect_handlers/incidentReportExplorer2EffectHandlers";
import explorer3Handlers from "../blueprints/incident-report-explorer-3/native/effect_handlers/incidentReportExplorer3EffectHandlers";
import { openSampleBlueprint, resolveSampleBlueprintSource } from "../shared/blueprints";
import { evalAsyncJsonata } from "../../packages/evaluators/src/evaluators";

const shell = shellJson.payload;

describe("incident report hosted analysis shell", () => {
  it("hosts each state-described Blueprint independently in comparison and show-all layouts", () => {
    expect(shell.runtime.state.incident1a.blueprint).toEqual([
      { id: "analysis-1a", label: "Semantic refinement", $ref: "blueprint:incident-report-explorer-1a@1.0.0" },
      { id: "analysis-2", label: "Operational model", $ref: "blueprint:incident-report-explorer-2@1.0.0" },
      { id: "analysis-3", label: "Source-faithful views", $ref: "blueprint:incident-report-explorer-3@1.0.0" },
    ]);
    const expectedRefs = [
      "blueprint:incident-report-explorer-1a@1.0.0",
      "blueprint:incident-report-explorer-2@1.0.0",
      "blueprint:incident-report-explorer-3@1.0.0",
    ];
    for (const side of ["left", "right"] as const) {
      const ids = ["analysis-1a", "analysis-2", "analysis-3"].map((analysis) => `${side}-${analysis}`);
      expect(ids.map((id) => shell.cells[id].blueprint.$ref)).toEqual(expectedRefs);
      expect(ids.map((id) => shell.cells[id].view.capability)).toEqual([
        "host:hosted-blueprint", "host:hosted-blueprint", "host:hosted-blueprint",
      ]);
      expect(ids.map((id) => shell.cells[id].view.visibility)).toEqual([
        `incident1a.${side}Selection = 'analysis-1a'`,
        `incident1a.${side}Selection = 'analysis-2'`,
        `incident1a.${side}Selection = 'analysis-3'`,
      ]);
    }
    expect(shell.cells["left-analysis-1a"].id).not.toBe(shell.cells["right-analysis-1a"].id);
    const allIds = ["all-three-analysis-0", "all-three-analysis-1", "all-three-analysis-2"];
    expect(allIds.map((id) => shell.cells[id].blueprint.$ref)).toEqual(expectedRefs);
    expect(new Set([
      shell.cells["left-analysis-1a"].id,
      shell.cells["right-analysis-1a"].id,
      shell.cells["all-three-analysis-0"].id,
    ]).size).toBe(3);
    expect(shell.projections.presentation.roots).toEqual(["incident-shell"]);
  });

  it("derives both comparison selectors from source plus initial-state Blueprint descriptors", async () => {
    expect(shell.runtime.state.incident1a).toMatchObject({
      leftSelection: "source",
      rightSelection: "analysis-1a",
      showAllThree: false,
    });
    expect(shell.cells["incident-shell"].view).toMatchObject({
      capability: "primitive:container",
      props: { variant: "column", fill: true },
    });
    expect(shell.cells["workbench-heading"].view).toMatchObject({
      capability: "fluent:text",
      props: { as: "h1", variant: "title", value: "Incident report analysis workbench" },
    });
    const optionsExpression = "[{'value':'source','label':'Source report'},{'value':incident1a.blueprint[0].id,'label':incident1a.blueprint[0].label},{'value':incident1a.blueprint[1].id,'label':incident1a.blueprint[1].label},{'value':incident1a.blueprint[2].id,'label':incident1a.blueprint[2].label}]";
    expect(await evalAsyncJsonata(optionsExpression, shell.runtime.state)).toEqual([
      { value: "source", label: "Source report" },
      { value: "analysis-1a", label: "Semantic refinement" },
      { value: "analysis-2", label: "Operational model" },
      { value: "analysis-3", label: "Source-faithful views" },
    ]);
    expect(shell.cells["left-view-selector"]).toMatchObject({
      view: { capability: "fluent:dropdown", bindings: { options: { expression: optionsExpression }, value: { from: "incident1a.leftSelection" } } },
      behavior: { events: { select: [{ do: "assign", target: "incident1a.leftSelection", args: { from: "$event.value" } }] } },
    });
    expect(shell.cells["right-view-selector"]).toMatchObject({
      view: { capability: "fluent:dropdown", bindings: { options: { expression: optionsExpression }, value: { from: "incident1a.rightSelection" } } },
      behavior: { events: { select: [{ do: "assign", target: "incident1a.rightSelection", args: { from: "$event.value" } }] } },
    });
    expect(optionsExpression).not.toContain("$map");
    expect(shell.cells["show-all-three-switch"]).toMatchObject({
      view: {
        capability: "fluent:switch",
        props: { label: "Show all three", ariaLabel: "Show all three analyses" },
        bindings: { checked: { from: "incident1a.showAllThree" } },
      },
      behavior: { events: { toggle: [{ do: "assign", target: "incident1a.showAllThree", args: { from: "$event.checked" } }] } },
    });
    expect(shell.cells["comparison-row"].view.visibility).toBe("$not(incident1a.showAllThree)");
    expect(shell.cells["all-three-row"].view.visibility).toBe("incident1a.showAllThree");
    expect(await evalAsyncJsonata(shell.cells["comparison-row"].view.visibility, shell.runtime.state)).toBe(true);
    expect(await evalAsyncJsonata(shell.cells["all-three-row"].view.visibility, shell.runtime.state)).toBe(false);
    const showAllState = structuredClone(shell.runtime.state);
    showAllState.incident1a.showAllThree = true;
    expect(await evalAsyncJsonata(shell.cells["comparison-row"].view.visibility, showAllState)).toBe(false);
    expect(await evalAsyncJsonata(shell.cells["all-three-row"].view.visibility, showAllState)).toBe(true);
    expect(shell.projections.presentation.placements).toEqual(expect.arrayContaining([
      { cell: "workbench-heading", parent: "incident-shell", slot: "children", order: 0 },
      { cell: "source-selector-row", parent: "incident-shell", slot: "children", order: 1 },
      { cell: "comparison-row", parent: "incident-shell", slot: "children", order: 2 },
      { cell: "all-three-row", parent: "incident-shell", slot: "children", order: 3 },
      { cell: "source-selector-control", parent: "source-selector-row", slot: "children", order: 0 },
      { cell: "show-all-three-switch", parent: "source-selector-row", slot: "children", order: 1 },
      { cell: "source-report-selector", parent: "source-selector-control", slot: "children", order: 0 },
      { cell: "left-column", parent: "comparison-row", slot: "children", order: 0 },
      { cell: "right-column", parent: "comparison-row", slot: "children", order: 1 },
      { cell: "left-source", parent: "left-column", slot: "children", order: 1 },
      { cell: "right-source", parent: "right-column", slot: "children", order: 1 },
      { cell: "all-three-column-0", parent: "all-three-row", slot: "children", order: 0 },
      { cell: "all-three-column-1", parent: "all-three-row", slot: "children", order: 1 },
      { cell: "all-three-column-2", parent: "all-three-row", slot: "children", order: 2 },
    ]));
    expect(shell.cells["source-report-selector"].outputs).toEqual([
      { token: "source-content", from: "incident1a.content", schema: { type: "string" } },
    ]);
    const sourceInput = [{ token: "source-content", as: "content", required: true, schema: { type: "string" } }];
    expect(shell.cells["left-column"].inputs).toEqual(sourceInput);
    expect(shell.cells["right-column"].inputs).toEqual(sourceInput);
    for (const id of [
      "left-source", "right-source",
      "left-analysis-1a", "left-analysis-2", "left-analysis-3",
      "right-analysis-1a", "right-analysis-2", "right-analysis-3",
      "all-three-column-0", "all-three-column-1", "all-three-column-2",
      "all-three-analysis-0", "all-three-analysis-1", "all-three-analysis-2",
    ]) {
      expect(shell.cells[id].inputs).toEqual(sourceInput);
    }
    for (const index of [0, 1, 2]) {
      expect(shell.cells[`all-three-heading-${index}`].view).toMatchObject({
        capability: "fluent:text",
        bindings: { value: { expression: `incident1a.blueprint[${index}].label` } },
      });
      expect(shell.cells[`all-three-analysis-${index}`].view.bindings.content).toEqual({ from: "incident1a.content" });
    }
    expect(shell.cells["left-source-markdown"].view).toMatchObject({
      capability: "primitive:markdown",
      bindings: { value: { from: "incident1a.content" } },
    });
    expect(shell.cells["right-source-markdown"].view).toMatchObject({
      capability: "primitive:markdown",
      bindings: { value: { from: "incident1a.content" } },
    });
    expect(shell.cells["left-source-heading"].view).toMatchObject({ capability: "fluent:text", props: { as: "h2", value: "Source report" } });
    expect(shell.cells["right-source-heading"].view).toMatchObject({ capability: "fluent:text", props: { as: "h2", value: "Source report" } });
    expect(shell.runtime.capabilities).not.toHaveProperty("primitive:form");
    expect(shell.runtime.capabilities).not.toHaveProperty("ui:screen");
    expect(shell.runtime.capabilities).not.toHaveProperty("ui:row");
    expect(shell.runtime.capabilities).not.toHaveProperty("ui:col");
    expect(shell.runtime.capabilities).not.toHaveProperty("fluent:button");
    expect(shell.runtime.externals.effectHandlers).toEqual(["selectSampleReport"]);
    expect(Object.keys(shell.runtime.capabilities).some((capability) => capability.startsWith("ui:"))).toBe(false);
    expect(shell.runtime.externals.projectionViews).not.toHaveProperty("ui");
    expect(Object.keys(shell.cells).some((id) => id.includes("edit") || id.includes("form"))).toBe(false);
    expect(shell.cells).not.toHaveProperty("analysis-tabs");
    expect(shell.cells).not.toHaveProperty("source-dialog");
    expect(shell.cells).not.toHaveProperty("open-source-report");
    expect(shell.runtime.externals.projectionViews).not.toHaveProperty("shell");
  });

  it.each([
    ["incident-report-explorer-1a", "incident-report-refinement", "incident1a", "refinementPending", "incident-refinement"],
    ["incident-report-explorer-2", "incident-semantic-analysis", "incident2", "analysisPending", "incident-semantic-analyzer"],
    ["incident-report-explorer-3", "incident-semantic-analysis", "incident3", "analysisPending", "incident-semantic-analyzer"],
  ])("materializes %s as a self-owned hosted analysis", (id, serviceId, namespace, pendingKey, resultCell) => {
    const source = resolveSampleBlueprintSource(id);
    expect(source.payload.interface?.inputs?.content).toMatchObject({ required: true, schema: { type: "string" } });
    expect(source.payload.agentLifecycle?.profiles.use).toBeDefined();
    expect(source.payload.services?.[serviceId]).toBeDefined();
    expect(source.payload.runtime.state?.[namespace]).toMatchObject({ [pendingKey]: false });
    const operation = Object.values(source.payload.services?.[serviceId]?.operations ?? {})[0];
    expect(operation?.settlement).toBeDefined();
    expect(operation?.failureSettlement).toBeDefined();

    const runtime = openSampleBlueprint(id, { hostedAnalysis: true, content: "# Hosted incident" });
    expect(runtime.blueprintId).toBe(id);
    expect(runtime.definition.payload.projections?.presentation?.roots).toEqual(["foundry-access-gate"]);
    expect(runtime.definition.payload.projections?.presentation?.placements?.some(({ cell }) => cell === resultCell)).toBe(true);
    expect(runtime.definition.payload.projections?.presentation?.placements?.some(({ cell }) => cell.includes("source") || cell === "incident-report")).toBe(false);
  });

  it("materializes the registered parent shell", () => {
    const runtime = openSampleBlueprint("incident-report-analysis-shell");
    expect(runtime.blueprintId).toBe("incident-report-analysis-shell");
    expect(runtime.definition.payload.projections?.presentation?.roots).toEqual(["incident-shell"]);
  });

  it.each([
    [explorer1aHandlers, "prepareRefinement", "incident1a.pendingContent"],
    [explorer2Handlers, "prepareAnalysis", "incident2.pendingContent"],
    [explorer3Handlers, "prepareAnalysis", "incident3.pendingContent"],
  ])("uses immutable hosted content in %s", async (handlers, handlerId, pendingPath) => {
    const handler = handlers[handlerId];
    const result = await handler({
      payload: {},
      get: (path: string) => path === "externalContext.content" ? "# Hosted source" : "# Standalone source",
      set: (path: string, value: unknown) => ({ op: "set", path, value }),
    } as never);
    expect(result).toMatchObject({
      ops: expect.arrayContaining([{ op: "set", path: pendingPath, value: "# Hosted source" }]),
    });
  });
});