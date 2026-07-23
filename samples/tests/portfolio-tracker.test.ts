import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import effects, {
  hydrateState,
  portfolioStateStorageKey,
  readStoredPortfolioState,
  wrapOrchestrator,
  writeStoredPortfolioState,
} from "../bundles/portfolio-tracker/effect_handlers";
import { formatIntelligenceMetric, safeEvidenceUrl, selectIntelligenceProjection } from "../bundles/portfolio-tracker/projection_views";
import { openSampleBlueprint } from "../shared/blueprints";
import { hostConfig } from "../shared/host-config";
import { declarativeServiceOrchestrator } from "../shared/service-runtime";
import type { SampleServiceRegistryOptions } from "../services";

const PORTFOLIO_BLUEPRINTS = ["portfolio-tracker"] as const;
const originalFetch = globalThis.fetch;
let foundryRequests: Array<Record<string, unknown>> = [];

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

const intelligenceResponse = {
  summary: "The portfolio is concentrated in two individual equities.",
  observations: ["NVDA has the larger market-value weight."],
  risks: ["NVDA: current semiconductor volatility may amplify drawdowns."],
  evidence: ["NVDA company and market news reviewed for the current date."],
  asOf: "2026-07-22",
};

const intelligence2Response = {
  headline: "Concentration deserves immediate attention",
  summary: "The same semantic assessment supports a glanceable overview and a focused review.",
  asOf: "2026-07-23",
  items: [
    { id: "concentration", kind: "risk", title: "Two holdings drive all portfolio outcomes", detail: "NVDA has the larger weight.", salience: "critical", confidence: "high", entities: ["NVDA", "JNJ"], value: "55.4", unit: "% NVDA", date: "", evidenceIds: [] },
    { id: "earnings", kind: "catalyst", title: "NVDA earnings", detail: "A dated volatility catalyst.", salience: "high", confidence: "high", entities: ["NVDA"], value: "", unit: "", date: "2026-08-26", evidenceIds: ["nvda-events"] },
  ],
  evidence: [{ id: "nvda-events", title: "Events and presentations", publisher: "NVIDIA", url: "https://investor.nvidia.com", publishedAt: "" }],
  projectionCandidates: [
    {
      id: "executive-scan", label: "Executive scan", attention: "glanceable", rationale: "Lead with the dominant risk and next catalyst.",
      sections: [
        { id: "lead", title: "What matters", primitive: "hero-signal", priority: "primary", disclosure: "always", contentIds: ["concentration"] },
        { id: "next", title: "What is next", primitive: "timeline", priority: "secondary", disclosure: "always", contentIds: ["earnings"] },
        { id: "sources", title: "Evidence", primitive: "evidence-list", priority: "tertiary", disclosure: "on-demand", contentIds: ["nvda-events"] },
      ],
    },
    {
      id: "analyst-review", label: "Analyst review", attention: "focused", rationale: "Retain signals and inspectable evidence.",
      sections: [
        { id: "signals", title: "Signals", primitive: "signal-list", priority: "primary", disclosure: "always", contentIds: ["concentration", "earnings"] },
        { id: "evidence", title: "Evidence", primitive: "evidence-list", priority: "secondary", disclosure: "collapsed", contentIds: ["nvda-events"] },
      ],
    },
  ],
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
    const reply = schemaName.startsWith("portfolio-intelligence-2")
      ? intelligence2Response
      : schemaName.startsWith("portfolio-intelligence")
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
    wrapOrchestrator: wrapOrchestrator(declarativeServiceOrchestrator(blueprintRuntime, registryOptions)),
  });
}

