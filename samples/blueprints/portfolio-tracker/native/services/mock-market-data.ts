import type { Json } from "@gik/kernel";
import type { DeterministicServiceHandler } from "../../../../apps/service-kinds/deterministic-agent";

export const MOCK_MARKET_DATA_PROVIDER = "portfolio-market-data-mock";

function asRecord(value: Json | undefined, field: string): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Mock market-data input requires a ${field} object`);
  }
  return value as Record<string, Json>;
}

function generatedPrice(ticker: string): number {
  const hash = [...ticker].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 17);
  return Number((50 + (hash % 45000) / 100).toFixed(2));
}

export const mockMarketDataHandler: DeterministicServiceHandler = (operation, input) => {
  if (operation === "check-access") return { ready: true };
  if (operation !== "fetch-quotes") throw new Error(`Unsupported mock market-data operation '${operation}'`);

  const request = asRecord(input, "request");
  const holdings = asRecord(request.holdings, "holdings");
  return {
    quotes: Object.fromEntries(Object.keys(holdings).map((ticker) => [
      ticker,
      { ticker, price: generatedPrice(ticker) },
    ])),
    provider: MOCK_MARKET_DATA_PROVIDER,
  } as Json;
};