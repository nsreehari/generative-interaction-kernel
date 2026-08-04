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

function waitForState(
  controller: BlueprintController,
  predicate: (state: Record<string, unknown>) => boolean,
): Promise<void> {
  if (predicate(controller.getState())) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      if (predicate(controller.getState())) {
        unsubscribe();
        resolve();
      }
    });
  });
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
        view: {
          capability: "screen",
          bindings: { value: { from: "counter.value" } },
        },
        behavior: {
          events: {
            increment: [{ do: "assign", target: "counter.value", args: { value: 2 } }],
          },
        },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  const controller = new BlueprintController(blueprint);

  assert.equal((await controller.start()).props.value, 1);
  assert.equal((await controller.emit("root", "increment")).props.value, 1);
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
        view: {
          capability: "screen",
          bindings: { policyValue: { from: "externalContext.policy.nextValue" } },
        },
        behavior: {
          events: {
            increment: [{ do: "assign", target: "counter.value", args: { from: "externalContext.policy.nextValue" } }],
          },
        },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  const externalContext = { policy: { nextValue: 2 } };
  const controller = new BlueprintController(blueprint, { externalContext });
  externalContext.policy.nextValue = 99;

  assert.equal((await controller.start()).props.policyValue, 2);
  await controller.emit("root", "increment");
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
          kind: "runtime-cell",
          view: { capability: "screen", bindings: { value: { from: "counter.value" } } },
        },
      }],
    }],
    runtime: { namespaces: ["counter"], state: { counter: { value: 1 } }, capabilities: {} },
    cells: { root: { id: "root", kind: "intent-cell" } },
    projections: { presentation: { roots: ["root"] } },
  });
  const controller = new BlueprintController(blueprint, {
    context: { initialSeed: { counter: { value: 7 } } },
  });

  assert.equal((await controller.start()).props.value, 7);
  assert.deepEqual(controller.getState(), { counter: { value: 7 } });
  controller.stop();
});

test("BlueprintController settles native effects through its worker after the initiating transition", async () => {
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
        view: { capability: "screen", bindings: { value: { from: "counter.value" } } },
        behavior: { events: { save: [{ do: "invoke", args: { tool: "saveValue" } }] } },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  let releaseEffect!: () => void;
  const blockedEffect = new Promise<void>((resolve) => { releaseEffect = resolve; });
  const controller = new BlueprintController(blueprint, {
    native: {
      effectHandlers: {
        saveValue: async (context) => {
          await blockedEffect;
          return { ops: [context.set("counter.value", 7)] };
        },
      },
    },
  });

  await controller.start();
  await controller.emit("root", "save");
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });

  await controller.settle();
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });

  const settled = waitForState(controller, (state) =>
    (state.counter as { value: number }).value === 7);
  releaseEffect();
  await settled;
  assert.deepEqual(controller.getState(), { counter: { value: 7 } });
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
        view: { capability: "screen", bindings: { value: { from: "counter.value" } } },
        behavior: { events: { save: [{ do: "invoke", args: { tool: "saveValue" } }] } },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  const controller = new BlueprintController(blueprint);

  await controller.start();
  await controller.emit("root", "save");
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });
  controller.stop();
});

test("BlueprintController retries a failed effect asynchronously", async () => {
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
        view: { capability: "screen", bindings: { value: { from: "counter.value" } } },
        behavior: { events: { save: [{ do: "invoke", args: { tool: "saveValue" } }] } },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  let attempts = 0;
  const controller = new BlueprintController(blueprint, {
    native: {
      effectHandlers: {
        saveValue: (context) => {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary failure");
          return { ops: [context.set("counter.value", 7)] };
        },
      },
    },
  });

  await controller.start();
  await controller.emit("root", "save");
  assert.deepEqual(controller.getState(), { counter: { value: 1 } });

  await waitForState(controller, (state) =>
    (state.counter as { value: number }).value === 7);
  assert.equal(attempts, 2);
  assert.deepEqual(controller.getState(), { counter: { value: 7 } });
  controller.stop();
});