import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { test } from "vitest";

import { createDurableRuntime } from "../src/runtime/browser-runtime";
import { createAzureFunctionConnector } from "../src/connectors/azure-function";
import { createFilesystemMcpConnector } from "../src/connectors/filesystem-mcp";
import { createIndexedDbStorage } from "../src/storage/indexed-db";
import type { DurableProvider, TransitionSnapshot } from "../src/contracts";

function ref(kind: string, value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind, value })).toString("base64url")}`;
}

function provider(snapshot: TransitionSnapshot): DurableProvider & { commits: unknown[]; aborts: unknown[] } {
  const commits: unknown[] = [];
  const aborts: unknown[] = [];
  return {
    commits,
    aborts,
    appendJournal: async (request) => ({ id: "entry-appended", payload: request.entry }),
    readEngineWake: async () => ({ requestedAt: null, processedAt: null }),
    markEngineWakeProcessed: async () => {},
    initializeRuntime: async () => ({ created: true, revision: "revision-1" }),
    acquireTransition: async () => snapshot as never,
    async commitTransition(request) {
      commits.push(request);
      return { ok: true, revision: "revision-2" };
    },
    async abortTransition(request) {
      aborts.push(request);
      return true;
    },
  };
}

const counterAdapter = {
  initialState: () => ({ count: 0 }),
  initialSpec: () => ({ multiplier: 1 }),
  transition: ({ state, spec, events }: { state: unknown; spec: unknown; events: readonly unknown[] }) => {
    const count = (state as { count: number }).count
      + Number((events[0] as { amount: number }).amount) * (spec as { multiplier: number }).multiplier;
    return {
      state: { count },
      effects: [{ type: "count-changed", count }],
      specUpdates: [{ multiplier: 2 }],
    };
  },
  applySpecUpdates: ({ spec, updates }: { spec: unknown; updates: readonly unknown[] }) => ({
    ...(spec as object),
    ...(updates.at(-1) as object | undefined),
  }),
};

test("runtime applies spec updates and commits opaque transition output", async () => {
  const storage = provider({
    leaseToken: "lease-1",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    state: { count: 1 },
    spec: { multiplier: 1 },
    revision: "revision-1",
    cursor: null,
    entries: [{ id: "entry-1", payload: { amount: 2 } }],
  });
  const runtime = createDurableRuntime({
    runtimeId: "counter-v1",
    providers: { "fs-path": storage },
    transitionAdapter: counterAdapter,
  });
  const runtimeRef = ref("fs-path", "counter");

  assert.deepEqual(await runtime.initializeRuntime({
    stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
  }), { created: true, revision: "revision-1" });
  const result = await runtime.runEngine({
    stateRef: runtimeRef,
    journalRef: runtimeRef,
    effectsQueueRef: runtimeRef,
  });

  assert.equal(result.status, "committed");
  assert.equal((storage.commits[0] as { runtimeId: string }).runtimeId, "counter-v1");
  assert.deepEqual((storage.commits[0] as { state: unknown }).state, { count: 3 });
  assert.deepEqual((storage.commits[0] as { spec: unknown }).spec, { multiplier: 2 });
  assert.deepEqual((storage.commits[0] as { specUpdates: unknown }).specUpdates, [{ multiplier: 2 }]);
});

test("runtime rejects transitions spanning storage kinds", async () => {
  const runtime = createDurableRuntime({
    runtimeId: "counter-v1",
    providers: {},
    transitionAdapter: counterAdapter,
  });
  await assert.rejects(runtime.runEngine({
    stateRef: ref("indexed-db", "counter"),
    journalRef: ref("fs-path", "counter"),
    effectsQueueRef: ref("indexed-db", "counter"),
  }), /cannot span storage provider kinds/);
});

test("engine wake preserves a newer request appended during execution", async () => {
  const firstRequestedAt = "2026-07-24T10:00:00.001Z";
  const secondRequestedAt = "2026-07-24T10:00:00.002Z";
  let wake = { requestedAt: firstRequestedAt, processedAt: null as string | null };
  let releaseTransition!: () => void;
  const transitionPaused = new Promise<void>((resolve) => { releaseTransition = resolve; });
  let transitionStarted!: () => void;
  const started = new Promise<void>((resolve) => { transitionStarted = resolve; });
  const processed: string[] = [];
  const storage: DurableProvider = {
    async appendJournal(request) {
      wake = { ...wake, requestedAt: secondRequestedAt };
      return { id: "entry-2", payload: request.entry };
    },
    readEngineWake: async () => wake,
    async markEngineWakeProcessed(_request, processedAt) {
      processed.push(processedAt);
      wake = { ...wake, processedAt };
    },
    initializeRuntime: async () => ({ created: true, revision: "revision-1" }),
    acquireTransition: async () => ({
      leaseToken: "lease-1",
      leaseExpiresAt: "2026-07-24T10:05:00.000Z",
      state: {},
      spec: {},
      revision: "revision-1",
      cursor: null,
      entries: [{ id: "entry-1", payload: { type: "first" } }],
    }) as never,
    commitTransition: async () => ({ ok: true, revision: "revision-2" }),
    abortTransition: async () => true,
  };
  const runtime = createDurableRuntime({
    runtimeId: "counter-v1",
    providers: { "indexed-db": storage },
    transitionAdapter: {
      initialState: () => ({}),
      initialSpec: () => ({}),
      async transition() {
        transitionStarted();
        await transitionPaused;
        return { state: {}, effects: [] };
      },
      applySpecUpdates: ({ spec }) => spec,
    },
  });
  const runtimeRef = ref("indexed-db", "runtime");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };

  const processing = runtime.processEngineWake(refs);
  await started;
  await runtime.appendJournal({ ...refs, entry: { type: "second" } });
  releaseTransition();

  assert.equal((await processing).status, "committed");
  assert.deepEqual(processed, [firstRequestedAt]);
  assert.deepEqual(wake, { requestedAt: secondRequestedAt, processedAt: firstRequestedAt });
});

test("IndexedDB storage runs a local transition and effect queue", async () => {
  const storage = createIndexedDbStorage({ databaseName: `gik-test-${crypto.randomUUID()}` });
  const runtimeRef = ref("indexed-db", "counter");
  const runtime = createDurableRuntime({
    runtimeId: "counter-v1",
    providers: { "indexed-db": storage },
    transitionAdapter: counterAdapter,
    effectHandlers: {
      "count-changed": (effect) => [{
        type: "effect-completed",
        count: (effect as { count: number }).count,
      }],
    },
  });
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };

  await runtime.appendJournal({ ...refs, entry: { type: "increment", amount: 2 } });
  await runtime.initializeRuntime({ stateRef: runtimeRef, effectsQueueRef: runtimeRef });
  assert.equal((await runtime.processEngineWake(refs)).status, "committed");
  assert.equal((await runtime.processQueueLaneItem(refs)).status, "completed");

  const completed = await storage.acquireTransition({ ...refs, runtimeId: "counter-v1" });
  assert.deepEqual(completed?.entries.map((entry) => entry.payload), [
    { type: "effect-completed", count: 2 },
  ]);
});

test("remote connectors preserve their semantic operation boundaries", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const azure = createAzureFunctionConnector({
    baseUrl: "https://stores.example.test/",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith("/api/gik/effects/lease")) {
        return new Response(JSON.stringify({
          id: "effect-1",
          body: { type: "count-changed" },
          enqueuedAt: "2026-07-27T00:00:00.000Z",
          attempt: 1,
          leaseToken: "lease-1",
          leaseExpiresAt: "2026-07-27T00:01:00.000Z",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ created: true, revision: "initial" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const runtimeRef = ref("stores-proxy", "runtime");
  await azure.initializeRuntime({
    stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
    runtimeId: "runtime-v1",
    initialState: {},
    initialSpec: {},
  });
  assert.equal(calls[0].url, "https://stores.example.test/api/gik/runtime/initialize");
  assert.equal((await azure.leaseQueueItem?.({ effectsQueueRef: runtimeRef }))?.id, "effect-1");
  assert.equal(calls[1].url, "https://stores.example.test/api/gik/effects/lease");

  const mcpCalls: string[] = [];
  const filesystem = createFilesystemMcpConnector(async (name) => {
    mcpCalls.push(name);
    if (name === "filesystem.effect_lease") return { structuredContent: { message: null } };
    return { structuredContent: { wake: { requestedAt: null, processedAt: null } } };
  });
  await filesystem.readEngineWake({ stateRef: ref("fs-path", "runtime"), effectsQueueRef: ref("fs-path", "runtime") });
  await filesystem.leaseQueueItem?.({ effectsQueueRef: ref("fs-path", "runtime") });
  assert.deepEqual(mcpCalls, ["filesystem.engine_wake_read", "filesystem.effect_lease"]);
});
