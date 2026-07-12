import { test } from "vitest";
import assert from "node:assert/strict";

import { evaluateExploratoryFrontier, inspectExploratoryGraph } from "../src/exploratory-graph";
import { educationExploratorySample } from "../src/samples";

test("inspectExploratoryGraph captures the education branch structure", () => {
  const graph = inspectExploratoryGraph(educationExploratorySample);
  assert.ok(graph.edges.some((edge) => edge.from === "tenthComplete" && edge.to === "choose12th" && edge.kind === "unlock"));
  assert.ok(graph.edges.some((edge) => edge.from === "choose12th" && edge.to === "engineering" && edge.optionId === "mpc"));
});

test("evaluateExploratoryFrontier exposes the 12th-class choice after 10th completion", () => {
  const frontier = evaluateExploratoryFrontier(educationExploratorySample, ["tenthComplete"]);
  assert.deepEqual(frontier.availableChoices.map((choice) => choice.id), ["choose12th"]);
  assert.equal(frontier.availableChoices[0].options.length, 3);
});

test("selecting MPC unlocks only the MPC downstream education paths", () => {
  const frontier = evaluateExploratoryFrontier(educationExploratorySample, ["tenthComplete"], { choose12th: "mpc" });
  assert.ok(frontier.unlocked.includes("intermediateMPC"));
  assert.ok(frontier.unlocked.includes("engineering"));
  assert.ok(frontier.unlocked.includes("dataScience"));
  assert.ok(!frontier.unlocked.includes("medicine"));
  assert.ok(!frontier.unlocked.includes("commerce"));
});