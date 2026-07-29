import { describe, expect, it } from "vitest";
import { InMemoryStateModel } from "@gik/kernel";
import {
  analyzeCellImpact,
  analyzeExploration,
  admitAdaptiveProgramPatch,
  admitBlueprintPatch,
  applyBlueprintPatch,
  applyBlueprintPatches,
  assembleBlueprint,
  compileCellTopology,
  createBlueprintDurableTransitionAdapter,
  createBlueprint,
  defineLoweringCell,
  defineExploration,
  inspectExploration,
  lowerBlueprint,
  materializeBlueprint,
  parseBlueprintJson,
  runMaterializedTransition,
  runTransition,
  stringifyBlueprint,
  tokenPattern,
  validateBlueprintArtifact,
  type BlueprintArtifact,
} from "../src/index";

const runtime = {
  version: "test/1",
  capabilities: {},
};

function blueprint(id = "test"): BlueprintArtifact {
  return createBlueprint({
    id,
    kind: "test",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime,
  });
}

describe("@gik/blueprint", () => {
  it("creates, serializes, and parses a Blueprint artifact", () => {
    const artifact = blueprint();
    expect(parseBlueprintJson(stringifyBlueprint(artifact))).toEqual(artifact);
  });

  it.each(["fixed", "reconfigurable", "adaptive"] as const)(
    "round-trips the %s Blueprint structure mode",
    (structureMode) => {
      const artifact = createBlueprint({ ...blueprint().payload, structureMode });
      expect(parseBlueprintJson(stringifyBlueprint(artifact)).payload.structureMode).toBe(structureMode);
    },
  );

  it("enforces fixed and authorized reconfigurable structure modes", () => {
    const fixed = createBlueprint({ ...blueprint().payload, structureMode: "fixed" });
    const reconfigurable = createBlueprint({ ...blueprint().payload, structureMode: "reconfigurable" });
    const patch = [{ op: "addCell" as const, cell: { id: "added" } }];

    expect(admitBlueprintPatch(fixed, { origin: "authorized", patch })).toEqual({
      accepted: false,
      reason: "fixed-structure",
    });
    expect(admitBlueprintPatch(reconfigurable, { origin: "runtime", patch })).toEqual({
      accepted: false,
      reason: "authorization-required",
    });
    expect(admitBlueprintPatch(reconfigurable, { origin: "authorized", patch }).accepted).toBe(true);
    expect(applyBlueprintPatch(reconfigurable, patch).payload.cells?.added.id).toBe("added");
  });

  it("admits adaptive Blueprint and program patches only through authored policy", () => {
    const adaptive = createBlueprint({
      ...blueprint().payload,
      structureMode: "adaptive",
      structurePolicy: {
        allowedBlueprintOperations: ["addCell"],
        allowedProgramOperations: ["setRoot"],
      },
    });
    const add = [{ op: "addCell" as const, cell: { id: "added" } }];
    const remove = [{ op: "removeCell" as const, cellId: "added" }];

    expect(admitBlueprintPatch(adaptive, { origin: "runtime", patch: add }).accepted).toBe(true);
    expect(admitBlueprintPatch(adaptive, { origin: "runtime", patch: remove })).toEqual({
      accepted: false,
      reason: "policy-rejected",
    });
    expect(admitAdaptiveProgramPatch(adaptive, [{ op: "setRoot", root: { capability: "surface", id: "next" } }])).not.toBe(false);
    expect(admitAdaptiveProgramPatch(adaptive, [{ op: "removeRoot" }])).toBe(false);
  });

  it("parks nested child Blueprint mutations while preserving assembled children", () => {
    const parent = createBlueprint({ ...blueprint("parent").payload, structureMode: "reconfigurable" });
    expect(() => applyBlueprintPatch(parent, [{
      op: "addCell",
      cell: { id: "child", blueprint: { inline: blueprint("child") } },
    }])).toThrow("Nested child Blueprint mutations are not supported");
  });

  it("assembles referenced child Blueprints without mutating the source", () => {
    const child = blueprint("child");
    const parent = createBlueprint({
      ...blueprint("parent").payload,
      cells: {
        child: { id: "child", blueprint: { $ref: "./child.blueprint.json" } },
      },
    });

    const assembled = assembleBlueprint(parent, (ref, context) => {
      expect(ref).toBe("./child.blueprint.json");
      expect(context).toEqual({ parentBlueprintId: "parent", cellId: "child" });
      return child;
    });

    expect(assembled.payload.cells?.child.blueprint).toEqual({ inline: child });
    expect(parent.payload.cells?.child.blueprint).toEqual({ $ref: "./child.blueprint.json" });
  });

  it("rejects invalid tier and lowering recipe references", () => {
    const artifact = {
      ...blueprint(),
      payload: {
        ...blueprint().payload,
        recipes: [{
          id: "missing",
          from: "domain",
          to: "runtime",
          metadata: { executor: "test" },
        }],
      },
    };
    expect(() => validateBlueprintArtifact(artifact)).toThrow("unknown tier 'domain'");
  });

  it("uses tier terminology for Lowering Cells", () => {
    expect(defineLoweringCell({
      id: "domain-to-runtime",
      kind: "transform",
      fromTier: "domain",
      toTier: "runtime",
    })).toMatchObject({ fromTier: "domain", toTier: "runtime" });
  });

  it("retains Cell token composition behavior", () => {
    expect(tokenPattern("holding:$TICKER").match("holding:AAPL")).toEqual({ TICKER: "AAPL" });
    expect(compileCellTopology("prices", {
      holdings: { id: "holdings", outputs: [{ token: "holding" }] },
      prices: { id: "prices", inputs: [{ token: "holding" }] },
    }).edges).toEqual([{
      token: "holding",
      providerCellId: "holdings",
      consumerCellId: "prices",
    }]);
  });

  it("analyzes downstream Cell impact without mutating topology", () => {
    const topology = compileCellTopology("portfolio", {
      portfolio: { id: "portfolio", outputs: [{ token: "portfolio" }] },
      gains: { id: "gains", inputs: [{ token: "portfolio" }], outputs: [{ token: "gains" }] },
      prices: { id: "prices", inputs: [{ token: "portfolio" }], outputs: [{ token: "prices" }] },
      recommendation: {
        id: "recommendation",
        inputs: [{ token: "gains" }, { token: "prices" }],
      },
    });

    expect(analyzeCellImpact(topology, { changedCells: ["portfolio"] })).toEqual({
      changedCells: ["portfolio"],
      affectedCells: ["gains", "prices", "recommendation"],
      stages: [["gains", "prices"], ["recommendation"]],
      blockers: [],
    });
    expect(topology.cells).toHaveLength(4);
  });

  it("reports Cell impact blockers and rejects unknown Cells", () => {
    const topology = compileCellTopology("portfolio", {
      portfolio: { id: "portfolio", outputs: [{ token: "portfolio" }] },
      gains: { id: "gains", inputs: [{ token: "portfolio" }], outputs: [{ token: "gains" }] },
      prices: { id: "prices", inputs: [{ token: "portfolio" }], outputs: [{ token: "prices" }] },
      recommendation: {
        id: "recommendation",
        inputs: [{ token: "gains" }, { token: "prices" }],
      },
    });

    expect(analyzeCellImpact(topology, { changedCells: ["gains"] }).blockers).toEqual([
      { cellId: "recommendation", waitingOn: ["prices"] },
    ]);
    expect(() => analyzeCellImpact(topology, { changedCells: ["missing"] })).toThrow("Unknown Cell 'missing'");
  });

  it("analyzes an exploration snapshot without owning Blueprint state", () => {
    const exploration = defineExploration({
      id: "education",
      nodes: {
        tenthComplete: { id: "tenthComplete", unlocks: ["chooseStream"] },
        engineering: { id: "engineering" },
        medicine: { id: "medicine" },
      },
      choices: {
        chooseStream: {
          id: "chooseStream",
          label: "Choose stream",
          requires: ["tenthComplete"],
          options: [
            { id: "mpc", label: "MPC", unlocks: ["engineering"] },
            { id: "bpc", label: "BPC", unlocks: ["medicine"] },
          ],
        },
      },
    });

    expect(analyzeExploration(exploration, {
      completed: ["tenthComplete"],
      selections: { chooseStream: "mpc" },
    })).toMatchObject({
      unlocked: ["chooseStream", "engineering", "tenthComplete"],
      availableChoices: [{ id: "chooseStream" }],
    });
    expect(inspectExploration(exploration).edges).toContainEqual({
      from: "chooseStream",
      to: "engineering",
      kind: "option",
      optionId: "mpc",
    });
  });

  it("rejects invalid exploration definitions and state", () => {
    expect(() => defineExploration({
      id: "invalid",
      nodes: { start: { id: "start", unlocks: ["missing"] } },
      choices: {},
    })).toThrow("unknown participant 'missing'");

    const exploration = defineExploration({
      id: "choice",
      nodes: { start: { id: "start" }, result: { id: "result" } },
      choices: {
        choose: {
          id: "choose",
          label: "Choose",
          requires: ["start"],
          options: [{ id: "one", label: "One", unlocks: ["result"] }],
        },
      },
    });
    expect(() => analyzeExploration(exploration, {
      completed: [],
      selections: { choose: "one" },
    })).toThrow("choice 'choose' is not available");
  });

  it("lowers a headless Blueprint through Kernel validation", () => {
    const message = lowerBlueprint(blueprint(), () => ({
      graph: {
        inputs: ["request"],
        outputs: ["response"],
        nodes: [{
          id: "respond",
          inputs: { request: "request" },
          outputs: { response: "response" },
          operation: { kind: "compute", expression: "$inputs.request" },
        }],
      },
    }));

    expect(message.type).toBe("program");
    expect(message.payload.graph?.nodes[0].id).toBe("respond");
  });

  it("lowers a projected Blueprint through the same Kernel path", () => {
    const message = lowerBlueprint(blueprint(), () => ({
      root: { id: "root", capability: "screen" },
    }));

    expect(message.payload.root).toEqual({ id: "root", capability: "screen" });
  });

  it("runs events through the canonical Blueprint transition engine", async () => {
    const artifact = createBlueprint({
      id: "counter",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { namespaces: ["counter"], contexts: ["shared"], capabilities: {} },
      cells: {
        root: {
          id: "root",
          view: { capability: "screen" },
          behavior: {
            events: {
              increment: [
                { do: "assign", target: "counter.value", args: { value: 2 } },
                { do: "assign", target: "shared.value", args: { value: "updated" } },
              ],
            },
          },
        },
      },
      projections: { presentation: { roots: ["root"] } },
    });
    const shared = new InMemoryStateModel(["shared"]);
    shared.apply([{ op: "set", path: "shared.value", value: "initial" }]);

    const result = await runTransition({
      blueprint: artifact,
      state: { counter: { value: 1 } },
      events: [{ node: "root", name: "increment" }],
      contexts: { shared },
    });

    expect(result).toEqual({ state: { counter: { value: 2 } } });
    expect(shared.snapshot()).toEqual({ shared: { value: "updated" } });
  });

  it("materializes deterministically into a portable value and runs the trusted fast path", async () => {
    const artifact = createBlueprint({
      id: "materialized-counter",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { namespaces: ["counter"], capabilities: {}, state: { counter: { value: 1 } } },
      cells: {
        root: {
          id: "root",
          view: { capability: "screen" },
          behavior: {
            events: {
              increment: [{ do: "assign", target: "counter.value", args: { from: "externalContext.policy.nextValue" } }],
            },
          },
        },
      },
      projections: { presentation: { roots: ["root"] } },
    });
    const externalContext = { policy: { nextValue: 2 } };
    const first = materializeBlueprint({ blueprint: artifact, externalContext });
    const second = materializeBlueprint({ blueprint: artifact, externalContext });

    expect(JSON.parse(JSON.stringify(first))).toEqual(second);
    externalContext.policy.nextValue = 99;
    const result = await runMaterializedTransition({
      materializedBlueprint: first,
      state: first.payload.initialState,
      events: [{ node: "root", name: "increment" }],
    });
    expect(result.state).toEqual({ counter: { value: 2 } });
  });

  it("keeps externalContext read-only and outside returned mutable state", async () => {
    const artifact = createBlueprint({
      id: "context-write",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { namespaces: ["local"], capabilities: {}, state: { local: {} } },
      cells: {
        root: {
          id: "root",
          view: { capability: "screen" },
          behavior: {
            events: {
              mutate: [{ do: "assign", target: "externalContext.policy.allowed", args: { value: false } }],
            },
          },
        },
      },
      projections: { presentation: { roots: ["root"] } },
    });
    const materializedBlueprint = materializeBlueprint({
      blueprint: artifact,
      externalContext: { policy: { allowed: true } },
    });

    await expect(runMaterializedTransition({
      materializedBlueprint,
      state: materializedBlueprint.payload.initialState,
      events: [{ node: "root", name: "mutate" }],
    })).rejects.toThrow("externalContext is read-only");
    expect(materializedBlueprint.payload.initialState).toEqual({ local: {} });
  });

  it("applies semantic patches to the authored Blueprint and rematerializes", () => {
    const artifact = createBlueprint({
      id: "reconfigurable",
      kind: "runtime-blueprint",
      version: "1",
      structureMode: "reconfigurable",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { capabilities: {}, state: {} },
      cells: { root: { id: "root", view: { capability: "screen" } } },
      projections: { presentation: { roots: ["root"] } },
    });
    const applied = applyBlueprintPatches({
      blueprint: artifact,
      externalContext: { tenant: "one" },
      state: {},
      origin: "authorized",
      patch: [{ op: "addCell", cell: { id: "added" } }],
    });

    expect(artifact.payload.cells?.added).toBeUndefined();
    expect(applied.blueprint.payload.cells?.added?.id).toBe("added");
    expect(applied.materializedBlueprint.payload.terminalBlueprint).toEqual(applied.blueprint);
    expect(applied.materializedBlueprint.payload.externalContext).toEqual({ tenant: "one" });
  });

  it("provides a portable adapter spec for stateless durable transition hosts", async () => {
    const artifact = createBlueprint({
      id: "durable-counter",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { namespaces: ["counter"], capabilities: {}, state: { counter: { value: 1 } } },
      cells: {
        root: {
          id: "root",
          view: { capability: "screen" },
          behavior: {
            events: {
              increment: [{ do: "assign", target: "counter.value", args: { from: "externalContext.nextValue" } }],
            },
          },
        },
      },
      projections: { presentation: { roots: ["root"] } },
    });
    const adapter = createBlueprintDurableTransitionAdapter({
      blueprint: artifact,
      externalContext: { nextValue: 2 },
    });
    const spec = JSON.parse(JSON.stringify(adapter.initialSpec()));
    const result = await adapter.transition({
      spec,
      state: adapter.initialState(),
      events: [{ node: "root", name: "increment" }],
    });

    expect(result.state).toEqual({ counter: { value: 2 } });
    expect(result.effects).toEqual([]);
    expect(adapter.applySpecUpdates({ spec, updates: [] })).toEqual(spec);
  });
});