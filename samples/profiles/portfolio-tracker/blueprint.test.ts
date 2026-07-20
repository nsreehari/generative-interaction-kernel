import { describe, expect, it } from "vitest";
import {
  PORTFOLIO_CELLS,
  PORTFOLIO_SERVICES,
  compilePortfolioDocument,
  portfolioComposition,
  tracePortfolioBlueprint,
} from "./compile";

import { openSampleBlueprint } from "../../shared/blueprints";

describe("portfolio-tracker Blueprint", () => {
  it("resolves the KISS cell composition", () => {
    expect(PORTFOLIO_CELLS.map((cell) => cell.id)).toEqual([
      "holdings",
      "market-prices",
      "positions",
      "summary",
      "portfolio-intelligence",
      "conservative-rebalance",
      "growth-rebalance",
      "rebalance-comparison",
    ]);
    expect(portfolioComposition.externalInputs).toEqual(["investor-profile"]);
    expect(portfolioComposition.diagnostics).toEqual([]);
  });

  it("uses two lowering recipes and preserves cell ids", () => {
    const trace = tracePortfolioBlueprint();
    expect(trace).toHaveLength(2);
    const document = compilePortfolioDocument();
    expect(document.root.edges?.children?.map((node) => node.id)).toEqual(
      PORTFOLIO_CELLS.map((cell) => cell.id)
    );
  });

  it("lowers the empty holdings editor with an explicit row schema", () => {
    const holdings = compilePortfolioDocument().root.edges?.children?.find((node) => node.id === "holdings");
    expect(holdings?.props?.spec).toEqual({
      schema: {
        properties: {
          ticker: { type: "string" },
          quantity: { type: "number" },
          costBasis: { type: "number" },
        },
      },
    });
  });

  it("opens one runtime from the authored Blueprint", () => {
    const runtime = openSampleBlueprint("portfolio-tracker");
    expect(runtime.document).toMatchObject({ type: "document", payload: compilePortfolioDocument() });
    expect(runtime.manifest).toMatchObject({
      type: "manifest",
      payload: { externals: { services: PORTFOLIO_SERVICES } },
    });
    expect(runtime.state.portfolio).toMatchObject({ holdings: {}, positions: {} });
  });
});
