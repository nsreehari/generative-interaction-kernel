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

function holdingFrom(value: Json | undefined): Holding | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const ticker = String(value.ticker ?? "").trim().toUpperCase();
  const quantity = Number(value.quantity);
  const costBasis = Number(value.costBasis);
  return ticker && Number.isFinite(quantity) && Number.isFinite(costBasis)
    ? { ticker, quantity, costBasis }
    : undefined;
}

function clearDerivedPortfolioOps(ctx: EffectContext, holdings: Record<string, Holding>): PatchOp[] {
  return [
    ctx.set("portfolio.holdings", holdings as unknown as Json),
    ctx.set("portfolio.quotes", {} as Json),
    ctx.set("portfolio.positions", {} as Json),
    ctx.set("portfolio.summary", {
      marketValue: 0,
      costBasis: 0,
      gainLoss: 0,
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
      ...clearDerivedPortfolioOps(ctx, keyed),
      ctx.set("portfolio.investorProfile", investorProfile),
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
      ops: clearDerivedPortfolioOps(ctx, {
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
    return { ops: clearDerivedPortfolioOps(ctx, holdings) };
  },
  saveHoldings: (ctx) => {
    const rows = Array.isArray(ctx.payload.rows)
      ? ctx.payload.rows.map((value) => holdingFrom(value)).filter((value): value is Holding => value !== undefined)
      : [];
    return replaceHoldings(ctx, rows, ctx.get("portfolio.investorProfile"));
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
