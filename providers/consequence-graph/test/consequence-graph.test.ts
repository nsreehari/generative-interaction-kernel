import { test } from "vitest";
import assert from "node:assert/strict";

import { activateConsequenceGraph, inspectConsequenceGraph } from "../src/consequence-graph";
import { portfolioConsequenceSample } from "../src/samples";

test("inspectConsequenceGraph emits the portfolio dependency structure", () => {
  const graph = inspectConsequenceGraph(portfolioConsequenceSample);
  assert.ok(graph.edges.some((edge) => edge.from === "portfolio" && edge.to === "capitalGain"));
  assert.ok(graph.edges.some((edge) => edge.from === "portfolio" && edge.to === "marketPrices"));
  assert.ok(graph.edges.some((edge) => edge.from === "marketPrices" && edge.to === "currentValue"));
});

test("activateConsequenceGraph shows parallel consequence paths after a portfolio change", () => {
  const activation = activateConsequenceGraph(portfolioConsequenceSample, ["portfolio"]);
  assert.deepEqual(activation.parallelStages[0], ["capitalGain", "marketPrices"]);
  assert.deepEqual(activation.parallelStages[1], ["currentValue", "taxExposure"]);
  assert.deepEqual(activation.parallelStages[2], ["recommendations"]);
  assert.deepEqual(activation.blocked, []);
});

test("activateConsequenceGraph reports blocked nodes when an external branch has not completed", () => {
  const activation = activateConsequenceGraph(portfolioConsequenceSample, ["capitalGain"]);
  assert.deepEqual(activation.parallelStages, []);
  assert.deepEqual(activation.blocked, [
    { node: "recommendations", waitingOn: ["currentValue", "taxExposure"] },
    { node: "taxExposure", waitingOn: ["portfolio"] },
  ]);
});