import assert from "node:assert/strict";
import { test } from "vitest";

import {
  validateDemoCatalog,
  validateDemoComposition,
  type DemoCatalogEntry,
  type OrganismDemoContract,
  writeDemoNavigation,
  type ScenarioPlan,
} from "../shared/demo-runner";
import { demoCatalog, resolveDemoComposition, socDemoContract } from "./catalog";

test("demo catalog resolves a validated scenario and organism composition", () => {
  const composition = resolveDemoComposition("soc-t3");
  assert.equal(composition.entry.targetBlueprintId, "live-workspace-soc");
  assert.equal(composition.scenarioPlan.targetBlueprintId, composition.entry.targetBlueprintId);
  assert.equal(resolveDemoComposition("unknown").entry.id, demoCatalog.default);
  const executive = resolveDemoComposition("soc-executive");
  assert.equal(executive.scenarioPlan.id, "live-workspace-soc-executive");
  assert.equal(executive.scenarioPlan.steps.length, 5);
  assert.equal(executive.scenarioPlan.steps[0].title, "Frame the protected business objective");
  for (const composition of [resolveDemoComposition("soc-t3"), executive]) {
    assert.doesNotThrow(() => validateDemoComposition(composition.entry, composition.scenarioPlan, socDemoContract));
  }
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

test("composition validation rejects unsupported scenario requirements", () => {
  const entry: DemoCatalogEntry = {
    id: "demo-a",
    label: "Demo A",
    scenarioBlueprintId: "scenario-a",
    targetBlueprintId: "live-workspace-soc",
    bundleId: "live-workspace-soc",
    defaultContext: "war-room",
    requiredTimelineSources: ["scenario", "organism"],
  };
  const scenario: ScenarioPlan = {
    id: "scenario-a",
    targetBlueprintId: "live-workspace-soc",
    title: "Scenario A",
    pace: { manualDurationMs: 1000, autoDurationMs: 100, default: "manual" },
    steps: [{ id: "step-a", title: "Step A", kind: "dispatch", command: "establishIntent", actorRef: { namespace: "soc", kind: "actor", id: "human-morgan" } }],
  };
  const rejects = (mutateEntry: (value: DemoCatalogEntry) => void, mutateScenario: (value: ScenarioPlan) => void, mutateContract: (value: OrganismDemoContract) => void, message: RegExp) => {
    const nextEntry = structuredClone(entry);
    const nextScenario = structuredClone(scenario);
    const nextContract = structuredClone(socDemoContract);
    mutateEntry(nextEntry);
    mutateScenario(nextScenario);
    mutateContract(nextContract);
    assert.throws(() => validateDemoComposition(nextEntry, nextScenario, nextContract), message);
  };
  rejects(() => {}, (value) => { value.steps[0].command = "unknown"; }, () => {}, /Unsupported scenario command/);
  rejects(() => {}, (value) => { value.steps[0].actorRef!.id = "unknown"; }, () => {}, /Unsupported scenario actor/);
  rejects((value) => { value.defaultContext = "unknown"; }, () => {}, () => {}, /Unsupported presentation context/);
  rejects(() => {}, (value) => { value.steps[0].focusRefs = [{ namespace: "soc", kind: "cell", id: "intent" }]; }, (value) => { value.focusKinds = value.focusKinds.filter((kind) => kind !== "cell"); }, /Unsupported focus kind/);
  rejects(() => {}, () => {}, (value) => { value.timelineSources = ["scenario"]; }, /Unsupported timeline source/);
});