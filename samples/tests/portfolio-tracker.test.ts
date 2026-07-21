import { describe, expect, it } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import effects from "../bundles/portfolio-tracker/effect_handlers";
import { openSampleBlueprint } from "../shared/blueprints";
import { declarativeServiceOrchestrator } from "../shared/service-runtime";
import type { SampleServiceRegistryOptions } from "../services";

const PORTFOLIO_BLUEPRINTS = ["portfolio-tracker"] as const;

const quoteFixture = (ticker: string, price: number) => ({
  chart: {
    result: [{
      meta: {
        symbol: ticker,
        regularMarketPrice: price,
        regularMarketChange: Number((price * 0.01).toFixed(2)),
        regularMarketChangePercent: 1,
        chartPreviousClose: Number((price * 0.99).toFixed(2)),
      },
    }],
  },
});

const registryOptions: SampleServiceRegistryOptions = {
  hostCapabilities: ["http-executor"],
  execute: async (request) => {
    const invocation = request as { kind?: string; input?: { requests?: Array<{ key?: string; meta?: unknown }> } };
    if (invocation.kind !== "http-service") throw new Error("Unexpected service kind");
    const requests = Array.isArray(invocation.input?.requests)
      ? invocation.input.requests
      : invocation.input?.requests
        ? [invocation.input.requests]
        : [];
    return {
      results: requests.map((entry, index) => ({
        key: String(entry.key ?? `TICK${index}`),
        status: 200,
        meta: entry.meta ?? null,
        body: quoteFixture(String(entry.key ?? `TICK${index}`), 100 + index),
      })),
    };
  },
};

function runtime(blueprintId: typeof PORTFOLIO_BLUEPRINTS[number]) {
  const blueprintRuntime = openSampleBlueprint(blueprintId);
  return loadBundleRuntime(bundleFromJson({
    manifest: blueprintRuntime.manifest,
    document: blueprintRuntime.document,
    state: blueprintRuntime.state,
  }, { effectHandlers: effects }), {
    wrapOrchestrator: declarativeServiceOrchestrator(blueprintRuntime, registryOptions),
  });
}

