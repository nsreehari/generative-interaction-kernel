import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { test } from "vitest";
import { createBlueprint } from "@gik-ai/blueprint";
import { createIndexedDbStorage } from "@gik-ai/durable-runtime/storage/indexed-db";
import { DurableBlueprintController } from "../src/durable-blueprint-controller";
import { createNativeBlueprintWorker } from "../src/durable-blueprint-worker";
import type { BundleNative } from "../src/primitives/bundle";

function ref(value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind: "indexed-db", value })).toString("base64url")}`;
}

function waitForValue(controller: DurableBlueprintController, value: number): Promise<void> {
  if (controller.getTree()?.children[0]?.props.value === value) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      if (controller.getTree()?.children[0]?.props.value === value) {
        unsubscribe();
        resolve();
      }
    });
  });
}

test("DurableBlueprintController persists Blueprint state", async () => {
  const blueprint = createBlueprint({
    id: "durable-counter",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
    projectionRecipes: [],
    runtime: { state: { counter: { value: 1 } } },
    cells: {
      root: {
        id: "root",
        potentialViews: {
          primary: { capability: "screen", bindings: { value: { from: "counter.value" } }, region: "root" },
        },
        events: { increment: { payloadSchema: { type: "object" } } },
        behavior: { on: { increment: [{ do: "assign", target: "counter.value", args: { value: 2 } }] } },
      },
    },
    presentation: { slots: ["root"], root: "root" , allowedCapabilities: ["screen"]},
  });
  const runtimeRef = ref("durable-counter");
  const provider = createIndexedDbStorage({ databaseName: `gik-react-${crypto.randomUUID()}` });
  const runtime = {
    runtimeId: "durable-counter/v1",
    providers: { "indexed-db": provider },
    refs: { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef },
  };

  const worker = createNativeBlueprintWorker({ blueprint, runtime, native: {} });
  await worker.start();
  const first = new DurableBlueprintController(blueprint, { runtime, worker });
  assert.equal((await first.start()).children[0]?.props.value, 1);
  const committed = waitForValue(first, 2);
  assert.equal((await first.emit("root--primary--in-root", "increment")).children[0]?.props.value, 1);
  await committed;
  assert.equal((await first.start()).children[0]?.props.value, 2);

  const reopened = new DurableBlueprintController(blueprint, { runtime, worker });
  assert.equal((await reopened.start()).children[0]?.props.value, 2);
  first.stop();
  reopened.stop();
  worker.stop();
});

test("DurableBlueprintController does not persist ordinary native effect results", async () => {
  const blueprint = createBlueprint({
    id: "durable-effect-counter",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
    projectionRecipes: [],
    runtime: { state: { counter: { value: 1 } } },
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
    presentation: { slots: ["root"], root: "root" , allowedCapabilities: ["screen"]},
  });
  const runtimeRef = ref("durable-effect-counter");
  const provider = createIndexedDbStorage({ databaseName: `gik-react-effect-${crypto.randomUUID()}` });
  const runtime = {
    runtimeId: "durable-effect-counter/v1",
    providers: { "indexed-db": provider },
    refs: { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef },
  };
  let effectCompleted!: () => void;
  const completed = new Promise<void>((resolve) => { effectCompleted = resolve; });
  const native: BundleNative = {
    effectHandlers: {
      saveValue: (context) => {
        effectCompleted();
        return { ops: [context.set("counter.value", 7)] };
      },
    },
  };

  const worker = createNativeBlueprintWorker({ blueprint, runtime, native });
  await worker.start();
  const first = new DurableBlueprintController(blueprint, { runtime, worker });
  await first.start();
  assert.equal((await first.emit("root--primary--in-root", "save")).children[0]?.props.value, 1);
  await completed;

  const reopened = new DurableBlueprintController(blueprint, { runtime, worker });
  assert.equal((await reopened.start()).children[0]?.props.value, 1);
  first.stop();
  reopened.stop();
  worker.stop();
});

test("DurableBlueprintController leaves ordinary effects for an externally owned worker", async () => {
  const blueprint = createBlueprint({
    id: "remote-worker-counter",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
    projectionRecipes: [],
    runtime: { state: { counter: { value: 1 } } },
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
    presentation: { slots: ["root"], root: "root" , allowedCapabilities: ["screen"]},
  });
  const runtimeRef = ref("remote-worker-counter");
  const provider = createIndexedDbStorage({ databaseName: `gik-react-remote-${crypto.randomUUID()}` });
  const runtime = {
    runtimeId: "remote-worker-counter/v1",
    providers: { "indexed-db": provider },
    refs: { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef },
  };
  const controller = new DurableBlueprintController(blueprint, { runtime });

  await controller.start();
  assert.equal((await controller.emit("root--primary--in-root", "save")).children[0]?.props.value, 1);

  let effectCompleted!: () => void;
  const completed = new Promise<void>((resolve) => { effectCompleted = resolve; });
  const worker = createNativeBlueprintWorker({
    blueprint,
    runtime,
    native: {
      effectHandlers: {
        saveValue: (context) => {
          effectCompleted();
          return { ops: [context.set("counter.value", 7)] };
        },
      },
    },
  });
  await worker.start();
  await completed;
  const reopened = new DurableBlueprintController(blueprint, { runtime });
  assert.equal((await reopened.start()).children[0]?.props.value, 1);
  controller.stop();
  reopened.stop();
  worker.stop();
});

test("DurableBlueprintController refreshes after another controller commits", async () => {
  const blueprint = createBlueprint({
    id: "durable-shared-counter",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
    projectionRecipes: [],
    runtime: { state: { counter: { value: 1 } } },
    cells: {
      root: {
        id: "root",
        potentialViews: {
          primary: { capability: "screen", bindings: { value: { from: "counter.value" } }, region: "root" },
        },
        events: { increment: { payloadSchema: { type: "object" } } },
        behavior: { on: { increment: [{ do: "assign", target: "counter.value", args: { value: 2 } }] } },
      },
    },
    presentation: { slots: ["root"], root: "root" , allowedCapabilities: ["screen"]},
  });
  const listeners = new Set<(event: MessageEvent<unknown>) => void>();
  const provider = createIndexedDbStorage({
    databaseName: `gik-react-shared-${crypto.randomUUID()}`,
    createBroadcastChannel: () => ({
      postMessage(message) {
        const event = { data: message } as MessageEvent<unknown>;
        for (const listener of listeners) listener(event);
      },
      addEventListener(_type, listener) { listeners.add(listener); },
      removeEventListener(_type, listener) { listeners.delete(listener); },
      close() {},
    }),
  });
  const runtimeRef = ref("durable-shared-counter");
  const runtime = {
    runtimeId: "durable-shared-counter/v1",
    providers: { "indexed-db": provider },
    refs: { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef },
  };
  const worker = createNativeBlueprintWorker({ blueprint, runtime, native: {} });
  await worker.start();
  const writer = new DurableBlueprintController(blueprint, { runtime, worker });
  const follower = new DurableBlueprintController(blueprint, { runtime, worker });
  await writer.start();
  await follower.start();
  const refreshed = new Promise<void>((resolve) => {
    const unsubscribe = follower.subscribe(() => {
      if (follower.getTree()?.children[0]?.props.value === 2) {
        unsubscribe();
        resolve();
      }
    });
  });

  await writer.emit("root--primary--in-root", "increment");
  await refreshed;
  assert.equal(follower.getTree()?.children[0]?.props.value, 2);
  writer.stop();
  follower.stop();
  worker.stop();
});