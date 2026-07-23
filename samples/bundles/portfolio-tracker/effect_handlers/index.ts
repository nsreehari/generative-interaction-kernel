import type { EffectContext, EffectHandlerMap, LoadBundleOptions } from "@gik/react";
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

export const portfolioStateStorageKey = "gik.portfolio-tracker.state.v1";
const PERSISTED_PORTFOLIO_KEYS = [
  "holdings",
  "quotes",
  "positions",
  "summary",
  "intelligence",
  "intelligence2",
  "strategies",
  "recommendation",
  "strategyInputs",
  "investorProfile",
] as const;

function portfolioStorage(): Storage | null {
  try {
    return typeof globalThis === "undefined" || !("localStorage" in globalThis)
      ? null
      : globalThis.localStorage ?? null;
  } catch {
    return null;
  }
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

function normalizedHoldings(value: unknown): Record<string, Holding> {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : [];
  const holdings = values
    .map((entry) => holdingFrom(entry as Json))
    .filter((entry): entry is Holding => entry !== undefined);
  return Object.fromEntries(holdings.map((holding) => [holding.ticker, holding]));
}

export function readStoredPortfolioState(
  storage: Pick<Storage, "getItem"> | null = portfolioStorage()
): Record<string, Json> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(portfolioStateStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { portfolio?: unknown };
    if (!parsed || typeof parsed !== "object" || !parsed.portfolio || typeof parsed.portfolio !== "object" || Array.isArray(parsed.portfolio)) return null;
    const source = parsed.portfolio as Record<string, Json>;
    const portfolio = Object.fromEntries(
      PERSISTED_PORTFOLIO_KEYS
        .filter((key) => key in source)
        .map((key) => [key, source[key]])
    ) as Record<string, Json>;
    portfolio.holdings = normalizedHoldings(source.holdings) as unknown as Json;
    return portfolio;
  } catch {
    return null;
  }
}

export function writeStoredPortfolioState(
  portfolio: Record<string, Json>,
  storage: Pick<Storage, "setItem"> | null = portfolioStorage()
): void {
  if (!storage) return;
  try {
    const persisted = Object.fromEntries(
      PERSISTED_PORTFOLIO_KEYS
        .filter((key) => key in portfolio)
        .map((key) => [key, portfolio[key]])
    );
    if ("holdings" in portfolio) persisted.holdings = normalizedHoldings(portfolio.holdings);
    storage.setItem(portfolioStateStorageKey, JSON.stringify({
      savedAt: new Date().toISOString(),
      portfolio: persisted,
    }));
  } catch {
    // Browser storage is an optional durability layer; state updates must still succeed.
  }
}

export function hydrateState(
  state: Record<string, unknown>,
  storage: Pick<Storage, "getItem"> | null = portfolioStorage()
): void {
  const stored = readStoredPortfolioState(storage);
  if (stored === null) return;
  const portfolio = state.portfolio;
  if (!portfolio || typeof portfolio !== "object" || Array.isArray(portfolio)) return;
  Object.assign(portfolio, stored);
}

export function wrapOrchestrator(
  next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>
): NonNullable<LoadBundleOptions["wrapOrchestrator"]> {
  return (fallback, state) => {
    const apply = state.apply.bind(state);
    state.apply = (ops) => {
      apply(ops);
      const durableChange = ops.some((op) =>
        op.path === "portfolio"
        || PERSISTED_PORTFOLIO_KEYS.some((key) => op.path === `portfolio.${key}` || op.path.startsWith(`portfolio.${key}.`))
      );
      if (!durableChange) return;
      const portfolio = state.get("portfolio");
      if (portfolio && typeof portfolio === "object" && !Array.isArray(portfolio)) {
        writeStoredPortfolioState(portfolio as Record<string, Json>);
      }
    };
    return next(fallback, state);
  };
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
    ctx.set("portfolio.intelligenceError", ""),
    ctx.set("portfolio.intelligence2", null),
    ctx.set("portfolio.strategies", {}),
    ctx.set("portfolio.recommendation", null),
    ctx.set("portfolio.strategyInputs", null),
    ctx.set("portfolio.pendingStrategyInputs", null),
  ];
}

function currentStrategyInputs(ctx: EffectContext): Json {
  const intelligence2 = ctx.get("portfolio.intelligence2");
  const intelligence1 = ctx.get("portfolio.intelligence");
  const useIntelligence2 = intelligence2 !== null && typeof intelligence2 === "object" && !Array.isArray(intelligence2);
  return {
    positions: ctx.get("portfolio.positions") ?? {},
    summary: ctx.get("portfolio.summary") ?? {},
    investorProfile: ctx.get("portfolio.investorProfile") ?? null,
    intelligenceSource: useIntelligence2 ? "portfolio-intelligence-2" : "portfolio-intelligence",
    intelligence: (useIntelligence2 ? intelligence2 : intelligence1) ?? null,
  } as Json;
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
  prepareStrategies: (ctx) => ({
    ops: [ctx.set("portfolio.pendingStrategyInputs", currentStrategyInputs(ctx))],
  }),
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
