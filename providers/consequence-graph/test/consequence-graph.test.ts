import { test } from "vitest";
import assert from "node:assert/strict";

import { compileCellTopology } from "@gik/profile";
import {
  activateConsequenceGraph,
  consequenceGraphFromTopology,
  inspectConsequenceGraph,
} from "../src/consequence-graph";
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

test("derives consequence inspection from executable cell topology", () => {
  const topology = compileCellTopology("foundry-agent", {
    cells: {
      "foundry-access": {
        id: "foundry-access",
        outputs: [{ token: "foundry-access" }],
      },
      "foundry-chat": {
        id: "foundry-chat",
        inputs: [{ token: "foundry-access" }],
      },
    },
  });

  const graph = consequenceGraphFromTopology(topology);
  assert.deepEqual(graph.nodes, {
    "foundry-access": { id: "foundry-access", kind: "source" },
    "foundry-chat": { id: "foundry-chat", kind: "materialize", dependsOn: ["foundry-access"] },
  });
  assert.deepEqual(inspectConsequenceGraph(graph).edges, [
    { from: "foundry-access", to: "foundry-chat" },
  ]);
});