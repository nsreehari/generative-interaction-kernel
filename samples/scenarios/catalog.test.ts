import assert from "node:assert/strict";
import { test } from "vitest";

import {
  validateDemoCatalog,
  writeDemoNavigation,
  type ScenarioPlan,
} from "../shared/demo-runner";
import { demoCatalog, resolveDemoComposition } from "./catalog";

test("demo catalog resolves a validated scenario and organism composition", () => {
  const composition = resolveDemoComposition("soc-t3");
  assert.equal(composition.entry.targetBlueprintId, "live-workspace-soc");
  assert.equal(composition.scenarioPlan.targetBlueprintId, composition.entry.targetBlueprintId);
  assert.equal(resolveDemoComposition("unknown").entry.id, demoCatalog.default);
  const executive = resolveDemoComposition("soc-executive");
  assert.equal(executive.scenarioPlan.id, "live-workspace-soc-executive");
  assert.equal(executive.scenarioPlan.steps[0].title, "Set the investigation objective");
});

test("demo navigation atomically selects the composition bundle and context", () => {
  const url = writeDemoNavigation(
    "https://example.test/?bundle=samples-overview&plane=blueprint",
    resolveDemoComposition("soc-t3").entry
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("demo"), "soc-t3");
  assert.equal(parsed.searchParams.get("bundle"), "live-workspace-soc");
  assert.equal(parsed.searchParams.get("context"), "war-room");
  assert.equal(parsed.searchParams.has("plane"), false);
});

test("demo catalog rejects a scenario and organism target mismatch", () => {
  const scenario: ScenarioPlan = {
    id: "scenario-a",
    targetBlueprintId: "organism-a",
    title: "Scenario A",
    pace: { manualDurationMs: 1000, autoDurationMs: 100, default: "manual" },
    steps: [{ id: "step-a", title: "Step A", kind: "dispatch", command: "start" }],
  };
  assert.throws(
    () => validateDemoCatalog(
      {
        default: "demo-a",
        entries: [{
          id: "demo-a",
          label: "Demo A",
          scenarioBlueprintId: "scenario-a",
          targetBlueprintId: "organism-b",
          bundleId: "bundle-b",
        }],
      },
      new Map([[scenario.id, scenario]])
    ),
    /targets 'organism-b'.*targets 'organism-a'/
  );
});