import { describe, expect, it } from "vitest";
import {
  analyzeCellComposition,
  type CellDefinition,
} from "@gik/blueprint";

import { openSampleBlueprint } from "../shared/blueprints";
import { applyHostConfig } from "../shared/host-config";
import blueprint from "../blueprints/portfolio-tracker/blueprint.json" with { type: "json" };

const portfolioCells = Object.values(blueprint.payload.cells) as unknown as CellDefinition[];

describe("portfolio-tracker Blueprint", () => {
  it("resolves the KISS cell composition", () => {
    expect(portfolioCells.map((cell) => cell.id)).toEqual([
      "portfolio-tracker",
      "http-proxy-access-gate",
      "foundry-access-gate",
      "holdings",
      "market-prices",
      "positions",
      "summary",
      "portfolio-intelligence",
      "portfolio-intelligence-2",
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
    const foundryAccessGate = portfolioCells.find((cell) => cell.id === "foundry-access-gate");
    expect(accessGate?.outputs).toEqual([{
      token: "http-proxy-access",
      from: "portfolio.httpProxyAccessStatus",
      when: "portfolio.httpProxyAccessStatus = 'ready'",
    }]);
    expect(portfolioCells.find((cell) => cell.id === "market-prices")?.inputs).toEqual([
      { token: "http-proxy-access" },
      { token: "holding:$TICKER" },
    ]);
    expect(foundryAccessGate?.outputs).toEqual([{
      token: "foundry-access",
      from: "portfolio.foundryAccessStatus",
      when: "portfolio.foundryAccessStatus = 'ready'",
    }]);
    const intelligence1 = portfolioCells.find((cell) => cell.id === "portfolio-intelligence");
    expect(intelligence1?.inputs).toContainEqual({ token: "foundry-access" });
    expect(intelligence1?.view?.bindings).toMatchObject({
      value: { from: "portfolio.intelligence" },
      error: { from: "portfolio.intelligenceError" },
    });
    const intelligence2 = portfolioCells.find((cell) => cell.id === "portfolio-intelligence-2");
    expect(intelligence2).toMatchObject({
      inputs: expect.arrayContaining([{ token: "foundry-access" }]),
      sources: [{ service: "portfolio-intelligence-2", operation: "chat", contract: "portfolio-intelligence-2/v1" }],
      view: {
        capability: "portfolio:intelligence-projections",
        bindings: {
          value: { from: "portfolio.intelligence2" },
          presentationContext: { from: "portfolio.presentationContext" },
          error: { from: "portfolio.foundryAccessError" },
        },
      },
    });
    expect(intelligence2?.view?.props?.projectionRecipe).toMatchObject({
      contexts: {
        "portfolio-overview": { attention: "glanceable", maxSections: 3 },
        "portfolio-advisor": { attention: "focused", maxSections: 8 },
      },
    });
    const comparison = portfolioCells.find((cell) => cell.id === "rebalance-comparison");
    expect(comparison?.inputs).toEqual(expect.arrayContaining([
      { token: "portfolio-intelligence" },
      { token: "portfolio-intelligence-2" },
    ]));
    expect(comparison?.sources).toEqual([
      expect.objectContaining({ service: "portfolio-strategies", operation: "chat" }),
    ]);
    expect(comparison?.view?.bindings).toMatchObject({
      intelligence1: { from: "portfolio.intelligence" },
      intelligence2: { from: "portfolio.intelligence2" },
      strategyInputs: { from: "portfolio.strategyInputs" },
    });
    expect(blueprint.payload.cells["portfolio-tracker"].behavior.events.calculateStrategies).toEqual([
      { do: "invoke", args: { tool: "prepareStrategies" } },
      { do: "invoke", args: { tool: "calculateStrategies" } },
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
