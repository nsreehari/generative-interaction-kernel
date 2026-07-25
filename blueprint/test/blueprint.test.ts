import { describe, expect, it } from "vitest";
import {
  assembleBlueprint,
  compileCellTopology,
  createBlueprint,
  defineLoweringCell,
  lowerBlueprint,
  parseBlueprintJson,
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
    tiers: [{ id: "runtime", kind: "runtime-document" }],
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
});