import { test, expect, vi } from "vitest";
import { createMemoryStorage, createMemoryStorageRef } from "gik-durable-runtime/storage/memory";
import type { SenseSignal, Json } from "gik-kernel";
import { createBlueprint } from "../src/blueprint";
import { openDurableBlueprintSession } from "../src/worker/session";

function artifact() {
  return createBlueprint({
    id: "feed-reader", kind: "example", version: "1",
    serviceTiers: [{ id: "native", kind: "native" }], serviceRecipes: [],
    projectionTiers: [{ id: "headless", kind: "headless", capabilities: [] }], projectionRecipes: [],
    runtime: { state: { settings: { enabled: true }, counter: { value: 0 } } },
    services: {
      feed: { kind: "feed", version: "1", operations: {
        watch: { operation: "watch", contract: "feed/v1", sense: { kind: "feed", signals: {
          updated: { payloadSchema: { type: "object" } },
        } } },
        read: { operation: "read", contract: "feed/v1" },
      } },
    },
    cells: {
      reader: {
        id: "reader", inputs: [{ token: "settings" }, { token: "counter.value", as: "count" }],
        senses: [{ id: "feed", service: "feed", operation: "watch", when: "inputs.settings.enabled",
          input: { kind: "jsonata", expr: "{}" }, on: { updated: "increment" } }],
        sources: [{ id: "content", service: "feed", operation: "read", when: "inputs.count > 0",
          input: { kind: "jsonata", expr: "{'count':inputs.count}" } }],
        events: { increment: { payloadSchema: { type: "object" } }, configure: { payloadSchema: {
          type: "object", required: ["enabled"], properties: { enabled: { type: "boolean" } },
        } } },
        behavior: { on: {
          increment: [{ do: "assign", target: "counter.value", args: { from: "counter.value + 1" } }],
          configure: [{ do: "assign", target: "settings", args: { from: "$event" } }],
        } },
      },
    },
  });
}

test("durable session resumes state, settles effects and owns Sense cleanup without mutating its Blueprint", async () => {
  const blueprint = artifact(), authored = structuredClone(blueprint);
  const provider = createMemoryStorage(), ref = createMemoryStorageRef("session");
  let emit!: (signal: SenseSignal, input?: Json) => Promise<void>;
  let closed = 0, executed = 0;
  const options = {
    blueprint, runtimeId: "reader", refs: { stateRef: ref, journalRef: ref, effectsQueueRef: ref },
    providers: { memory: provider }, verifyBinding: async () => {}, close: async () => { closed++; },
    onError: (error: unknown) => { throw error; },
    prepare: () => ({
      executeEffect: async () => { executed++; return { sourceOutput: { text: "non-financial content" } }; },
      observe: async (_binding: unknown, deliver: typeof emit) => { emit = deliver; return { close: async () => { closed++; } }; },
    }),
  };
  const session = await openDurableBlueprintSession(options);
  try {
    await emit({ id: "1", name: "updated", payload: {} });
    await vi.waitFor(async () => expect((await session.snapshot()).state.counter).toEqual({ value: 1 }));
    await vi.waitFor(() => expect(executed).toBe(1));
    await expect(session.append({ node: "reader", name: "missing" })).rejects.toMatchObject({ code: "EVENT_REJECTED" });
    await expect(session.append({ node: "reader", name: "configure", payload: { enabled: "yes" } })).rejects.toThrow();
    await session.append({ node: "reader", name: "configure", payload: { enabled: false } });
    expect(closed).toBe(1);
    await expect(emit({ id: "late", name: "updated", payload: {} })).rejects.toThrow("retired");
    expect(blueprint).toEqual(authored);
  } finally { await session.stop(); }
  const resumed = await openDurableBlueprintSession(options);
  try { expect((await resumed.snapshot()).state.counter).toEqual({ value: 1 }); }
  finally { await resumed.stop(); }
  expect(closed).toBe(3);
});

test("incompatible sessions do not replace saved state and denied bindings do not initialize", async () => {
  const provider = createMemoryStorage(), ref = createMemoryStorageRef("compatibility"), blueprint = artifact();
  const options = {
    blueprint, runtimeId: "reader", refs: { stateRef: ref, journalRef: ref, effectsQueueRef: ref }, providers: { memory: provider },
    verifyBinding: async () => {}, close: async () => {}, onError: () => {},
    prepare: () => ({ executeEffect: async () => {}, observe: async () => ({ close: async () => {} }) }),
  };
  const session = await openDurableBlueprintSession(options);
  await session.stop();
  const changed = structuredClone(blueprint);
  changed.payload.version = "2";
  await expect(openDurableBlueprintSession({ ...options, blueprint: changed })).rejects.toMatchObject({ code: "RUNTIME_INCOMPATIBLE" });
  const resumed = await openDurableBlueprintSession(options);
  await resumed.stop();
  await expect(openDurableBlueprintSession({ ...options, verifyBinding: async () => { throw new Error("Binding denied"); } })).rejects.toThrow("Binding denied");
});

test("session shutdown aborts execution but drains its outstanding receipt before closing storage", async () => {
  const provider = createMemoryStorage(), ref = createMemoryStorageRef("drain");
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const receipt = new Promise<void>(resolve => { release = resolve; });
  let storageClosed = false, executionSignal: AbortSignal | undefined;
  const session = await openDurableBlueprintSession({
    blueprint: artifact(), runtimeId: "reader", refs: { stateRef: ref, journalRef: ref, effectsQueueRef: ref }, providers: { memory: provider },
    verifyBinding: async () => {}, close: async () => { storageClosed = true; }, onError: error => { throw error; },
    prepare: () => ({
      observe: async () => ({ close: async () => {} }),
      executeEffect: async (_effect, context) => {
        executionSignal = context.signal; entered(); await receipt;
        return { sourceOutput: { text: "completed" } };
      },
    }),
  });
  await session.append({ node: "reader", name: "increment" });
  await started;
  const stopped = session.stop();
  try {
    expect(executionSignal?.aborted).toBe(true);
    expect(storageClosed).toBe(false);
  } finally { release(); await stopped; }
  expect(storageClosed).toBe(true);
});