describe.each(PORTFOLIO_BLUEPRINTS)("%s Blueprint runtime", (blueprintId) => {
  it("auto-refreshes live quotes when the holdings table saves rows", async () => {
    const portfolio = runtime(blueprintId);

    await portfolio.controller.emit("holdings", "save", {
      rows: [{ ticker: "NVDA", quantity: 100, costBasis: 120 }],
    }, "human-investor");
    await portfolio.controller.settle();

    expect(portfolio.state.get("portfolio.holdings.NVDA")).toMatchObject({ ticker: "NVDA", quantity: 100, costBasis: 120 });
    expect(portfolio.state.get("portfolio.quotes.NVDA")).toMatchObject({ ticker: "NVDA", price: 100 });
    expect(portfolio.state.get("portfolio.positions.NVDA")).toMatchObject({ ticker: "NVDA", quantity: 100, price: 100 });
    expect(portfolio.state.get("portfolio.summary.marketValue")).toBe(10000);
  });

  it("maintains keyed quotes, positions, and summary as tickers change", async () => {
    const portfolio = runtime(blueprintId);

    await portfolio.controller.emit(blueprintId, "setHoldings", {
      holdings: [{ ticker: "AAPL", quantity: 8, costBasis: 178 }],
    }, "human-investor");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.positions.AAPL")).toBeNull();

    await portfolio.controller.emit(blueprintId, "refreshPrices", {}, "agent-market-data");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.positions.AAPL")).toMatchObject({ ticker: "AAPL", quantity: 8, price: 100 });

    await portfolio.controller.emit(blueprintId, "upsertHolding", {
      holding: { ticker: "GOOG", quantity: 4, costBasis: 165 },
    }, "human-investor");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.quotes.GOOG")).toBeNull();

    await portfolio.controller.emit(blueprintId, "refreshPrices", {}, "agent-market-data");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.quotes.GOOG")).toMatchObject({ ticker: "GOOG", price: 101 });
    expect(portfolio.state.get("portfolio.positions.GOOG")).toMatchObject({ ticker: "GOOG", quantity: 4 });

    await portfolio.controller.emit(blueprintId, "removeHolding", { ticker: "AAPL" }, "human-investor");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.holdings.AAPL")).toBeNull();
    expect(portfolio.state.get("portfolio.positions.AAPL")).toBeNull();
    expect(portfolio.state.get("portfolio.positions.GOOG")).toBeNull();

    await portfolio.controller.emit(blueprintId, "refreshPrices", {}, "agent-market-data");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.positions.GOOG")).toMatchObject({ ticker: "GOOG", quantity: 4 });
  });

  it("commits structured intelligence and keeps rebalance application attributable", async () => {
    const portfolio = runtime(blueprintId);

    await portfolio.controller.emit(blueprintId, "setHoldings", {
      holdings: [
        { ticker: "NVDA", quantity: 18, costBasis: 138 },
        { ticker: "JNJ", quantity: 12, costBasis: 149 },
      ],
      investorProfile: { riskTolerance: "moderate", horizonYears: 8 },
    }, "human-investor");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "refreshPrices", {}, "agent-market-data");
    await portfolio.controller.settle();
    await portfolio.controller.emit(
      blueprintId,
      "requestIntelligence",
      {},
      "agent-portfolio-intelligence"
    );
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.intelligence")).toMatchObject({
      provider: "portfolio-intelligence-deterministic",
      risks: ["single-name concentration", "market-price volatility"],
    });

    await portfolio.controller.emit(
      blueprintId,
      "calculateStrategies",
      {},
      "agent-portfolio-intelligence"
    );
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.strategies.conservative")).toMatchObject({ id: "conservative" });
    expect(portfolio.state.get("portfolio.strategies.growth")).toMatchObject({ id: "growth" });
    expect(portfolio.state.get("portfolio.recommendation.status")).toBe("proposed");

    await portfolio.controller.emit("rebalance-comparison", "apply", {}, "human-investor");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.appliedRecommendation")).toMatchObject({
      status: "applied",
      actorId: "human-investor",
    });
    expect(portfolio.state.get("portfolio.recommendation")).toMatchObject({
      status: "applied",
      actorId: "human-investor",
    });
    await portfolio.controller.emit(
      "rebalance-comparison",
      "apply",
      {},
      "human-investor"
    );
    await expect(portfolio.controller.settle()).rejects.toThrow("A proposed recommendation is required");
  });

  it("rejects recommendation application without a proposal or attributed actor", async () => {
    const portfolio = runtime(blueprintId);

    await portfolio.controller.emit(
      "rebalance-comparison",
      "apply",
      {},
      "human-investor"
    );
    await expect(portfolio.controller.settle()).rejects.toThrow("A proposed recommendation is required");

    await portfolio.controller.emit(blueprintId, "requestIntelligence", {}, "agent-portfolio-intelligence");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "calculateStrategies", {}, "agent-portfolio-intelligence");
    await portfolio.controller.settle();
    await portfolio.controller.emit(
      "rebalance-comparison",
      "apply"
    );
    await expect(portfolio.controller.settle()).rejects.toThrow("requires an attributed actor");
    expect(portfolio.state.get("portfolio.appliedRecommendation")).toBeNull();
    expect(portfolio.state.get("portfolio.recommendation.status")).toBe("proposed");
  });

  it("accepts an arbitrary high-cardinality ticker set without new commands", async () => {
    const portfolio = runtime(blueprintId);
    const holdings = Array.from({ length: 250 }, (_, index) => ({
      ticker: `TICK${index}`,
      quantity: index + 1,
      costBasis: 50 + index,
    }));

    await portfolio.controller.emit(blueprintId, "setHoldings", { holdings }, "human-investor");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "refreshPrices", {}, "agent-market-data");
    await portfolio.controller.settle();

    expect(Object.keys(portfolio.state.get("portfolio.holdings") as object)).toHaveLength(250);
    expect(portfolio.state.get("portfolio.quotes.TICK249")).toMatchObject({ ticker: "TICK249" });
    expect(portfolio.state.get("portfolio.positions.TICK249")).toMatchObject({ quantity: 250 });
  });
});
