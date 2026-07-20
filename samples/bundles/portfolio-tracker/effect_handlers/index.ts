import type { EffectContext, EffectHandlerMap } from "@gik/react";
import type { Json, PatchOp } from "@gik/kernel";

interface Holding {
  ticker: string;
  quantity: number;
  costBasis: number;
}

interface Quote {
  ticker: string;
  price: number;
}

function recordAt<T>(ctx: EffectContext, path: string): Record<string, T> {
  return (ctx.get(path) ?? {}) as unknown as Record<string, T>;
}

function deterministicPrice(ticker: string): number {
  const hash = [...ticker].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 17);
  return Number((25 + (hash % 50000) / 100).toFixed(2));
}

function holdingFrom(value: Json | undefined): Holding | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const ticker = String(value.ticker ?? "").trim().toUpperCase();
  const quantity = Number(value.quantity);
  const costBasis = Number(value.costBasis);
  return ticker && Number.isFinite(quantity) && Number.isFinite(costBasis)
    ? { ticker, quantity, costBasis }
    : undefined;
}

function holdingsOps(ctx: EffectContext, holdings: Record<string, Holding>): PatchOp[] {
  const quotes: Record<string, Quote> = {};
  const positions: Record<string, Json> = {};
  let marketValue = 0;
  let costBasis = 0;

  for (const [ticker, holding] of Object.entries(holdings)) {
    const price = deterministicPrice(ticker);
    const value = holding.quantity * price;
    const positionCost = holding.quantity * holding.costBasis;
    quotes[ticker] = { ticker, price };
    positions[ticker] = {
      ticker,
      quantity: holding.quantity,
      price,
      value: Number(value.toFixed(2)),
      costBasis: Number(positionCost.toFixed(2)),
      gainLoss: Number((value - positionCost).toFixed(2)),
    };
    marketValue += value;
    costBasis += positionCost;
  }

  return [
    ctx.set("portfolio.holdings", holdings as unknown as Json),
    ctx.set("portfolio.quotes", quotes as unknown as Json),
    ctx.set("portfolio.positions", positions as Json),
    ctx.set("portfolio.summary", {
      marketValue: Number(marketValue.toFixed(2)),
      costBasis: Number(costBasis.toFixed(2)),
      gainLoss: Number((marketValue - costBasis).toFixed(2)),
    }),
    ctx.set("portfolio.intelligence", null),
    ctx.set("portfolio.strategies", {}),
    ctx.set("portfolio.recommendation", null),
  ];
}

function replaceHoldings(ctx: EffectContext, holdings: Holding[], investorProfile: Json = null): { ops: PatchOp[] } {
  const keyed = Object.fromEntries(holdings.map((holding) => [holding.ticker, holding]));
  return {
    ops: [
      ...holdingsOps(ctx, keyed),
      ctx.set("portfolio.investorProfile", investorProfile),
      ctx.set("portfolio.appliedRecommendation", null),
    ],
  };
}

const handlers: EffectHandlerMap = {
  setHoldings: (ctx) => {
    const payload = ctx.payload;
    const holdings = Array.isArray(payload.holdings)
      ? payload.holdings.map((value) => holdingFrom(value)).filter((value): value is Holding => value !== undefined)
      : [];
    return replaceHoldings(ctx, holdings, payload.investorProfile ?? null);
  },
  upsertHolding: (ctx) => {
    const holding = holdingFrom(ctx.payload.holding);
    if (!holding) return { outcome: "ignored" };
    return {
      ops: holdingsOps(ctx, {
        ...recordAt<Holding>(ctx, "portfolio.holdings"),
        [holding.ticker]: holding,
      }),
    };
  },
  removeHolding: (ctx) => {
    const ticker = String(ctx.payload.ticker ?? "").trim().toUpperCase();
    if (!ticker) return { outcome: "ignored" };
    const holdings = { ...recordAt<Holding>(ctx, "portfolio.holdings") };
    delete holdings[ticker];
    return { ops: holdingsOps(ctx, holdings) };
  },
  saveHoldings: (ctx) => {
    const rows = Array.isArray(ctx.payload.rows)
      ? ctx.payload.rows.map((value) => holdingFrom(value)).filter((value): value is Holding => value !== undefined)
      : [];
    return replaceHoldings(ctx, rows, ctx.get("portfolio.investorProfile"));
  },
  refreshPrices: (ctx) => ({
    ops: holdingsOps(ctx, recordAt<Holding>(ctx, "portfolio.holdings")),
  }),
  applyRecommendation: (ctx) => {
    const recommendation = ctx.get("portfolio.recommendation") as Record<string, Json> | null;
    if (recommendation?.status !== "proposed") {
      throw new Error("A proposed recommendation is required");
    }
    if (!ctx.actorId?.trim()) {
      throw new Error("Recommendation application requires an attributed actor");
    }
    const appliedRecommendation = {
      ...recommendation,
      status: "applied",
      actorId: ctx.actorId,
    };
    return {
      ops: [
        ctx.set("portfolio.recommendation", appliedRecommendation),
        ctx.set("portfolio.appliedRecommendation", appliedRecommendation),
      ],
    };
  },
  setPresentationContext: (ctx) => {
    const requested = ctx.get("control.presentationContext");
    const next = requested
      && typeof requested === "object"
      && !Array.isArray(requested)
      && typeof (requested as Record<string, unknown>).view === "string"
      && ["portfolio-overview", "portfolio-advisor"].includes(String((requested as Record<string, unknown>).view))
      ? String((requested as Record<string, unknown>).view)
      : "portfolio-overview";
    if (ctx.get("portfolio.presentationContext") === next) return { outcome: "ignored" };
    return { ops: [ctx.set("portfolio.presentationContext", next as unknown as Json)] };
  },
};

export default handlers;
