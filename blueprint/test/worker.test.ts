import assert from "node:assert/strict";
import { test } from "vitest";
import { createDurableRuntime } from "@gik/durable-runtime";

import { createBlueprint } from "../src/blueprint";
import {
  createBlueprintDurableEffectSettlementEvent,
  createBlueprintDurableTransitionAdapter,
} from "../src/durable-transition";
import { createBlueprintWorker } from "../src/worker";
import { createInMemoryBlueprintExecution } from "../src/worker/in-memory";

function ref(value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind: "memory", value })).toString("base64url")}`;
}

test("Blueprint worker processes one engine and queue cycle per notification", async () => {
  const calls: string[] = [];
  let releaseFirstEngine!: () => void;
  const firstEngine = new Promise<void>((resolve) => { releaseFirstEngine = resolve; });
  let cycleCompleted!: () => void;
  const completed = new Promise<void>((resolve) => { cycleCompleted = resolve; });
  const worker = createBlueprintWorker({
    request: {
      stateRef: "state",
      journalRef: "journal",
      effectsQueueRef: "effects",
    },
    subscribe: () => undefined,
    runtime: {
      async processEngineWake() {
        calls.push("engine");
        if (calls.length === 1) await firstEngine;
        return { status: "committed" };
      },
      async processQueueLaneItem() {
        calls.push("queue");
        cycleCompleted();
        return { status: "completed" };
      },
    },
  });

  await worker.start();
  assert.deepEqual(calls, ["engine"]);

  releaseFirstEngine();
  await completed;
  assert.deepEqual(calls, ["engine", "queue"]);
  worker.stop();
});

test("Blueprint worker pauses when engine ownership is unavailable", async () => {
  let queueCalls = 0;
  let engineCalled!: () => void;
  const attempted = new Promise<void>((resolve) => { engineCalled = resolve; });
  const worker = createBlueprintWorker({
    request: {
      stateRef: "state",
      journalRef: "journal",
      effectsQueueRef: "effects",
    },
    subscribe: () => undefined,
    runtime: {
      async processEngineWake() {
        engineCalled();
        return { status: "busy" };
      },
      async processQueueLaneItem() {
        queueCalls += 1;
        return { status: "idle" };
      },
    },
  });

  await worker.start();
  await attempted;

  assert.equal(queueCalls, 0);
  worker.stop();
});

test("Blueprint worker retries engine ownership contention asynchronously", async () => {
  let engineCalls = 0;
  let recovered!: () => void;
  const recovery = new Promise<void>((resolve) => { recovered = resolve; });
  const worker = createBlueprintWorker({
    request: { stateRef: "state", journalRef: "journal", effectsQueueRef: "effects" },
    subscribe: () => undefined,
    runtime: {
      async processEngineWake() {
        engineCalls += 1;
        return { status: engineCalls === 1 ? "busy" : "idle" };
      },
      async processQueueLaneItem() {
        recovered();
        return { status: "idle" };
      },
    },
  });

  await worker.start();
  await recovery;
  assert.equal(engineCalls, 2);
  worker.stop();
});

test("Blueprint worker schedules one follow-up cycle for a retryable effect", async () => {
  let queueCalls = 0;
  let completed!: () => void;
  const retried = new Promise<void>((resolve) => { completed = resolve; });
  const worker = createBlueprintWorker({
    request: {
      stateRef: "state",
      journalRef: "journal",
      effectsQueueRef: "effects",
    },
    subscribe: () => undefined,
    runtime: {
      async processEngineWake() {
        return { status: "idle" };
      },
      async processQueueLaneItem() {
        queueCalls += 1;
        if (queueCalls === 1) return { status: "retry", messageId: "effect-1", error: "temporary" };
        completed();
        return { status: "completed", messageId: "effect-1", appended: [] };
      },
    },
  });

  await worker.start();
  await retried;

  assert.equal(queueCalls, 2);
  worker.stop();
});

test("in-memory Blueprint execution runs headlessly through the same worker contract", async () => {
  const blueprint = createBlueprint({
    id: "headless-counter",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: ["counter"], state: { counter: { value: 1 } }, capabilities: {} },
    cells: {
      root: {
        id: "root",
        view: { capability: "screen" },
        behavior: { events: { save: [{ do: "invoke", args: { tool: "saveValue" } }] } },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  const runtimeRef = ref("headless-counter");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };
  const execution = createInMemoryBlueprintExecution({
    blueprint,
    runtimeId: "headless-counter/v1",
    refs,
  });
  const runtime = createDurableRuntime({
    ...execution.runtime,
    transitionAdapter: createBlueprintDurableTransitionAdapter({ blueprint }),
  });
  const worker = execution.createWorker({
    executeEffect: () => ({ ops: [{ op: "set", path: "counter.value", value: 7 }] }),
  });

  await runtime.initializeRuntime(refs);
  await runtime.appendJournal({ ...refs, entry: { node: "root", name: "save" } });
  await worker.start();
  let snapshot = await runtime.readSnapshot<Record<string, unknown>, object>(refs);
  for (let attempt = 0; attempt < 100 && (snapshot.state as { counter: { value: number } }).counter.value !== 7; attempt += 1) {
    await Promise.resolve();
    snapshot = await runtime.readSnapshot<Record<string, unknown>, object>(refs);
  }
  assert.deepEqual(snapshot.state, { counter: { value: 7 } });
  worker.stop();
});

test("void effects append a successful settlement receipt", async () => {
  const blueprint = createBlueprint({
    id: "void-effect",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: [], state: {}, capabilities: {} },
    cells: {
      root: {
        id: "root",
        view: { capability: "screen" },
        behavior: { events: { save: [{ do: "invoke", args: { tool: "saveValue" } }] } },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  const runtimeRef = ref("void-effect");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };
  const execution = createInMemoryBlueprintExecution({
    blueprint,
    runtimeId: "void-effect/v1",
    refs,
  });
  const runtime = createDurableRuntime({
    ...execution.runtime,
    transitionAdapter: createBlueprintDurableTransitionAdapter({ blueprint }),
  });
  const worker = execution.createWorker({ executeEffect: () => undefined });

  await runtime.initializeRuntime(refs);
  await runtime.appendJournal({ ...refs, entry: { node: "root", name: "save" } });
  await worker.start();
  let snapshot = await runtime.readSnapshot<Record<string, unknown>, { settledEffectMessageIds: string[] }>(refs);
  for (let attempt = 0; attempt < 100 && snapshot.spec.settledEffectMessageIds.length === 0; attempt += 1) {
    await Promise.resolve();
    snapshot = await runtime.readSnapshot<Record<string, unknown>, { settledEffectMessageIds: string[] }>(refs);
  }
  assert.equal(snapshot.spec.settledEffectMessageIds.length, 1);
  worker.stop();
});

test("duplicate settlement receipts do not replay their follow-up events", async () => {
  const blueprint = createBlueprint({
    id: "settlement-replay",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: [], state: {}, capabilities: {} },
    cells: {
      root: {
        id: "root",
        view: { capability: "screen" },
        behavior: { events: { save: [{ do: "invoke", args: { tool: "saveValue" } }] } },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  const adapter = createBlueprintDurableTransitionAdapter({ blueprint });
  const receipt = createBlueprintDurableEffectSettlementEvent("message-1", {
    events: [{ node: "root", name: "save" }],
  });
  const first = await adapter.transition({
    state: adapter.initialState(),
    spec: adapter.initialSpec(),
    events: [receipt, receipt],
  });
  const updatedSpec = adapter.applySpecUpdates({
    spec: adapter.initialSpec(),
    updates: first.specUpdates ?? [],
  });
  const replay = await adapter.transition({
    state: first.state,
    spec: updatedSpec,
    events: [receipt],
  });

  assert.equal(first.effects.length, 1);
  assert.equal(replay.effects.length, 0);
});