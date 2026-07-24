import { describe, expect, it } from "vitest";
import {
  analyzeCellComposition,
  compileCellTopology,
  composeCellDocument,
  tokenPattern,
} from "../src/cells";
import { validateBlueprintArtifact } from "../src/schema";
import { assembleBlueprint } from "../src/blueprint";

describe("Blueprint cells", () => {
  it("matches literal and parameterized tokens", () => {
    expect(tokenPattern("portfolio-summary").match("portfolio-summary")).toEqual({});
    expect(tokenPattern("holding:$TICKER").match("holding:AAPL")).toEqual({ TICKER: "AAPL" });
    expect(tokenPattern("holding:$TICKER").match("quote:AAPL")).toBeUndefined();
  });

  it("resolves unique providers and derives external inputs", () => {
    const result = analyzeCellComposition([
      { id: "holdings", outputs: [{ token: "holding:$TICKER" }] },
      {
        id: "market-prices",
        inputs: [{ token: "holding:$TICKER" }],
        outputs: [{ token: "quote:$TICKER" }],
      },
      {
        id: "intelligence",
        inputs: [{ token: "quote:$TICKER" }, { token: "investor-profile" }],
        outputs: [{ token: "portfolio-intelligence" }],
      },
    ]);

    expect(result.providers).toEqual({
      "holding:$TICKER": "holdings",
      "portfolio-intelligence": "intelligence",
      "quote:$TICKER": "market-prices",
    });
    expect(result.externalInputs).toEqual(["investor-profile"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports duplicate ids, invalid patterns, and ambiguous providers", () => {
    const result = analyzeCellComposition([
      { id: "quotes", outputs: [{ token: "quote:$TICKER" }] },
      { id: "quotes", outputs: [{ token: "quote:$TICKER" }, { token: "quote:$" }] },
    ]);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "duplicate-cell-id",
      "invalid-token-pattern",
      "ambiguous-provider",
    ]);
  });

  it("derives topology from normalized authored cells", () => {
    const organism = {
      cells: {
        root: { id: "root", view: { capability: "screen" } },
        "foundry-access": {
          id: "foundry-access",
          outputs: [{
            token: "foundry-access",
            from: "state.accessCapability",
            when: "state.accessStatus = 'ready'",
          }],
          view: { capability: "access-gate" },
        },
        "foundry-chat": {
          id: "foundry-chat",
          inputs: [{ token: "foundry-access" }],
          view: { capability: "chat" },
        },
      },
      projections: {
        presentation: {
          roots: ["root"],
          placements: [
            { cell: "foundry-access", parent: "root", order: 0 },
            { cell: "foundry-chat", parent: "foundry-access", order: 0 },
          ],
        },
      },
    } as const;
    const result = compileCellTopology("foundry-agent", organism);

    expect(result.edges).toEqual([{
      token: "foundry-access",
      providerCellId: "foundry-access",
      consumerCellId: "foundry-chat",
    }]);
    expect(result.cells.map((cell) => cell.id)).toEqual(["root", "foundry-access", "foundry-chat"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports invalid value-bearing outputs", () => {
    const result = compileCellTopology("invalid", {
      cells: {
        producer: {
          id: "producer",
          outputs: [{ token: "value", from: "" }],
          view: { capability: "source" },
        },
      },
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["invalid-output-binding"]);
  });

  it("compiles presentation while stripping Cell dataflow metadata", () => {
    const organism = {
      cells: {
        root: { id: "root", view: { capability: "screen" } },
        access: {
          id: "access",
          outputs: [{ token: "access" }],
          view: { capability: "access-gate" },
        },
        chat: {
          id: "chat",
          inputs: [{ token: "access" }],
          view: { capability: "chat" },
        },
      },
      projections: {
        presentation: {
          roots: ["root"],
          placements: [
            { cell: "access", parent: "root", order: 0 },
            { cell: "chat", parent: "access", order: 0 },
          ],
        },
      },
    } as const;
    const document = composeCellDocument(organism, compileCellTopology("access-chat", organism));

    expect(document.root.edges?.children).toEqual([{
      id: "access",
      capability: "access-gate",
      edges: { children: [{ id: "chat", capability: "chat" }] },
    }]);
  });

  it("lowers Cell computations into kernel standing derivations", () => {
    const organism = {
      cells: {
        summary: {
          id: "summary",
          compute: [{
            id: "market-value",
            expression: "portfolio.quantity * portfolio.price",
            assign: "portfolio.marketValue",
            dependencies: ["portfolio.quantity", "portfolio.price"],
          }],
          view: { capability: "summary" },
        },
      },
      projections: { presentation: { roots: ["summary"] } },
    } as const;

    const document = composeCellDocument(organism, compileCellTopology("portfolio", organism));

    expect(document.derivations).toEqual([{
      id: "summary-market-value",
      target: "portfolio.marketValue",
      expression: "portfolio.quantity * portfolio.price",
      dependencies: ["portfolio.quantity", "portfolio.price"],
    }]);
  });

  it("lowers an externally sourced cell with a local refresh action", () => {
    const organism = {
      cells: {
        "market-prices": {
          id: "market-prices",
          sources: [{
            id: "market-prices.source",
            service: "portfolio-market-data",
            operation: "refreshPrices",
            contract: "portfolio-quotes/v1",
          }],
          view: {
            capability: "table",
            props: { label: "Market prices" },
          },
        },
      },
      projections: { presentation: { roots: ["market-prices"] } },
    } as const;
    const document = composeCellDocument(organism, compileCellTopology("market-prices", organism));

    expect(document.root.props).toEqual({
      label: "Market prices",
      externalSource: { refreshEvent: "refresh" },
    });
    expect(document.root.edges?.on?.refresh).toEqual([{
      do: "invoke",
      args: { tool: "refreshPrices" },
    }]);
  });

  it("accepts a Cell implemented by an inline child Blueprint", () => {
    const child = {
      gik: "0.1",
      type: "blueprint",
      payload: {
        id: "child",
        kind: "test",
        version: "1",
        tiers: [{ id: "runtime", kind: "runtime-document" }],
        recipes: [],
        cells: {
          root: { id: "root", view: { capability: "child-view" } },
        },
        projections: { presentation: { roots: ["root"] } },
        runtime: { capabilities: {} },
      },
    } as const;
    const parent = {
      gik: "0.1",
      type: "blueprint",
      payload: {
        id: "parent",
        kind: "test",
        version: "1",
        tiers: [{ id: "runtime", kind: "runtime-document" }],
        recipes: [],
        cells: {
          child: {
            id: "child",
            blueprint: { inline: child },
            view: { capability: "blueprint-host" },
          },
        },
        projections: { presentation: { roots: ["child"] } },
        runtime: { capabilities: {} },
      },
    } as const;

    expect(() => validateBlueprintArtifact(parent)).not.toThrow();
  });

  it("assembles referenced child Blueprints into a self-contained artifact", () => {
    const child = {
      gik: "0.1",
      type: "blueprint",
      payload: {
        id: "child",
        kind: "test",
        version: "1",
        tiers: [{ id: "runtime", kind: "runtime-document" }],
        recipes: [],
        cells: { root: { id: "root", view: { capability: "child-view" } } },
        projections: { presentation: { roots: ["root"] } },
        runtime: { capabilities: {} },
      },
    } as const;
    const parent = {
      ...child,
      payload: {
        ...child.payload,
        id: "parent",
        cells: {
          child: {
            id: "child",
            blueprint: { $ref: "./child.blueprint.json" },
            view: { capability: "blueprint-host" },
          },
        },
        projections: { presentation: { roots: ["child"] } },
      },
    } as const;

    const assembled = assembleBlueprint(parent, (ref, context) => {
      expect(ref).toBe("./child.blueprint.json");
      expect(context).toEqual({ parentBlueprintId: "parent", cellId: "child" });
      return child;
    });

    expect(assembled.payload.cells.child.blueprint).toEqual({ inline: child });
  });
});