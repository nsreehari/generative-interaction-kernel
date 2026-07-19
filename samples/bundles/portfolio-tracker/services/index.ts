import type {
  Json,
  OrchestratorResult,
  ServiceDeclaration,
  ServiceUse,
  StateModel,
} from "@gik/kernel";
import type { LoadBundleOptions } from "@gik/react";
import {
  bindServiceUseSync,
  QueueFace,
  type ServiceExecutionResult,
  type ServiceRequestInput,
} from "@gik/controlface";
import { createSampleServiceKindRegistry } from "../../../services";
import manifest from "../manifest.json" with { type: "json" };
import {
  PORTFOLIO_ANALYZE,
  PORTFOLIO_INTELLIGENCE_SERVICE,
  PORTFOLIO_PROPOSE_STRATEGIES,
  parsePortfolioIntelligence,
  parsePortfolioStrategies,
  type PortfolioServiceInput,
} from "../service-contract";

export const DETERMINISTIC_PORTFOLIO_PROVIDER = "portfolio-intelligence-deterministic";

function inputOf(request: ServiceRequestInput): PortfolioServiceInput {
  const input = request.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Portfolio service input must be an object");
  }
  const value = input as Record<string, Json>;
  const positions = value.positions;
  const summary = value.summary;
  if (!positions || typeof positions !== "object" || Array.isArray(positions)
    || !summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new Error("Portfolio service input requires positions and summary objects");
  }
  return {
    positions: positions as Record<string, Record<string, Json>>,
    summary: summary as Record<string, Json>,
    investorProfile: value.investorProfile ?? null,
    intelligence: value.intelligence,
  };
}

function deterministicOutput(operation: string, value: Json): Json {
  const input = inputOf({ service: PORTFOLIO_INTELLIGENCE_SERVICE, operation, input: value });
  if (operation === PORTFOLIO_ANALYZE) {
    const largest = Object.values(input.positions).sort(
      (left, right) => Number(right.value ?? 0) - Number(left.value ?? 0)
    )[0];
    return {
      summary: "The portfolio is concentrated in its largest position and can benefit from a bounded rebalance.",
      observations: [
        `Largest position: ${String(largest?.ticker ?? "none")}`,
        `Market value: ${Number(input.summary.marketValue ?? 0).toFixed(2)}`,
      ],
      risks: ["single-name concentration", "market-price volatility"],
      evidence: ["portfolio.positions", "portfolio.summary", "portfolio.investorProfile"],
      investorProfile: input.investorProfile,
      provider: DETERMINISTIC_PORTFOLIO_PROVIDER,
    };
  }
  if (!input.intelligence) throw new Error("Strategy proposal requires completed portfolio intelligence");
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
  };
}

function normalizedOutput(operation: string, output: unknown): Json {
  if (operation === PORTFOLIO_ANALYZE) return parsePortfolioIntelligence(output) as unknown as Json;
  if (operation === PORTFOLIO_PROPOSE_STRATEGIES) return parsePortfolioStrategies(output) as unknown as Json;
  throw new Error(`Unsupported portfolio operation '${operation}'`);
}

function requestFromState(state: StateModel, operation: string, actorId?: string): ServiceRequestInput {
  const input: Record<string, Json> = {
    positions: state.get("portfolio.positions"),
    summary: state.get("portfolio.summary"),
    investorProfile: state.get("portfolio.investorProfile"),
  };
  if (operation === PORTFOLIO_PROPOSE_STRATEGIES) input.intelligence = state.get("portfolio.intelligence");
  return { service: PORTFOLIO_INTELLIGENCE_SERVICE, operation, input, actorId };
}

function settleIntelligence(result: ServiceExecutionResult): OrchestratorResult {
  const value = parsePortfolioIntelligence(result.output);
  return { ops: [{ op: "set", path: "portfolio.intelligence", value: value as unknown as Json }] };
}

function settleStrategies(result: ServiceExecutionResult): OrchestratorResult {
  const value = parsePortfolioStrategies(result.output);
  return {
    ops: [
      ...Object.entries(value.strategies).map(([id, strategy]) => ({
        op: "set" as const,
        path: `portfolio.strategies.${id}`,
        value: strategy as unknown as Json,
      })),
      { op: "set", path: "portfolio.recommendation", value: value.recommendation as unknown as Json },
    ],
    detail: { provider: value.provider },
  };
}

export function createPortfolioQueueFace(
  state: StateModel,
  declarations: Record<string, ServiceDeclaration>
): QueueFace {
  const queueFace = new QueueFace();
  const registry = createSampleServiceKindRegistry({
    deterministicHandlers: {
      [DETERMINISTIC_PORTFOLIO_PROVIDER]: (operation, input) =>
        normalizedOutput(operation, deterministicOutput(operation, input)),
    },
  });
  const uses: Array<{
    use: ServiceUse;
    invoke: string;
    settle: (result: ServiceExecutionResult) => OrchestratorResult;
  }> = [
    {
      use: {
        service: PORTFOLIO_INTELLIGENCE_SERVICE,
        operation: PORTFOLIO_ANALYZE,
        contract: "portfolio-intelligence/v1",
      },
      invoke: "requestIntelligence",
      settle: settleIntelligence,
    },
    {
      use: {
        service: PORTFOLIO_INTELLIGENCE_SERVICE,
        operation: PORTFOLIO_PROPOSE_STRATEGIES,
        contract: "portfolio-strategies/v1",
      },
      invoke: "calculateStrategies",
      settle: settleStrategies,
    },
  ];
  for (const { use, invoke, settle } of uses) {
    bindServiceUseSync(queueFace, registry, declarations, use, {
      blueprintId: "portfolio-tracker",
      blueprintRevision: "1.0.0",
      invoke,
      mapRequest: (effect) => requestFromState(state, use.operation, effect.actorId),
      mapResult: settle,
    });
  }
  return queueFace;
}

const declarations = manifest.payload.externals.services as Record<string, ServiceDeclaration>;

export const wrapOrchestrator: NonNullable<LoadBundleOptions["wrapOrchestrator"]> = (fallback, state) => {
  const queueFace = createPortfolioQueueFace(state, declarations);
  queueFace.assertSatisfies(declarations);
  return queueFace.createOrchestrator(fallback);
};
