import { describe, expect, it } from "vitest";
import {
  analyzeCellComposition,
  compileCellTopology,
  composeCellDocument,
  tokenPattern,
} from "../src/cells";

describe("Blueprint cells", () => {
  it("matches literal and parameterized tokens", () => {
    expect(tokenPattern("portfolio-summary").match("portfolio-summary")).toEqual({});
    expect(tokenPattern("holding:$TICKER").match("holding:AAPL")).toEqual({ TICKER: "AAPL" });
    expect(tokenPattern("holding:$TICKER").match("quote:AAPL")).toBeUndefined();
  });

  it("resolves unique providers and derives external inputs", () => {
    const result = analyzeCellComposition([
      { id: "holdings", capability: "table", provides: ["holding:$TICKER"] },
      {
        id: "market-prices",
        capability: "table",
        requires: ["holding:$TICKER"],
        provides: ["quote:$TICKER"],
      },
      {
        id: "intelligence",
        capability: "narrative",
        requires: ["quote:$TICKER", "investor-profile"],
        provides: ["portfolio-intelligence"],
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
      { id: "quotes", capability: "table", provides: ["quote:$TICKER"] },
      { id: "quotes", capability: "table", provides: ["quote:$TICKER", "quote:$"] },
    ]);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "duplicate-cell-id",
      "invalid-token-pattern",
      "ambiguous-provider",
    ]);
  });

  it("derives topology directly from nested authored cells", () => {
    const organism = {
      id: "root",
      capability: "screen",
      edges: { children: [{
        id: "foundry-access",
        capability: "access-gate",
        provides: [{
          token: "foundry-access",
          read: "agent.accessCapability",
          when: "agent.accessStatus = 'ready'",
        }],
        edges: { children: [{
          id: "foundry-chat",
          capability: "chat",
          requires: ["foundry-access"],
        }] },
      }] },
    } as const;
    const result = compileCellTopology("foundry-agent", organism);

    expect(result.edges).toEqual([{
      token: "foundry-access",
      providerCellId: "foundry-access",
      consumerCellId: "foundry-chat",
    }]);
    expect(result.cells.map((cell) => cell.id)).toEqual(["foundry-access", "foundry-chat"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports invalid value-bearing outputs", () => {
    const result = compileCellTopology("invalid", [{
      id: "producer",
      capability: "source",
      provides: [{ token: "value", read: "" }],
    }]);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["invalid-output-binding"]);
  });

  it("lowers the same cell tree by stripping only dataflow metadata", () => {
    const organism = {
      id: "root",
      capability: "screen",
      edges: { children: [{
        id: "access",
        capability: "access-gate",
        provides: ["access"],
        edges: { children: [{ id: "chat", capability: "chat", requires: ["access"] }] },
      }] },
    } as const;
    const document = composeCellDocument(organism, compileCellTopology("access-chat", organism));

    expect(document.root.edges?.children).toEqual([{
      id: "access",
      capability: "access-gate",
      edges: { children: [{ id: "chat", capability: "chat" }] },
    }]);
  });
});