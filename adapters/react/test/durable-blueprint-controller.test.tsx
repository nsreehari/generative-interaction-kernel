import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { test } from "vitest";
import { createBlueprint } from "@gik/blueprint";
import { createIndexedDbStorage } from "@gik/durable-runtime/storage/indexed-db";
import { DurableBlueprintController } from "../src/durable-blueprint-controller";
import type { BundleNative } from "../src/primitives/bundle";

function ref(value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind: "indexed-db", value })).toString("base64url")}`;
}

test("DurableBlueprintController persists Blueprint state", async () => {
  const blueprint = createBlueprint({
    id: "durable-counter",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: ["counter"], state: { counter: { value: 1 } }, capabilities: {} },
    cells: {
      root: {
        id: "root",
        view: { capability: "screen", bindings: { value: { from: "counter.value" } } },
        behavior: { events: { increment: [{ do: "assign", target: "counter.value", args: { value: 2 } }] } },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  const runtimeRef = ref("durable-counter");
  const provider = createIndexedDbStorage({ databaseName: `gik-react-${crypto.randomUUID()}` });
  const runtime = {
    runtimeId: "durable-counter/v1",
    providers: { "indexed-db": provider },
    refs: { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef },
  };

  const first = new DurableBlueprintController(blueprint, { runtime });
  assert.equal((await first.start()).props.value, 1);
  assert.equal((await first.emit("root", "increment")).props.value, 2);

  const reopened = new DurableBlueprintController(blueprint, { runtime });
  assert.equal((await reopened.start()).props.value, 2);
  first.stop();
  reopened.stop();
});

test("DurableBlueprintController persists native effect settlements", async () => {
  const blueprint = createBlueprint({
    id: "durable-effect-counter",
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
  const runtimeRef = ref("durable-effect-counter");
  const provider = createIndexedDbStorage({ databaseName: `gik-react-effect-${crypto.randomUUID()}` });
  const runtime = {
    runtimeId: "durable-effect-counter/v1",
    providers: { "indexed-db": provider },
    refs: { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef },
  };
  const native: BundleNative = {
    effectHandlers: {
      saveValue: (context) => ({ ops: [context.set("counter.value", 7)] }),
    },
  };

  const first = new DurableBlueprintController(blueprint, { runtime, native });
  await first.start();
  assert.equal((await first.emit("root", "save")).props.value, 7);

  const reopened = new DurableBlueprintController(blueprint, { runtime, native });
  assert.equal((await reopened.start()).props.value, 7);
  first.stop();
  reopened.stop();
});

test("DurableBlueprintController refreshes after another controller commits", async () => {
  const blueprint = createBlueprint({
    id: "durable-shared-counter",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: ["counter"], state: { counter: { value: 1 } }, capabilities: {} },
    cells: {
      root: {
        id: "root",
        view: { capability: "screen", bindings: { value: { from: "counter.value" } } },
        behavior: { events: { increment: [{ do: "assign", target: "counter.value", args: { value: 2 } }] } },
      },
    },
    projections: { presentation: { roots: ["root"] } },
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
  const writer = new DurableBlueprintController(blueprint, { runtime });
  const follower = new DurableBlueprintController(blueprint, { runtime });
  await writer.start();
  await follower.start();
  const refreshed = new Promise<void>((resolve) => {
    const unsubscribe = follower.subscribe(() => {
      if (follower.getTree()?.props.value === 2) {
        unsubscribe();
        resolve();
      }
    });
  });

  await writer.emit("root", "increment");
  await refreshed;
  assert.equal(follower.getTree()?.props.value, 2);
  writer.stop();
  follower.stop();
});