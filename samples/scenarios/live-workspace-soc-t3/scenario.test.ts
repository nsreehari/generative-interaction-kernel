import assert from "node:assert/strict";
import { test } from "vitest";

import { nextScenarioStep } from "../../shared/demo-runner";
import { t3ScenarioPlan } from "./compile";

test("T3 compiles as a scenario targeting the SOC organism Blueprint", () => {
  assert.equal(t3ScenarioPlan.id, "live-workspace-soc-t3");
  assert.equal(t3ScenarioPlan.targetBlueprintId, "live-workspace-soc");
  assert.equal(t3ScenarioPlan.steps.length, 14);
  assert.equal(new Set(t3ScenarioPlan.steps.map((step) => step.id)).size, 14);
});

test("T3 preserves act order and the Priya human boundary", () => {
  assert.equal(nextScenarioStep(t3ScenarioPlan, { stepIndex: 0, advanceToken: 1 })?.command, "establishIntent");
  assert.equal(t3ScenarioPlan.steps[11].command, "recommendContainment");
  assert.deepEqual(t3ScenarioPlan.steps[12], {
    id: "act-13",
    title: "Priya authorizes containment",
    kind: "human-gate",
    humanBoundary: {
      namespace: "soc",
      kind: "actor",
      id: "human-priya",
      relation: "authorized",
    },
  });
  assert.equal(t3ScenarioPlan.steps[13].command, "executeContainment");
});