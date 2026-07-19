import { describe, expect, it } from "vitest";
import {
  PORTFOLIO_CELLS,
  PORTFOLIO_SERVICES,
  compilePortfolioDocument,
  portfolioComposition,
  tracePortfolioBlueprint,
} from "./compile";

import bundleDocument from "../../bundles/portfolio-tracker/document.json" with { type: "json" };
import bundleManifest from "../../bundles/portfolio-tracker/manifest.json" with { type: "json" };

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

  it("produces the portfolio Bundle document", () => {
    expect(compilePortfolioDocument()).toEqual(bundleDocument.payload);
  });

  it("lowers logical service requirements into the Bundle manifest", () => {
    expect(bundleManifest.payload.externals.services).toEqual(PORTFOLIO_SERVICES);
  });
});
