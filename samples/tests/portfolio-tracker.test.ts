import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import effects from "../bundles/portfolio-tracker/effect_handlers";
import { openSampleBlueprint } from "../shared/blueprints";
import { declarativeServiceOrchestrator } from "../shared/service-runtime";
import type { SampleServiceRegistryOptions } from "../services";

const PORTFOLIO_BLUEPRINTS = ["portfolio-tracker"] as const;
const originalFetch = globalThis.fetch;
let foundryRequests: Array<Record<string, unknown>> = [];

const intelligenceResponse = {
  summary: "The portfolio is concentrated in two individual equities.",
  observations: ["NVDA has the larger market-value weight."],
  risks: ["NVDA: current semiconductor volatility may amplify drawdowns."],
  evidence: ["NVDA company and market news reviewed for the current date."],
  asOf: "2026-07-22",
};

const strategiesResponse = {
  strategies: {
    conservative: {
      id: "conservative",
      rationale: "Reduce single-name concentration.",
      targetWeights: [{ ticker: "NVDA", weight: 0.4 }, { ticker: "JNJ", weight: 0.6 }],
    },
    growth: {
      id: "growth",
      rationale: "Retain a larger growth allocation.",
      targetWeights: [{ ticker: "NVDA", weight: 0.65 }, { ticker: "JNJ", weight: 0.35 }],
    },
  },
  recommendation: {
    selected: "conservative",
    reason: "It better matches the supplied moderate risk tolerance.",
    status: "proposed",
  },
};

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
  resolveCredential: async () => "foundry-access-key",
  authorizeEndpoint: async () => true,
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

beforeEach(() => {
  foundryRequests = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    foundryRequests.push(body);
    const schemaName = String((body.responseSchema as { name?: unknown } | undefined)?.name ?? "");
    const reply = schemaName.startsWith("portfolio-intelligence")
      ? intelligenceResponse
      : strategiesResponse;
    return new Response(JSON.stringify({
      conversationId: `conversation-${foundryRequests.length}`,
      responseId: `response-${foundryRequests.length}`,
      reply: JSON.stringify(reply),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

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
      provider: "foundry-agent:Portfolio-Intelligence-Agent",
      risks: intelligenceResponse.risks,
    });
    expect(foundryRequests[0]).toMatchObject({ agentName: "Portfolio-Intelligence-Agent" });
    expect(String(foundryRequests[0].message)).toContain("NVDA");
    expect(String(foundryRequests[0].message)).toContain("riskTolerance");
    expect(String(foundryRequests[0].instructions)).toContain("Use web search");
    expect((foundryRequests[0].responseSchema as { strict?: boolean }).strict).toBe(true);

    await portfolio.controller.emit(
      blueprintId,
      "calculateStrategies",
      {},
      "agent-portfolio-intelligence"
    );
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.strategies.conservative")).toMatchObject({ id: "conservative" });
    expect(portfolio.state.get("portfolio.strategies.growth")).toMatchObject({ id: "growth" });
    expect(portfolio.state.get("portfolio.strategies.conservative.targetWeights")).toEqual({ NVDA: 0.4, JNJ: 0.6 });
    expect(portfolio.state.get("portfolio.recommendation.status")).toBe("proposed");
    expect(foundryRequests[1]).toMatchObject({ agentName: "Portfolio-Strategy-Agent" });
    expect(String(foundryRequests[1].message)).toContain("Portfolio intelligence JSON");

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
    await expect(portfolio.controller.emit(
      "rebalance-comparison",
      "apply",
      {},
      "human-investor"
    )).rejects.toThrow("A proposed recommendation is required");
  });

  it("rejects recommendation application without a proposal or attributed actor", async () => {
    const portfolio = runtime(blueprintId);

    await expect(portfolio.controller.emit(
      "rebalance-comparison",
      "apply",
      {},
      "human-investor"
    )).rejects.toThrow("A proposed recommendation is required");

    await portfolio.controller.emit(blueprintId, "requestIntelligence", {}, "agent-portfolio-intelligence");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "calculateStrategies", {}, "agent-portfolio-intelligence");
    await portfolio.controller.settle();
    await expect(portfolio.controller.emit(
      "rebalance-comparison",
      "apply"
    )).rejects.toThrow("requires an attributed actor");
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
