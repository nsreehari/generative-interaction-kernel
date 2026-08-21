import assert from "node:assert/strict";
import { test } from "vitest";
import { createBlueprint } from "@gik/blueprint";
import { BlueprintController } from "../src/index";

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assertion();
}

test("BlueprintController renders and transitions Blueprint-owned in-memory state", async () => {
  const blueprint = createBlueprint({
    id: "counter",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: {
      namespaces: ["counter"],
      state: { counter: { value: 1 } },
      capabilities: {},
    },
    cells: {
      root: {
        id: "root",
        potentialViews: {
          primary: {
            capability: "screen",
            bindings: { value: { from: "counter.value" } },
            region: "root",
          },
        },
        events: { increment: { payloadSchema: { type: "object" } } },
        behavior: {
          on: {
            increment: [{ do: "assign", target: "counter.value", args: { value: 2 } }],
          },
        },
      },
    },
    presentation: { slots: ["root"], root: "root" },
  });
  const controller = new BlueprintController(blueprint);

  assert.equal((await controller.start()).children[0]?.props.value, 1);
  assert.equal((await controller.emit("root--primary--in-root", "increment")).children[0]?.props.value, 1);
  await eventually(() => assert.deepEqual(controller.getState(), { counter: { value: 2 } }));
  controller.stop();
});

test("BlueprintController reuses materialized execution with immutable externalContext", async () => {
  const blueprint = createBlueprint({
    id: "external-context",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: ["counter"], state: { counter: { value: 1 } }, capabilities: {} },
    cells: {
      root: {
        id: "root",
        potentialViews: {
          primary: {
            capability: "screen",
            bindings: { policyValue: { from: "externalContext.policy.nextValue" } },
            region: "root",
          },
        },
        events: { increment: { payloadSchema: { type: "object" } } },
        behavior: {
          on: {
            increment: [{ do: "assign", target: "counter.value", args: { from: "externalContext.policy.nextValue" } }],
          },
        },
      },
    },
    presentation: { slots: ["root"], root: "root" },
  });
  const externalContext = { policy: { nextValue: 2 } };
  const controller = new BlueprintController(blueprint, { externalContext });
  externalContext.policy.nextValue = 99;

  assert.equal((await controller.start()).children[0]?.props.policyValue, 2);
  await controller.emit("root--primary--in-root", "increment");
  await eventually(() => assert.deepEqual(controller.getState(), { counter: { value: 2 } }));
  controller.stop();
});

test("BlueprintController seeds state on the materialized terminal Blueprint", async () => {
  const blueprint = createBlueprint({
    id: "lowered-counter",
    kind: "intent-blueprint",
    version: "1",
    tiers: [
      { id: "intent", kind: "interaction-intent" },
      { id: "runtime", kind: "runtime-program" },
    ],
    recipes: [{
      id: "intent-to-runtime",
      from: "intent",
      to: "runtime",
      patch: [{
        op: "replaceCell",
        cellId: "root",
        cell: {
          id: "root",
          potentialViews: {
            primary: { capability: "screen", bindings: { value: { from: "counter.value" } }, region: "root" },
          },
        },
      }],
    }],
    runtime: { namespaces: ["counter"], state: { counter: { value: 1 } }, capabilities: {} },
    cells: { root: { id: "root" } },
    presentation: { slots: ["root"], root: "root" },
  });
  const controller = new BlueprintController(blueprint, {
    context: { initialSeed: { counter: { value: 7 } } },
  });

  assert.equal((await controller.start()).children[0]?.props.value, 7);
  assert.deepEqual(controller.getState(), { counter: { value: 7 } });
  controller.stop();
});

test("BlueprintController executes ordinary native effects without applying returned operations", async () => {
  const blueprint = createBlueprint({
    id: "worker-counter",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: ["counter"], state: { counter: { value: 1 } }, capabilities: {} },
    cells: {
      root: {
        id: "root",
        potentialViews: {
          primary: { capability: "screen", bindings: { value: { from: "counter.value" } }, region: "root" },
        },
        events: { save: { payloadSchema: { type: "object" } } },
        behavior: { on: { save: [{ do: "invoke", control: { tool: "saveValue" } }] } },
      },
    },
    presentation: { slots: ["root"], root: "root" },
  });
  let releaseEffect!: () => void;
  const blockedEffect = new Promise<void>((resolve) => { releaseEffect = resolve; });
  let effectCompleted!: () => void;
  const completed = new Promise<void>((resolve) => { effectCompleted = resolve; });
  const controller = new BlueprintController(blueprint, {
    native: {
      effectHandlers: {
        saveValue: async (context) => {
          await blockedEffect;
          effectCompleted();
          return { ops: [context.set("counter.value", 7)] };
        },
      },
    },
  });

  await controller.start();
  await controller.emit("root--primary--in-root", "save");
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });

  await controller.settle();
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });

  releaseEffect();
  await completed;
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });
  controller.stop();
});

test("BlueprintController does not retain effects when no native executor is configured", async () => {
  const blueprint = createBlueprint({
    id: "no-native-counter",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: ["counter"], state: { counter: { value: 1 } }, capabilities: {} },
    cells: {
      root: {
        id: "root",
        potentialViews: {
          primary: { capability: "screen", bindings: { value: { from: "counter.value" } }, region: "root" },
        },
        events: { save: { payloadSchema: { type: "object" } } },
        behavior: { on: { save: [{ do: "invoke", control: { tool: "saveValue" } }] } },
      },
    },
    presentation: { slots: ["root"], root: "root" },
  });
  const controller = new BlueprintController(blueprint);

  await controller.start();
  await controller.emit("root--primary--in-root", "save");
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });
  controller.stop();
});

test("BlueprintController retries a failed ordinary effect without applying returned operations", async () => {
  const blueprint = createBlueprint({
    id: "retry-worker-counter",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: ["counter"], state: { counter: { value: 1 } }, capabilities: {} },
    cells: {
      root: {
        id: "root",
        potentialViews: {
          primary: { capability: "screen", bindings: { value: { from: "counter.value" } }, region: "root" },
        },
        events: { save: { payloadSchema: { type: "object" } } },
        behavior: { on: { save: [{ do: "invoke", control: { tool: "saveValue" } }] } },
      },
    },
    presentation: { slots: ["root"], root: "root" },
  });
  let attempts = 0;
  let effectCompleted!: () => void;
  const completed = new Promise<void>((resolve) => { effectCompleted = resolve; });
  const controller = new BlueprintController(blueprint, {
    native: {
      effectHandlers: {
        saveValue: (context) => {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary failure");
          effectCompleted();
          return { ops: [context.set("counter.value", 7)] };
        },
      },
    },
  });

  await controller.start();
  await controller.emit("root--primary--in-root", "save");
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });

  await completed;
  assert.equal(attempts, 2);
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });
  controller.stop();
});