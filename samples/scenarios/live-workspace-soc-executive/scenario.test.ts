import assert from "node:assert/strict";
import { test } from "vitest";

import { socExecutiveScenarioPlan } from "./compile";

test("executive walkthrough is an independently authored SOC scenario", () => {
  assert.equal(socExecutiveScenarioPlan.targetBlueprintId, "live-workspace-soc");
  assert.equal(socExecutiveScenarioPlan.steps.length, 14);
  assert.equal(socExecutiveScenarioPlan.steps[0].title, "Set the investigation objective");
  assert.equal(socExecutiveScenarioPlan.steps[12].kind, "human-gate");
  assert.equal(socExecutiveScenarioPlan.steps[13].command, "executeContainment");
});