import assert from "node:assert/strict";
import { test } from "vitest";
import { loadDemoScenarios, type DemoScenariosJson } from "@gik/demo-runner-host";

import {
  validateDemoCatalog,
  validateDemoComposition,
  validateDemoTargetBundleContract,
  type DemoCatalogEntry,
  type OrganismDemoContract,
  writeDemoNavigation,
  type ScenarioPlan,
} from "../shared/demo-runner";
import { demoCatalog, demoScenariosJson, resolveDemoComposition } from "../shared/demo-catalog";
import { openSampleBlueprint } from "../shared/blueprints";
import { unwrap } from "@gik/kernel";

test("demo catalog resolves a validated scenario and organism composition", () => {
  const composition = resolveDemoComposition("soc-t3");
  assert.equal(composition.entry.targetBlueprintId, "live-workspace-soc");
  assert.equal(composition.scenarioPlan.targetBlueprintId, composition.entry.targetBlueprintId);
  assert.equal(resolveDemoComposition("unknown").entry.id, demoCatalog.default);
  const executive = resolveDemoComposition("soc-executive");
  assert.equal(executive.scenarioPlan.id, "live-workspace-soc-executive");
  assert.equal(executive.scenarioPlan.steps.length, 5);
  assert.equal(executive.scenarioPlan.steps[0].title, "Frame the protected business objective");
  const socPresentationContexts = composition.demoContract.presentationPresets.map((preset) => preset.id);
  for (const composition of [resolveDemoComposition("soc-t3"), executive]) {
    assert.doesNotThrow(() => validateDemoComposition(
      composition.entry,
      composition.scenarioPlan,
      composition.demoContract
    ));
    assert.deepEqual(composition.scenarioPlan.applicableContexts, socPresentationContexts);
  }
});

