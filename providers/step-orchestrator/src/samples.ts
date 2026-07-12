import type { FlowRegistry } from "./step-orchestrator";
import type { StepFlowConfig } from "../../vendor/step-machine/index";

export const portfolioRefreshFlow: StepFlowConfig = {
  settings: { start_step: "fetch-prices" },
  steps: {
    "fetch-prices": { transitions: { ok: "revalue" }, retry: { max_attempts: 3 } },
    revalue: { transitions: { ok: "done" } },
  },
  terminal_states: {
    done: { return_intent: "ok", return_artifacts: ["prices", "currentValue"] },
  },
};

export function createPortfolioRefreshRegistry(): FlowRegistry {
  return {
    refreshPortfolio: {
      flow: portfolioRefreshFlow,
      handlers: {
        "fetch-prices": (input: Record<string, unknown>) => ({
          result: "ok",
          data: { prices: { AAPL: 214, MSFT: 472 }, holdings: input.holdings ?? [] },
        }),
        revalue: (input: Record<string, unknown>) => {
          const holdings = Array.isArray(input.holdings) ? input.holdings as Array<{ symbol: string; quantity: number }> : [];
          const prices = (input.prices as Record<string, number> | undefined) ?? {};
          const currentValue = holdings.reduce((sum, item) => sum + (prices[item.symbol] ?? 0) * item.quantity, 0);
          return { result: "ok", data: { prices, currentValue } };
        },
      },
    },
  };
}