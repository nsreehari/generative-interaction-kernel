import assert from "node:assert/strict";
import { test } from "vitest";

import { socExecutiveScenarioPlan } from "./compile";

test("executive walkthrough is an independently authored SOC scenario", () => {
  assert.equal(socExecutiveScenarioPlan.targetBlueprintId, "live-workspace-soc");
  assert.equal(socExecutiveScenarioPlan.pace.default, "auto");
  assert.equal(socExecutiveScenarioPlan.steps.length, 5);
  assert.deepEqual(socExecutiveScenarioPlan.steps.slice(0, 3).map((step) => step.commands?.length), [2, 5, 5]);
  assert.equal(socExecutiveScenarioPlan.steps[0].title, "Frame the protected business objective");
  assert.equal(socExecutiveScenarioPlan.steps[3].kind, "human-gate");
  assert.equal(socExecutiveScenarioPlan.steps[4].command, "executeContainment");
});