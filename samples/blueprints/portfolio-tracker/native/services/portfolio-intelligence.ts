import type { Json } from "@gik/kernel";
import type { DeterministicServiceHandler } from "../../../../service-kinds/deterministic-agent";

export const DETERMINISTIC_PORTFOLIO_PROVIDER = "portfolio-intelligence-deterministic";

function record(value: Json | undefined, field: string): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Portfolio service input requires a ${field} object`);
  }
  return value as Record<string, Json>;
}

export const portfolioIntelligenceHandler: DeterministicServiceHandler = (operation, input) => {
  const request = record(input, "request");
  const positions = record(request.positions, "positions");
  const summary = record(request.summary, "summary");
  if (operation === "analyze") {
    const largest = Object.values(positions).sort((left, right) => {
      const leftValue = typeof left === "object" && left && !Array.isArray(left) ? Number(left.value ?? 0) : 0;
      const rightValue = typeof right === "object" && right && !Array.isArray(right) ? Number(right.value ?? 0) : 0;
      return rightValue - leftValue;
    })[0] as Record<string, Json> | undefined;
    return {
      summary: "The portfolio is concentrated in its largest position and can benefit from a bounded rebalance.",
      observations: [
        `Largest position: ${String(largest?.ticker ?? "none")}`,
        `Market value: ${Number(summary.marketValue ?? 0).toFixed(2)}`,
      ],
      risks: ["single-name concentration", "market-price volatility"],
      evidence: ["portfolio.positions", "portfolio.summary", "portfolio.investorProfile"],
      investorProfile: request.investorProfile ?? null,
      provider: DETERMINISTIC_PORTFOLIO_PROVIDER,
    } as Json;
  }
  if (operation !== "propose-strategies") {
    throw new Error(`Unsupported portfolio operation '${operation}'`);
  }
  if (!request.intelligence) throw new Error("Strategy proposal requires completed portfolio intelligence");
  return {
    strategies: {
      conservative: {
        id: "conservative",
        rationale: "Reduce concentration and preserve a defensive allocation.",
        targetWeights: { equities: 0.65, defensive: 0.35 },
      },
      growth: {
        id: "growth",
        rationale: "Retain growth exposure while capping the largest position.",
        targetWeights: { equities: 0.85, defensive: 0.15 },
      },
    },
    recommendation: {
      selected: "conservative",
      reason: "The moderate investor profile favors drawdown control.",
      status: "proposed",
    },
    provider: DETERMINISTIC_PORTFOLIO_PROVIDER,
  } as Json;
};
