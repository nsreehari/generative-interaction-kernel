import type { ConsequenceGraphDefinition } from "./consequence-graph";

export const portfolioConsequenceSample: ConsequenceGraphDefinition = {
  id: "portfolio-refresh",
  nodes: {
    portfolio: { id: "portfolio", kind: "source", label: "Portfolio" },
    capitalGain: { id: "capitalGain", kind: "compute", dependsOn: ["portfolio"] },
    marketPrices: { id: "marketPrices", kind: "effect", dependsOn: ["portfolio"] },
    taxExposure: { id: "taxExposure", kind: "compute", dependsOn: ["portfolio", "capitalGain"] },
    currentValue: { id: "currentValue", kind: "materialize", dependsOn: ["portfolio", "marketPrices"] },
    recommendations: { id: "recommendations", kind: "materialize", dependsOn: ["currentValue", "taxExposure"] },
  },
};