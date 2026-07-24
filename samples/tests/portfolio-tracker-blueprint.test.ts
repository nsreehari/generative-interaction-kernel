import { describe, expect, it } from "vitest";
import {
  analyzeCellComposition,
  type CellDefinition,
} from "@gik/profile";

import { openSampleBlueprint } from "../shared/blueprints";
import { applyHostConfig } from "../shared/host-config";
import blueprint from "../profiles/portfolio-tracker/blueprint.json" with { type: "json" };

const portfolioCells = Object.values(blueprint.payload.cells) as unknown as CellDefinition[];

describe("portfolio-tracker Blueprint", () => {
  it("resolves the KISS cell composition", () => {
    expect(portfolioCells.map((cell) => cell.id)).toEqual([
      "portfolio-tracker",
      "http-proxy-access-gate",
      "holdings",
      "market-prices",
      "positions",
      "summary",
      "portfolio-intelligence",
      "conservative-rebalance",
      "growth-rebalance",
      "rebalance-comparison",
    ]);
    const composition = analyzeCellComposition(portfolioCells);
    expect(composition.externalInputs).toEqual(["investor-profile"]);
    expect(composition.diagnostics).toEqual([]);
  });

  it("composes the runtime directly from Blueprint-owned cell bodies", () => {
    const program = openSampleBlueprint("portfolio-tracker").program.payload;
    expect(program.root.edges?.children?.map((node) => node.id)).toEqual(
      portfolioCells.slice(1).map((cell) => cell.id)
    );
    const marketPrices = program.root.edges?.children?.find((node) => node.id === "market-prices");
    const accessGate = portfolioCells.find((cell) => cell.id === "http-proxy-access-gate");
    expect(accessGate?.outputs).toEqual([{
      token: "http-proxy-access",
      from: "portfolio.httpProxyAccessStatus",
      when: "portfolio.httpProxyAccessStatus = 'ready'",
    }]);
    expect(portfolioCells.find((cell) => cell.id === "market-prices")?.inputs).toEqual([
      { token: "http-proxy-access" },
      { token: "holding:$TICKER" },
    ]);
    expect(marketPrices?.props?.externalSource).toEqual({ refreshEvent: "refresh" });
    expect(marketPrices?.edges?.on?.refresh).toEqual([{
      do: "invoke",
      args: { tool: "refreshPrices" },
    }]);
    expect(program.derivations).toEqual([
      expect.objectContaining({
        id: "positions-positions-by-ticker",
        target: "portfolio.positions",
        dependencies: ["portfolio.holdings", "portfolio.quotes"],
      }),
      expect.objectContaining({
        id: "summary-portfolio-totals",
        target: "portfolio.summary",
        dependencies: ["portfolio.positions"],
      }),
    ]);
  });

  it("lowers the empty holdings editor with an explicit row schema", () => {
    const holdings = openSampleBlueprint("portfolio-tracker").program.payload.root.edges?.children?.find((node) => node.id === "holdings");
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
    expect(runtime.program).toMatchObject({ type: "program", payload: { root: { id: "portfolio-tracker" } } });
    expect(runtime.vocabulary).toMatchObject({
      type: "vocabulary",
      payload: { externals: { services: applyHostConfig(blueprint.payload.services) } },
    });
    expect(runtime.state.portfolio).toMatchObject({ holdings: {}, positions: {} });
  });
});