describe.each(PORTFOLIO_BLUEPRINTS)("%s Blueprint runtime", (blueprintId) => {
  it("persists and hydrates the durable portfolio state without transient host fields", () => {
    const storage = memoryStorage();
    writeStoredPortfolioState({
      holdings: { nvda: { ticker: "nvda", quantity: 12, costBasis: 118 } },
      quotes: { NVDA: { ticker: "NVDA", price: 175 } },
      positions: { NVDA: { ticker: "NVDA", quantity: 12, value: 2100 } },
      summary: { marketValue: 2100, costBasis: 1416, gainLoss: 684 },
      intelligence: { summary: "Concentrated portfolio", asOf: "2026-07-23" },
      intelligence2: null,
      strategies: {},
      recommendation: null,
      investorProfile: { riskTolerance: "moderate" },
      presentationContext: "portfolio-advisor",
      foundryAccessStatus: "ready",
    }, storage);

    const raw = JSON.parse(storage.getItem(portfolioStateStorageKey) ?? "");
    expect(raw).toMatchObject({
      portfolio: {
        holdings: { NVDA: { ticker: "NVDA", quantity: 12, costBasis: 118 } },
        quotes: { NVDA: { ticker: "NVDA", price: 175 } },
        intelligence: { summary: "Concentrated portfolio", asOf: "2026-07-23" },
      },
    });
    expect(raw.savedAt).toEqual(expect.any(String));
    expect(raw.portfolio).not.toHaveProperty("presentationContext");
    expect(raw.portfolio).not.toHaveProperty("foundryAccessStatus");

    const state = { portfolio: { holdings: {}, quotes: {}, intelligence: null, presentationContext: "portfolio-overview" } };
    hydrateState(state, storage);
    expect(state.portfolio.holdings).toEqual({ NVDA: { ticker: "NVDA", quantity: 12, costBasis: 118 } });
    expect(state.portfolio.quotes).toEqual({ NVDA: { ticker: "NVDA", price: 175 } });
    expect(state.portfolio.intelligence).toEqual({ summary: "Concentrated portfolio", asOf: "2026-07-23" });
    expect(state.portfolio.presentationContext).toBe("portfolio-overview");
  });

  it("ignores malformed storage and honors a valid empty portfolio", () => {
    const storage = memoryStorage();
    storage.setItem(portfolioStateStorageKey, "not-json");
    expect(readStoredPortfolioState(storage)).toBeNull();

    const malformedState = { portfolio: { holdings: { DEFAULT: { ticker: "DEFAULT" } } } };
    hydrateState(malformedState, storage);
    expect(malformedState.portfolio.holdings).toEqual({ DEFAULT: { ticker: "DEFAULT" } });

    writeStoredPortfolioState({ holdings: {} }, storage);
    const emptyState = { portfolio: { holdings: { DEFAULT: { ticker: "DEFAULT" } } } };
    hydrateState(emptyState, storage);
    expect(emptyState.portfolio.holdings).toEqual({});
  });

  it("allows only web evidence links", () => {
    expect(safeEvidenceUrl("https://investor.nvidia.com/events")).toBe("https://investor.nvidia.com/events");
    expect(safeEvidenceUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeEvidenceUrl("not a url")).toBeUndefined();
  });

  it("formats intelligence metrics for portfolio readers", () => {
    expect(formatIntelligenceMetric("62235.2", "USD")).toBe("$62,235.20");
    expect(formatIntelligenceMetric("125.5", "percent")).toBe("125.5%");
    expect(formatIntelligenceMetric("100", "shares")).toBe("100 shares");
  });

  it("reports when the configured Foundry server cannot be reached", async () => {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    const portfolio = runtime(blueprintId);

    await portfolio.controller.emit("foundry-access-gate", "accessRequested", {});
    await portfolio.controller.settle();

    expect(portfolio.state.get("portfolio.foundryAccessStatus")).toBe("error");
    expect(portfolio.state.get("portfolio.foundryAccessError")).toBe(
      `Could not reach Foundry at ${hostConfig.foundryProxyOrigin}. Verify the server is running.`
    );
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

  it("persists editable-table saves through the portfolio effect service", async () => {
    const storage = memoryStorage();
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
    try {
      const portfolio = runtime(blueprintId);
      await portfolio.controller.emit("holdings", "save", {
        rows: [{ ticker: "msft", quantity: 7, costBasis: 405 }],
      }, "human-investor");
      await portfolio.controller.settle();

      expect(readStoredPortfolioState(storage)).toMatchObject({
        holdings: { MSFT: { ticker: "MSFT", quantity: 7, costBasis: 405 } },
        quotes: { MSFT: { ticker: "MSFT", price: 100 } },
        positions: { MSFT: { ticker: "MSFT", quantity: 7, price: 100 } },
      });
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
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

  it("commits structured intelligence and informational strategy comparison", async () => {
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
  });

  it("persists committed intelligence and strategy cells in the portfolio snapshot", async () => {
    const storage = memoryStorage();
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
    try {
      const portfolio = runtime(blueprintId);
      await portfolio.controller.emit(blueprintId, "setHoldings", {
        holdings: [{ ticker: "NVDA", quantity: 18, costBasis: 138 }],
        investorProfile: { riskTolerance: "moderate", horizonYears: 8 },
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

      expect(readStoredPortfolioState(storage)).toMatchObject({
        quotes: { NVDA: { ticker: "NVDA", price: 100 } },
        intelligence: { summary: intelligenceResponse.summary },
        intelligence2: { headline: intelligence2Response.headline },
        strategies: { conservative: { id: "conservative" }, growth: { id: "growth" } },
        recommendation: { selected: "conservative", status: "proposed" },
        investorProfile: { riskTolerance: "moderate", horizonYears: 8 },
      });
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("stitches agent-proposed projections to the current Blueprint attention context", async () => {
    const portfolio = runtime(blueprintId);
    await portfolio.controller.emit(blueprintId, "setHoldings", {
      holdings: [{ ticker: "NVDA", quantity: 18, costBasis: 138 }],
      investorProfile: { riskTolerance: "moderate", horizonYears: 8 },
    }, "human-investor");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "refreshPrices", {}, "agent-market-data");
    await portfolio.controller.settle();
    await portfolio.controller.emit(blueprintId, "requestIntelligence2", {}, "agent-portfolio-intelligence");
    await portfolio.controller.settle();

    expect(portfolio.state.get("portfolio.intelligence2")).toMatchObject({
      provider: "foundry-agent:Portfolio-Intelligence-2-Agent",
      projectionCandidates: intelligence2Response.projectionCandidates,
    });
    expect(foundryRequests[0]).toMatchObject({ agentName: "Portfolio-Intelligence-2-Agent", maxOutputTokens: 2500 });
    expect(String(foundryRequests[0].message)).toContain("Interaction context JSON");
    expect(String(foundryRequests[0].message)).toContain("glanceable");
    expect(String(foundryRequests[0].instructions)).toContain("Available primitives");

    const document = openSampleBlueprint(blueprintId).document.payload;
    const intelligence2Node = document.root.edges?.children?.find((node) => node.id === "portfolio-intelligence-2");
    const recipe = intelligence2Node?.props?.projectionRecipe;
    const overview = selectIntelligenceProjection(intelligence2Response, "portfolio-overview", recipe);
    const advisor = selectIntelligenceProjection(intelligence2Response, "portfolio-advisor", recipe);
    expect(overview).toMatchObject({ policy: { attention: "glanceable" }, candidate: { id: "executive-scan" } });
    expect(overview.sections.map((section) => section.id)).toEqual(["lead", "next"]);
    expect(advisor).toMatchObject({ policy: { attention: "focused" }, candidate: { id: "analyst-review" } });
    expect(advisor.sections.map((section) => section.id)).toEqual(["signals", "evidence"]);
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
