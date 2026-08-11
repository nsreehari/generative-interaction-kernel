import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import effects, {
  hydrateState,
  portfolioStateStorageKey,
  readStoredPortfolioState,
  wrapOrchestrator,
  writeStoredPortfolioState,
} from "../blueprints/portfolio-tracker/native/effect_handlers/portfolioTrackerEffectHandlers";
import {
  formatIntelligenceMetric,
  safeEvidenceUrl,
  strategyActionDisabled,
  strategyInputSnapshot,
  strategyInputsEqual,
} from "../blueprints/portfolio-tracker/native/projection_views/portfolioTrackerLeaves";
import { openSampleBlueprint } from "../catalog/blueprint-catalog";
import { declarativeServiceOrchestrator } from "../apps/service-kinds/host/service-runtime";
import { createBlueprintAgentLifecycle } from "../apps/service-kinds/host/blueprint-agent-lifecycle";
import type { SampleServiceRegistryOptions } from "../apps/service-kinds";
import { InMemoryStateModel } from "../../kernel/src/index";

const PORTFOLIO_BLUEPRINTS = ["portfolio-tracker"] as const;
const originalFetch = globalThis.fetch;
let foundryRequests: Array<Record<string, unknown>> = [];

const intelligenceResponse = {
  summary: "The portfolio is concentrated in two individual equities.",
  observations: ["NVDA has the larger market-value weight."],
  risks: ["single-name concentration", "market-price volatility"],
  evidence: [],
  asOf: "2026-07-22",
};

const intelligence2Response = {
  headline: "Concentration deserves immediate attention",
  summary: "The same assessment supports glanceable and focused review.",
  asOf: "2026-07-23",
  items: [{ id: "concentration", kind: "risk", title: "Two holdings drive outcomes", detail: "NVDA has the larger weight.", salience: "critical", confidence: "high", entities: ["NVDA", "JNJ"], value: "55.4", unit: "percent", date: "", evidenceIds: [] }],
  evidence: [],
  projectionCandidates: [
    { id: "executive-scan", label: "Executive scan", attention: "glanceable", rationale: "Lead with risk.", sections: [{ id: "lead", title: "What matters", primitive: "hero-signal", priority: "primary", disclosure: "always", contentIds: ["concentration"] }] },
    { id: "analyst-review", label: "Analyst review", attention: "focused", rationale: "Retain detail.", sections: [{ id: "signals", title: "Signals", primitive: "signal-list", priority: "primary", disclosure: "always", contentIds: ["concentration"] }] },
  ],
};

const strategiesResponse = {
  strategies: {
    conservative: { id: "conservative", rationale: "Reduce concentration.", targetWeights: [{ ticker: "NVDA", weight: 0.4 }, { ticker: "JNJ", weight: 0.6 }] },
    growth: { id: "growth", rationale: "Retain growth exposure.", targetWeights: [{ ticker: "NVDA", weight: 0.65 }, { ticker: "JNJ", weight: 0.35 }] },
  },
  recommendation: { selected: "conservative", reason: "Matches the supplied risk tolerance.", status: "proposed" },
};

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

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

function runtime(blueprintId: typeof PORTFOLIO_BLUEPRINTS[number]) {
  const blueprintRuntime = openSampleBlueprint(blueprintId);
  return loadBundleRuntime(bundleFromJson({
    vocabulary: blueprintRuntime.vocabulary,
    program: blueprintRuntime.program,
    state: blueprintRuntime.state,
  }, { effectHandlers: effects }), {
    wrapOrchestrator: wrapOrchestrator(declarativeServiceOrchestrator(blueprintRuntime, registryOptions)),
  });
}

