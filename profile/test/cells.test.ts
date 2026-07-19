import { describe, expect, it } from "vitest";
import { analyzeCellComposition, tokenPattern } from "../src/cells";

describe("Blueprint cells", () => {
  it("matches literal and parameterized tokens", () => {
    expect(tokenPattern("portfolio-summary").match("portfolio-summary")).toEqual({});
    expect(tokenPattern("holding:$TICKER").match("holding:AAPL")).toEqual({ TICKER: "AAPL" });
    expect(tokenPattern("holding:$TICKER").match("quote:AAPL")).toBeUndefined();
  });

  it("resolves unique providers and derives external inputs", () => {
    const result = analyzeCellComposition([
      { id: "holdings", provides: ["holding:$TICKER"] },
      {
        id: "market-prices",
        requires: ["holding:$TICKER"],
        provides: ["quote:$TICKER"],
      },
      {
        id: "intelligence",
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
      { id: "quotes", provides: ["quote:$TICKER"] },
      { id: "quotes", provides: ["quote:$TICKER", "quote:$"] },
    ]);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "duplicate-cell-id",
      "invalid-token-pattern",
      "ambiguous-provider",
    ]);
  });
});