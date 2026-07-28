import { describe, expect, it } from "vitest";
import { InMemoryStateModel } from "@gik/kernel";
import {
  analyzeCellImpact,
  analyzeExploration,
  assembleBlueprint,
  compileCellTopology,
  createBlueprint,
  defineLoweringCell,
  defineExploration,
  inspectExploration,
  lowerBlueprint,
  parseBlueprintJson,
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
});