beforeEach(() => {
  foundryRequests = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    foundryRequests.push(body);
    const message = String(body.message ?? "");
    const reply = message.includes("engaging, high-signal portfolio pulse")
      ? intelligence2Response
      : message.includes("propose useful semantic projections")
      ? intelligence2Response
      : message.includes("Analyze")
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

describe.each(PORTFOLIO_BLUEPRINTS)("%s Blueprint runtime", (blueprintId) => {
  it("declares portfolio UBX intents and admits proposals without mutating state", async () => {
    const blueprintRuntime = openSampleBlueprint(blueprintId);
    const state = new InMemoryStateModel(Object.keys(blueprintRuntime.state));
    state.apply(Object.entries(blueprintRuntime.state).map(([path, value]) => ({ op: "set" as const, path, value })));
    const lifecycle = createBlueprintAgentLifecycle(blueprintRuntime, state);
    const before = structuredClone(state.snapshot());
    const propose = lifecycle.tools.find(({ name }) => name === "use_blueprint_propose");
    const receipt = await propose?.handler({
      kind: "request-strategies",
      target: {
        kind: "blueprint-instance",
        id: blueprintRuntime.blueprintId,
        instanceId: blueprintRuntime.instanceId,
      },
      payloadJson: JSON.stringify({ operation: "calculateStrategies" }),
      rationale: "Request strategies through the declared portfolio service.",
    }) as { status: string; proposal: { actions: Array<{ kind: string }> } };

    expect(blueprintRuntime.definition.payload.agentLifecycle?.profiles?.use?.intentKinds).toContain("request-strategies");
    expect(receipt).toMatchObject({ status: "admitted", proposal: { actions: [{ kind: "request-strategies" }] } });
    expect(state.snapshot()).toEqual(before);
  });

  it("allows only web evidence links and formats intelligence metrics", () => {
    expect(safeEvidenceUrl("https://investor.nvidia.com/events")).toBe("https://investor.nvidia.com/events");
    expect(safeEvidenceUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeEvidenceUrl("not a url")).toBeUndefined();
    expect(formatIntelligenceMetric("62235.2", "USD")).toBe("$62,235.20");
    expect(formatIntelligenceMetric("125.5", "percent")).toBe("125.5%");
    expect(formatIntelligenceMetric("100", "shares")).toBe("100 shares");
  });

  it("prefers intelligence 2 and compares strategy inputs canonically", () => {
    const baseline = { summary: "baseline" };
    const enhanced = { headline: "enhanced" };
    const current = strategyInputSnapshot({
      positions: { NVDA: { value: 100 } },
      summary: { marketValue: 100 },
      investorProfile: null,
      intelligence1: baseline,
      intelligence2: enhanced,
    });
    expect(current).toMatchObject({ intelligenceSource: "portfolio-intelligence-2", intelligence: enhanced });
    expect(strategyInputsEqual(current!, { ...current })).toBe(true);
    expect(strategyInputsEqual(current!, { ...current, intelligenceSource: "portfolio-intelligence" })).toBe(false);
    expect(strategyActionDisabled({ intelligence1: null, intelligence2: null })).toBe(true);
    expect(strategyActionDisabled({ intelligence1: baseline, intelligence2: null, strategyInputs: null })).toBe(false);
    expect(strategyActionDisabled({ ...current, intelligence1: baseline, intelligence2: enhanced, strategyInputs: current })).toBe(true);
  });

  it("persists and hydrates durable portfolio state without transient host fields", () => {
    const storage = new MemoryStorage();
    writeStoredPortfolioState({
      holdings: [{ ticker: "nvda", quantity: 12, costBasis: 118 }],
      quotes: { NVDA: { ticker: "NVDA", price: 175 } },
      intelligence: { summary: "Concentrated portfolio" },
      appliedRecommendation: { status: "applied", actorId: "human-investor" },
      presentationContext: "portfolio-advisor",
      foundryAccessStatus: "ready",
    }, storage);

    const raw = JSON.parse(storage.getItem(portfolioStateStorageKey) ?? "null");
    expect(raw.savedAt).toEqual(expect.any(String));
    expect(raw.portfolio).not.toHaveProperty("presentationContext");
    expect(raw.portfolio).not.toHaveProperty("foundryAccessStatus");

    const state = {
      portfolio: {
        holdings: {},
        quotes: {},
        intelligence: null,
        appliedRecommendation: null,
        presentationContext: "portfolio-overview",
      },
    };
    hydrateState(state, storage);
    expect(state.portfolio.holdings).toEqual({ NVDA: { ticker: "NVDA", quantity: 12, costBasis: 118 } });
    expect(state.portfolio.quotes).toEqual({ NVDA: { ticker: "NVDA", price: 175 } });
    expect(state.portfolio.intelligence).toEqual({ summary: "Concentrated portfolio" });
    expect(state.portfolio.appliedRecommendation).toEqual({ status: "applied", actorId: "human-investor" });
    expect(state.portfolio.presentationContext).toBe("portfolio-overview");

    storage.setItem(portfolioStateStorageKey, "not json");
    expect(readStoredPortfolioState(storage)).toBeNull();
  });

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
    expect(foundryRequests[0]).toMatchObject({ message: expect.stringContaining("Analyze") });
    expect(portfolio.state.get("portfolio.intelligenceError")).toBe("");
    expect(portfolio.state.get("portfolio.intelligence")).toMatchObject({
      provider: "foundry-agent:Portfolio-Intelligence-Agent",
      risks: ["single-name concentration", "market-price volatility"],
    });
    expect(foundryRequests[0]).toMatchObject({ agentName: "Portfolio-Intelligence-Agent" });
    expect(String(foundryRequests[0]?.message)).toContain("NVDA");
    expect(String(foundryRequests[0]?.instructions)).toContain("Analyze only the supplied portfolio data");
    expect((foundryRequests[0]?.responseSchema as { strict?: boolean }).strict).toBe(true);
    expect(foundryRequests[1]).toMatchObject({ agentName: "Portfolio-Intelligence-2-Agent" });
    expect(String(foundryRequests[1]?.message)).toContain("Input to Portfolio Intelligence 1 JSON");
    expect(String(foundryRequests[1]?.message)).toContain("Output from Portfolio Intelligence 1 JSON");
    expect(String(foundryRequests[1]?.message)).toContain(intelligenceResponse.summary);
    expect(String(foundryRequests[1]?.instructions)).toContain("engaging portfolio pulse");
    expect(portfolio.state.get("portfolio.intelligence1b")).toMatchObject({
      provider: "foundry-agent:Portfolio-Intelligence-2-Agent",
      headline: intelligence2Response.headline,
    });

    await portfolio.controller.emit(blueprintId, "requestIntelligence2", {}, "agent-portfolio-intelligence");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.intelligence2")).toMatchObject({
      provider: "foundry-agent:Portfolio-Intelligence-2-Agent",
      headline: intelligence2Response.headline,
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
    expect(portfolio.state.get("portfolio.strategyInputs")).toMatchObject({
      intelligenceSource: "portfolio-intelligence-2",
      intelligence: { headline: intelligence2Response.headline },
    });
    expect(portfolio.state.get("portfolio.pendingStrategyInputs")).toBeNull();
    expect(foundryRequests[3]).toMatchObject({ agentName: "Portfolio-Strategy-Agent" });
    expect(String(foundryRequests[3]?.message)).toContain("Portfolio intelligence source: portfolio-intelligence-2");

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

  it("clears stale intelligence and strategy inputs when holdings or prices change", async () => {
    const portfolio = runtime(blueprintId);
    await portfolio.controller.emit(blueprintId, "setHoldings", {
      holdings: [{ ticker: "NVDA", quantity: 18, costBasis: 138 }],
    }, "human-investor");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "refreshPrices", {}, "agent-market-data");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "requestIntelligence", {}, "agent-portfolio-intelligence");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "requestIntelligence2", {}, "agent-portfolio-intelligence");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "calculateStrategies", {}, "agent-portfolio-intelligence");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.strategyInputs")).not.toBeNull();

    await portfolio.controller.emit(blueprintId, "upsertHolding", {
      holding: { ticker: "JNJ", quantity: 12, costBasis: 149 },
    }, "human-investor");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.intelligence")).toBeNull();
    expect(portfolio.state.get("portfolio.intelligence2")).toBeNull();
    expect(portfolio.state.get("portfolio.strategyInputs")).toBeNull();
    expect(portfolio.state.get("portfolio.pendingStrategyInputs")).toBeNull();

    await portfolio.controller.emit(blueprintId, "refreshPrices", {}, "agent-market-data");
    await portfolio.controller.settle();
    expect(portfolio.state.get("portfolio.intelligence2")).toBeNull();
    expect(portfolio.state.get("portfolio.strategyInputs")).toBeNull();
    expect(portfolio.state.get("portfolio.pendingStrategyInputs")).toBeNull();
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
