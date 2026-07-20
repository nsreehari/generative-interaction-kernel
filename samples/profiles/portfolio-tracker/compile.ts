import {
  analyzeCellComposition,
  loadProfile,
  traceProfile,
  type CellDefinition,
  type LayerRecipe,
  type StageExecutor,
  type StageTrace,
} from "@gik/profile";
import type { DocNode, DocumentPayload } from "@gik/kernel";

import profileArtifact from "./profile.json" with { type: "json" };
import presentationRecipe from "./portfolio-to-presentation.recipe.json" with { type: "json" };
import runtimeRecipe from "./presentation-to-runtime.recipe.json" with { type: "json" };

export interface PortfolioBlueprintSource {
  id: "portfolio-tracker";
  cells: readonly CellDefinition[];
}

interface PortfolioPresentation {
  id: string;
  cells: Array<CellDefinition & { capability: string; readPath: string }>;
}

export const portfolioBlueprint = loadProfile<LayerRecipe>(
  profileArtifact,
  [presentationRecipe, runtimeRecipe]
);

export const PORTFOLIO_CELLS = portfolioBlueprint.resources.cells as unknown as readonly CellDefinition[];
export const PORTFOLIO_SERVICES = portfolioBlueprint.services ?? {};

const capabilityByCell: Record<string, string> = {
  holdings: "ui:editable-table",
  "market-prices": "ui:table",
  positions: "ui:table",
  summary: "portfolio:summary",
  "portfolio-intelligence": "portfolio:narrative",
  "conservative-rebalance": "portfolio:narrative",
  "growth-rebalance": "portfolio:narrative",
  "rebalance-comparison": "portfolio:recommendation",
};

const readPathByCell: Record<string, string> = {
  holdings: "portfolio.holdings",
  "market-prices": "portfolio.quotes",
  positions: "portfolio.positions",
  summary: "portfolio.summary",
  "portfolio-intelligence": "portfolio.intelligence",
  "conservative-rebalance": "portfolio.strategies.conservative",
  "growth-rebalance": "portfolio.strategies.growth",
  "rebalance-comparison": "portfolio.recommendation",
};

// applyRecommendation is intentionally excluded here: it is human-gated, and its only
// dispatchable path is the rebalance-comparison node's own "apply" event (see below) -
// a root-level alias would be an ungated duplicate control surface.
const portfolioCommands = [
  "setHoldings",
  "upsertHolding",
  "removeHolding",
  "refreshPrices",
  "requestIntelligence",
  "calculateStrategies",
] as const;

// Selected via the shared "control.presentationContext" value (declared in
// samples/scenarios/catalog.json's portfolio-tracker target); WorkspaceView uses it to
// decide whether the holdings/positions overview or the advisory/rebalance narrative leads.

const executors: Record<string, StageExecutor<LayerRecipe>> = {
  "portfolio-to-presentation": (_recipe, input) => {
    const source = input as PortfolioBlueprintSource;
    return {
      id: source.id,
      cells: source.cells.map((cell) => ({
        ...cell,
        capability: capabilityByCell[cell.id],
        readPath: readPathByCell[cell.id],
      })),
    } satisfies PortfolioPresentation;
  },
  "portfolio-presentation-to-runtime": (_recipe, input) => {
    const presentation = input as PortfolioPresentation;
    return {
      root: {
        id: presentation.id,
        capability: "portfolio:workspace",
        props: { title: "Portfolio tracker" },
        edges: {
          read: { presentationContext: "portfolio.presentationContext" },
          react: [{ when: "control.presentationContext", runInitially: true, run: [{ do: "emit", event: "setPresentationContext" }] }],
          on: {
            ...Object.fromEntries(portfolioCommands.map((command) => [
              command,
              [{ do: "invoke" as const, args: { tool: command } }],
            ])),
            setPresentationContext: [{ do: "invoke", args: { tool: "setPresentationContext" } }],
          },
          children: presentation.cells.map((cell): DocNode => ({
            id: cell.id,
            capability: cell.capability,
            props: {
              label: cell.id,
              ...(cell.id === "holdings" ? {
                spec: {
                  schema: {
                    properties: {
                      ticker: { type: "string" },
                      quantity: { type: "number" },
                      costBasis: { type: "number" },
                    },
                  },
                },
              } : {}),
            },
            edges: {
              ...(cell.capability.startsWith("portfolio:")
                ? { read: { value: cell.readPath } }
                : { readExpr: { rows: `$each(${cell.readPath}, function($value) { $value })` } }),
              ...(cell.id === "holdings"
                ? { on: { save: [{ do: "invoke", args: { tool: "saveHoldings" } }] } }
                : cell.id === "rebalance-comparison"
                  ? { on: { apply: [{ do: "invoke", args: { tool: "applyRecommendation" } }] } }
                  : {}),
            },
          })),
        },
      },
    } satisfies DocumentPayload;
  },
};

export const PORTFOLIO_BLUEPRINT_SOURCE: PortfolioBlueprintSource = {
  id: "portfolio-tracker",
  cells: PORTFOLIO_CELLS,
};

export const portfolioComposition = analyzeCellComposition(PORTFOLIO_CELLS);

export function tracePortfolioBlueprint(): StageTrace[] {
  return traceProfile(portfolioBlueprint, PORTFOLIO_BLUEPRINT_SOURCE, {}, executors);
}

export function compilePortfolioDocument(): DocumentPayload {
  return tracePortfolioBlueprint().at(-1)?.output as DocumentPayload;
}

export const blueprint = portfolioBlueprint;
export const lowerBlueprint = compilePortfolioDocument;