test("demo navigation changes only the selected demo", () => {
  const url = writeDemoNavigation(
    "https://example.test/?bundle=live-workspace-soc&gik=1&presentation=operator-focus",
    resolveDemoComposition("soc-t3").entry
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("demo"), "soc-t3");
  assert.equal(parsed.searchParams.get("bundle"), "live-workspace-soc");
  assert.equal(parsed.searchParams.get("gik"), "1");
  assert.equal(parsed.searchParams.get("presentation"), "operator-focus");
  assert.deepEqual([...parsed.searchParams.keys()], ["bundle", "gik", "presentation", "demo"]);
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
        targets: {
          "organism-b": {
            commands: [{ command: "start", nodeId: "root", event: "start" }],
            humanGates: [],
            observableOutcomes: [],
            actors: [],
            presentationPresets: [{ id: "default", context: { id: "default" } }],
            focusKinds: [],
            timelineSources: [],
          },
        },
        entries: [{
          id: "demo-a",
          label: "Demo A",
          scenarioBlueprintId: "scenario-a",
          targetBlueprintId: "organism-b",
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
  const socDemoContract = resolveDemoComposition("soc-t3").demoContract;
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
  rejects(() => {}, (value) => { value.steps[0].command = "authorizeContainment"; }, () => {}, /cannot be dispatched automatically/);
  rejects(() => {}, (value) => {
    value.steps[0] = {
      id: "step-a",
      title: "Step A",
      kind: "human-gate",
      command: "establishIntent",
      humanBoundary: { namespace: "soc", kind: "actor", id: "human-priya" },
    };
  }, () => {}, /is not a human gate/);
});

test("demo catalog rejects malformed target contracts", () => {
  const scenario: ScenarioPlan = {
    id: "scenario-a",
    targetBlueprintId: "organism-a",
    title: "Scenario A",
    pace: { manualDurationMs: 1000, autoDurationMs: 100, default: "manual" },
    steps: [{ id: "step-a", title: "Step A", kind: "dispatch", command: "start" }],
  };
  const catalog = {
    default: "demo-a",
    targets: {
      "organism-a": {
        commands: [{ command: "start", nodeId: "root", event: "" }],
        humanGates: [],
        observableOutcomes: [],
        actors: [],
        presentationPresets: [{ id: "default", context: { id: "default" } }],
        focusKinds: [],
        timelineSources: [],
      },
    },
    entries: [{
      id: "demo-a",
      label: "Demo A",
      scenarioBlueprintId: "scenario-a",
      targetBlueprintId: "organism-a",
    }],
  };
  assert.throws(
    () => validateDemoCatalog(catalog, new Map([[scenario.id, scenario]])),
    /invalid command descriptor/
  );
});

test("demo target mappings must reference declared Bundle node events", () => {
  const runtime = openSampleBlueprint("portfolio-tracker");
  const target = structuredClone(demoCatalog.targets["portfolio-tracker"]);
  target.commands[0].event = "missing-event";
  assert.throws(
    () => validateDemoTargetBundleContract(
      "portfolio-tracker",
      target,
      unwrap(runtime.vocabulary),
      unwrap(runtime.program)
    ),
    /unknown event 'missing-event'/
  );
});

test("injected demo commands do not need to be emitted by the node projection", () => {
  const runtime = openSampleBlueprint("portfolio-tracker");
  const manifest = structuredClone(unwrap(runtime.vocabulary));
  const target = structuredClone(demoCatalog.targets["portfolio-tracker"]);
  const rootCapability = unwrap(runtime.program).root.capability;
  manifest.capabilities[rootCapability].emits = [];

  assert.doesNotThrow(() => validateDemoTargetBundleContract(
    "portfolio-tracker",
    target,
    manifest,
    unwrap(runtime.program)
  ));
});

test("host demo resolution accepts bundle-scoped IDs and zero-based indices", () => {
  const intelligenceRebalance = resolveDemoComposition("portfolio-intelligence-rebalance", "portfolio-tracker");
  assert.equal(intelligenceRebalance.entry.id, "portfolio-intelligence-rebalance");
  assert.deepEqual(intelligenceRebalance.scenarioPlan.applicableContexts, ["portfolio-advisor"]);
  assert.equal(resolveDemoComposition("0", "portfolio-tracker").entry.id, "portfolio-baseline");
  assert.equal(resolveDemoComposition("1", "portfolio-tracker").entry.id, "portfolio-dynamic-ticker");
  assert.equal(resolveDemoComposition("2", "portfolio-tracker").entry.id, "portfolio-intelligence-rebalance");
  assert.equal(resolveDemoComposition("999", "portfolio-tracker").entry.id, "portfolio-baseline");
  assert.equal(resolveDemoComposition("wrong", "portfolio-tracker").entry.id, "portfolio-baseline");
  assert.equal(resolveDemoComposition("portfolio-baseline", "live-workspace-soc").entry.id, "soc-t3");
});

test("scenario JSON accepts a focus reference without a relation", () => {
  const scenarios: DemoScenariosJson = {
    catalog: {
      default: "demo-a",
      targets: {
        "blueprint-a": {
          commands: [{ command: "start", nodeId: "root", event: "start" }],
          humanGates: [],
          observableOutcomes: [],
          actors: ["operator-a"],
          presentationPresets: [{ id: "default", context: {} }],
          focusKinds: ["actor"],
          timelineSources: ["scenario"],
        },
      },
      entries: [{
        id: "demo-a",
        label: "Demo A",
        scenarioBlueprintId: "scenario-a",
        targetBlueprintId: "blueprint-a",
        defaultContext: "default",
      }],
    },
    scenarios: [{
      gik: "0.1",
      type: "scenario-blueprint",
      payload: {
        id: "scenario-a",
        targetBlueprintId: "blueprint-a",
        title: "Scenario A",
        applicableContexts: ["default"],
        pace: { manualDurationMs: 1000, autoDurationMs: 100, default: "manual" },
        steps: [{
          id: "step-a",
          title: "Step A",
          kind: "dispatch",
          command: "start",
          actorRef: { namespace: "demo", kind: "actor", id: "operator-a" },
        }],
      },
    }],
  };

  assert.doesNotThrow(() => loadDemoScenarios(scenarios));
});

test("scenario JSON accepts the canonical ui:form props as contextFormSpec", () => {
  const scenarios = structuredClone(demoScenariosJson) as DemoScenariosJson;
  const entry = scenarios.catalog.entries[0];
  entry.contextFormSpec = {
    fields: {
      properties: {
        surface: {
          type: "string",
          title: "Surface",
          enum: ["mobile", "laptop", "desktop"],
          enumNames: ["Mobile", "Laptop", "Desktop"],
        },
        attention: {
          type: "string",
          title: "Attention",
          enum: ["glanceable", "detailed"],
        },
      },
      required: ["surface", "attention"],
    },
    saveLabel: "Apply context",
  };
  assert.doesNotThrow(() => loadDemoScenarios(scenarios));
});