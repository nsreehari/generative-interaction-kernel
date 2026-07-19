import type { Json } from "@gik/kernel";

export const PORTFOLIO_INTELLIGENCE_SERVICE = "portfolio-intelligence";
export const PORTFOLIO_INTELLIGENCE_VERSION = "1";
export const PORTFOLIO_ANALYZE = "analyze";
export const PORTFOLIO_PROPOSE_STRATEGIES = "propose-strategies";

export interface PortfolioServiceInput {
  positions: Record<string, Record<string, Json>>;
  summary: Record<string, Json>;
  investorProfile: Json;
  intelligence?: Json;
}

export interface PortfolioIntelligenceResult {
  summary: string;
  observations: string[];
  risks: string[];
  evidence: string[];
  investorProfile: Json;
  provider: string;
}

export interface PortfolioStrategy {
  id: string;
  rationale: string;
  targetWeights: Record<string, number>;
}

export interface PortfolioStrategiesResult {
  strategies: Record<string, PortfolioStrategy>;
  recommendation: {
    selected: string;
    reason: string;
    status: "proposed";
  };
  provider: string;
}

export const portfolioAnalyzeInputSchema = {
  type: "object",
  required: ["positions", "summary", "investorProfile"],
  properties: {
    positions: { type: "object", additionalProperties: { type: "object" } },
    summary: { type: "object" },
    investorProfile: {},
  },
  additionalProperties: false,
} as const;

export const portfolioIntelligenceOutputSchema = {
  type: "object",
  required: ["summary", "observations", "risks", "evidence", "investorProfile", "provider"],
  properties: {
    summary: { type: "string", minLength: 1 },
    observations: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    investorProfile: {},
    provider: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const portfolioStrategiesInputSchema = {
  type: "object",
  required: ["positions", "summary", "investorProfile", "intelligence"],
  properties: {
    positions: { type: "object", additionalProperties: { type: "object" } },
    summary: { type: "object" },
    investorProfile: {},
    intelligence: { type: "object" },
  },
  additionalProperties: false,
} as const;

export const portfolioStrategiesOutputSchema = {
  type: "object",
  required: ["strategies", "recommendation", "provider"],
  properties: {
    strategies: { type: "object", minProperties: 1, additionalProperties: { type: "object" } },
    recommendation: {
      type: "object",
      required: ["selected", "reason", "status"],
      properties: {
        selected: { type: "string", minLength: 1 },
        reason: { type: "string", minLength: 1 },
        status: { const: "proposed" },
      },
      additionalProperties: false,
    },
    provider: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Portfolio intelligence response has invalid '${field}'`);
  }
  return value;
}

export function parsePortfolioIntelligence(value: unknown): PortfolioIntelligenceResult {
  if (!isRecord(value) || typeof value.summary !== "string" || typeof value.provider !== "string") {
    throw new Error("Portfolio intelligence response is invalid");
  }
  return {
    summary: value.summary,
    observations: strings(value.observations, "observations"),
    risks: strings(value.risks, "risks"),
    evidence: strings(value.evidence, "evidence"),
    investorProfile: (value.investorProfile ?? null) as Json,
    provider: value.provider,
  };
}

export function parsePortfolioStrategies(value: unknown): PortfolioStrategiesResult {
  if (!isRecord(value) || !isRecord(value.strategies) || !isRecord(value.recommendation) || typeof value.provider !== "string") {
    throw new Error("Portfolio strategies response is invalid");
  }
  const strategies = Object.fromEntries(Object.entries(value.strategies).map(([id, strategy]) => {
    if (!isRecord(strategy) || typeof strategy.rationale !== "string" || !isRecord(strategy.targetWeights)) {
      throw new Error(`Portfolio strategy '${id}' is invalid`);
    }
    const targetWeights = Object.fromEntries(Object.entries(strategy.targetWeights).map(([key, weight]) => {
      if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1) {
        throw new Error(`Portfolio strategy '${id}' has invalid target weight '${key}'`);
      }
      return [key, weight];
    }));
    const total = Object.values(targetWeights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 0.001) throw new Error(`Portfolio strategy '${id}' target weights must total 1`);
    return [id, { id, rationale: strategy.rationale, targetWeights }];
  }));
  const selected = value.recommendation.selected;
  if (typeof selected !== "string" || !strategies[selected]) {
    throw new Error("Portfolio recommendation must select a returned strategy");
  }
  if (typeof value.recommendation.reason !== "string" || value.recommendation.status !== "proposed") {
    throw new Error("Portfolio recommendation is invalid");
  }
  return {
    strategies,
    recommendation: { selected, reason: value.recommendation.reason, status: "proposed" },
    provider: value.provider,
  };
}
