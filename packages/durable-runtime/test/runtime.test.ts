import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { test } from "vitest";

import { createDurableRuntime } from "../src/runtime/browser-runtime";
import { createAzureFunctionConnector } from "../src/connectors/azure-function";
import {
  createFilesystemMcpConnector,
  FILESYSTEM_MCP_SNAPSHOT_INVALIDATION_NOTIFICATION,
} from "../src/connectors/filesystem-mcp";
import { createIndexedDbStorage } from "../src/storage/indexed-db";
import type {
  DurableProvider,
  RuntimeRefs,
  RuntimeSnapshotInvalidation,
  TransitionSnapshot,
} from "../src/contracts";
import { applyRuntimeSnapshotChanges } from "../src/snapshot-changes";

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
    readSnapshot: async <TState, TSpec>() => ({
      state: snapshot.state as TState,
      spec: snapshot.spec as TSpec,
      revision: snapshot.revision ?? "revision-1",
    }),
    readSnapshotChanges: async <TState, TSpec>(request: RuntimeRefs & {
      runtimeId: string; afterRevision: string | null;
    }) => {
      const revision = snapshot.revision ?? "revision-1";
      return request.afterRevision === revision
        ? { kind: "unchanged" as const, revision }
        : {
            kind: "reset" as const,
            snapshot: {
              state: snapshot.state as TState,
              spec: snapshot.spec as TSpec,
              revision,
            },
          };
    },
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
    readSnapshot: async <TState, TSpec>() => ({
      state: {} as TState,
      spec: {} as TSpec,
      revision: "revision-1",
    }),
    readSnapshotChanges: async <TState, TSpec>(request: RuntimeRefs & {
      runtimeId: string; afterRevision: string | null;
    }) => request.afterRevision === "revision-1"
      ? { kind: "unchanged", revision: "revision-1" }
      : {
          kind: "reset",
          snapshot: { state: {} as TState, spec: {} as TSpec, revision: "revision-1" },
        },
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
  const initialized = await runtime.initializeRuntime({ stateRef: runtimeRef, effectsQueueRef: runtimeRef });
  const processed = await runtime.processEngineWake(refs);
  assert.equal(processed.status, "committed");
  const changes = await runtime.readSnapshotChanges<{ count: number }, { multiplier: number }>({
    stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
    afterRevision: initialized.revision,
  });
  assert.equal(changes.kind, "changes");
  assert.deepEqual(applyRuntimeSnapshotChanges({
    state: { count: 0 },
    spec: { multiplier: 1 },
    revision: initialized.revision,
  }, changes), {
    state: { count: 2 },
    spec: { multiplier: 2 },
    revision: processed.revision,
  });
  assert.equal((await runtime.processQueueLaneItem(refs)).status, "completed");

  const completed = await storage.acquireTransition({ ...refs, runtimeId: "counter-v1" });
  assert.deepEqual(completed?.entries.map((entry) => entry.payload), [
    { type: "effect-completed", count: 2 },
  ]);
});

test("IndexedDB processes effects from one transition in declaration order", async () => {
  const storage = createIndexedDbStorage({ databaseName: `gik-effect-order-${crypto.randomUUID()}` });
  const runtimeRef = ref("indexed-db", "effect-order");
  const processed: string[] = [];
  const runtime = createDurableRuntime({
    runtimeId: "effect-order-v1",
    providers: { "indexed-db": storage },
    transitionAdapter: {
      initialState: () => ({}),
      initialSpec: () => ({}),
      transition: () => ({
        state: {},
        effects: [{ type: "first" }, { type: "second" }],
      }),
      applySpecUpdates: ({ spec }) => spec,
    },
    effectHandlers: {
      first: () => { processed.push("first"); },
      second: () => { processed.push("second"); },
    },
  });
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };

  await runtime.initializeRuntime(refs);
  await runtime.appendJournal({ ...refs, entry: { type: "start" } });
  assert.equal((await runtime.processEngineWake(refs)).status, "committed");
  assert.equal((await runtime.processQueueLaneItem(refs)).status, "completed");
  assert.equal((await runtime.processQueueLaneItem(refs)).status, "completed");
  assert.deepEqual(processed, ["first", "second"]);
});

test("IndexedDB reads a committed snapshot while a transition lease is held", async () => {
  const storage = createIndexedDbStorage({ databaseName: `gik-snapshot-${crypto.randomUUID()}` });
  const runtimeRef = ref("indexed-db", "snapshot");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };
  await storage.initializeRuntime({
    stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
    runtimeId: "snapshot-v1",
    initialState: { count: 1 },
    initialSpec: { multiplier: 2 },
  });
  const lease = await storage.acquireTransition({ ...refs, runtimeId: "snapshot-v1" });
  assert.ok(lease);

  assert.deepEqual(await storage.readSnapshot({
    stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
    runtimeId: "snapshot-v1",
  }), {
    state: { count: 1 },
    spec: { multiplier: 2 },
    revision: lease.revision,
  });
  assert.deepEqual(await storage.readSnapshotChanges({
    stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
    runtimeId: "snapshot-v1",
    afterRevision: lease.revision,
  }), {
    kind: "unchanged",
    revision: lease.revision,
  });
  assert.deepEqual(await storage.readSnapshotChanges({
    stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
    runtimeId: "snapshot-v1",
    afterRevision: null,
  }), {
    kind: "reset",
    snapshot: {
      state: { count: 1 },
      spec: { multiplier: 2 },
      revision: lease.revision,
    },
  });

  await storage.abortTransition({ ...refs, runtimeId: "snapshot-v1", leaseToken: lease.leaseToken });
});

test("IndexedDB publishes snapshot invalidations after successful commits", async () => {
  const listeners = new Set<(event: MessageEvent<unknown>) => void>();
  const storage = createIndexedDbStorage({
    databaseName: `gik-invalidations-${crypto.randomUUID()}`,
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
  const runtimeRef = ref("indexed-db", "invalidations");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };
  const initialized = await storage.initializeRuntime({
    stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
    runtimeId: "invalidations-v1",
    initialState: { count: 1 },
    initialSpec: {},
  });
  const abortController = new AbortController();
  const received: RuntimeSnapshotInvalidation[] = [];
  const cleanup = await storage.subscribeSnapshotInvalidations?.(
    { stateRef: runtimeRef, effectsQueueRef: runtimeRef, runtimeId: "invalidations-v1" },
    (invalidation) => received.push(invalidation),
    { signal: abortController.signal },
  );
  const lease = await storage.acquireTransition({ ...refs, runtimeId: "invalidations-v1" });
  assert.ok(lease);
  const committed = await storage.commitTransition({
    ...refs,
    runtimeId: "invalidations-v1",
    leaseToken: lease.leaseToken,
    expectedRevision: initialized.revision,
    previousCursor: null,
    nextCursor: "cursor-1",
    state: { count: 2 },
    spec: {},
    specUpdates: [],
    effects: [],
  });

  assert.equal(committed.ok, true);
  assert.deepEqual(received, [{
    runtimeId: "invalidations-v1",
    stateRef: runtimeRef,
    observedRevision: committed.revision,
  }]);
  cleanup?.();
});

test("runtime reads and subscribes to revision-aware snapshot changes", async () => {
  let revision = "revision-1";
  let count = 1;
  const storage = provider({
    leaseToken: "lease-1",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    state: { count },
    spec: {},
    revision,
    cursor: null,
    entries: [],
  });
  storage.readSnapshotChanges = async <TState, TSpec>(request: RuntimeRefs & {
    runtimeId: string; afterRevision: string | null;
  }) => request.afterRevision === revision
    ? { kind: "unchanged", revision }
    : {
        kind: "reset",
        snapshot: { state: { count } as TState, spec: {} as TSpec, revision },
      };
  const runtime = createDurableRuntime({
    runtimeId: "counter-v1",
    providers: { "indexed-db": storage },
    transitionAdapter: counterAdapter,
  });
  const runtimeRef = ref("indexed-db", "runtime");
  const refs = { stateRef: runtimeRef, effectsQueueRef: runtimeRef };

  assert.deepEqual(await runtime.readSnapshotChanges({ ...refs, afterRevision: "revision-1" }), {
    kind: "unchanged",
    revision: "revision-1",
  });

  const received: unknown[] = [];
  const changed = new Promise<void>((resolve) => {
    const unsubscribe = runtime.subscribe(refs, (changes) => {
      received.push(changes);
      unsubscribe();
      resolve();
    }, { afterRevision: "revision-1", pollIntervalMs: 1 });
    revision = "revision-2";
    count = 2;
  });
  await changed;

  assert.deepEqual(received, [{
    kind: "reset",
    snapshot: { state: { count: 2 }, spec: {}, revision: "revision-2" },
  }]);
});

test("runtime subscription uses invalidations for coalesced catch-up and cleans up", async () => {
  let revision = "revision-1";
  let count = 1;
  let reads = 0;
  let notify: ((invalidation: RuntimeSnapshotInvalidation) => void) | undefined;
  let reconnect: (() => void) | undefined;
  let cleanedUp = false;
  const storage = provider({
    leaseToken: "lease-1",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    state: { count },
    spec: {},
    revision,
    cursor: null,
    entries: [],
  });
  storage.readSnapshotChanges = async <TState, TSpec>(request: RuntimeRefs & {
    runtimeId: string; afterRevision: string | null;
  }) => {
    reads += 1;
    return request.afterRevision === revision
      ? { kind: "unchanged", revision }
      : {
          kind: "reset",
          snapshot: { state: { count } as TState, spec: {} as TSpec, revision },
        };
  };
  storage.subscribeSnapshotInvalidations = (_request, listener, options) => {
    notify = listener;
    reconnect = options.onReconnect;
    return () => { cleanedUp = true; };
  };
  const runtime = createDurableRuntime({
    runtimeId: "counter-v1",
    providers: { "indexed-db": storage },
    transitionAdapter: counterAdapter,
  });
  const runtimeRef = ref("indexed-db", "runtime");
  const refs = { stateRef: runtimeRef, effectsQueueRef: runtimeRef };
  const received: unknown[] = [];
  const unsubscribe = runtime.subscribe(refs, (changes) => {
    received.push(changes);
  }, { afterRevision: revision, pollIntervalMs: 60_000 });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(reads, 1);
  revision = "revision-2";
  count = 2;
  notify?.({ runtimeId: "counter-v1", stateRef: runtimeRef, observedRevision: revision });
  notify?.({ runtimeId: "counter-v1", stateRef: runtimeRef, observedRevision: revision });
  reconnect?.();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(reads, 2);
  assert.deepEqual(received, [{
    kind: "reset",
    snapshot: { state: { count: 2 }, spec: {}, revision: "revision-2" },
  }]);
  unsubscribe();
  assert.equal(cleanedUp, true);
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
  await azure.readSnapshot({ stateRef: runtimeRef, effectsQueueRef: runtimeRef, runtimeId: "runtime-v1" });
  assert.equal(calls[1].url, "https://stores.example.test/api/gik/runtime/snapshot");
  await azure.readSnapshotChanges({
    stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
    runtimeId: "runtime-v1",
    afterRevision: "initial",
  });
  assert.equal(calls[2].url, "https://stores.example.test/api/gik/runtime/snapshot/changes");
  assert.equal((await azure.leaseQueueItem?.({ effectsQueueRef: runtimeRef }))?.id, "effect-1");
  assert.equal(calls[3].url, "https://stores.example.test/api/gik/effects/lease");

  const mcpCalls: string[] = [];
  const filesystem = createFilesystemMcpConnector(async (name) => {
    mcpCalls.push(name);
    if (name === "filesystem.effect_lease") return { structuredContent: { message: null } };
    return { structuredContent: { wake: { requestedAt: null, processedAt: null } } };
  });
  await filesystem.readEngineWake({ stateRef: ref("fs-path", "runtime"), effectsQueueRef: ref("fs-path", "runtime") });
  await filesystem.readSnapshot({
    stateRef: ref("fs-path", "runtime"),
    effectsQueueRef: ref("fs-path", "runtime"),
    runtimeId: "runtime-v1",
  });
  await filesystem.readSnapshotChanges({
    stateRef: ref("fs-path", "runtime"),
    effectsQueueRef: ref("fs-path", "runtime"),
    runtimeId: "runtime-v1",
    afterRevision: "initial",
  });
  await filesystem.leaseQueueItem?.({ effectsQueueRef: ref("fs-path", "runtime") });
  assert.deepEqual(mcpCalls, [
    "filesystem.engine_wake_read",
    "filesystem.runtime_snapshot",
    "filesystem.runtime_snapshot_changes",
    "filesystem.effect_lease",
  ]);
});

test("remote connectors adapt transport invalidations without carrying snapshots", async () => {
  const runtimeRef = ref("fs-path", "runtime");
  let azureListener: ((invalidation: RuntimeSnapshotInvalidation) => void) | undefined;
  const azure = createAzureFunctionConnector({
    baseUrl: "https://stores.example.test",
    fetch: async () => new Response("{}"),
    subscribeSnapshotInvalidations: (_request, listener) => {
      azureListener = listener;
    },
  });
  const azureReceived: RuntimeSnapshotInvalidation[] = [];
  await azure.subscribeSnapshotInvalidations?.(
    { stateRef: runtimeRef, effectsQueueRef: runtimeRef, runtimeId: "runtime-v1" },
    (invalidation) => azureReceived.push(invalidation),
    { signal: new AbortController().signal },
  );
  azureListener?.({ runtimeId: "runtime-v1", stateRef: runtimeRef, observedRevision: "revision-2" });
  assert.equal(azureReceived.length, 1);

  let notificationListener: ((params: unknown) => void) | undefined;
  let notificationMethod = "";
  const filesystem = createFilesystemMcpConnector(async () => ({}), {
    subscribeNotification(method, listener) {
      notificationMethod = method;
      notificationListener = listener;
    },
  });
  const filesystemReceived: RuntimeSnapshotInvalidation[] = [];
  await filesystem.subscribeSnapshotInvalidations?.(
    { stateRef: runtimeRef, effectsQueueRef: runtimeRef, runtimeId: "runtime-v1" },
    (invalidation) => filesystemReceived.push(invalidation),
    { signal: new AbortController().signal },
  );
  notificationListener?.({ runtimeId: "other", stateRef: runtimeRef });
  notificationListener?.({ runtimeId: "runtime-v1", stateRef: runtimeRef, observedRevision: "revision-2" });

  assert.equal(notificationMethod, FILESYSTEM_MCP_SNAPSHOT_INVALIDATION_NOTIFICATION);
  assert.deepEqual(filesystemReceived, [{
    runtimeId: "runtime-v1",
    stateRef: runtimeRef,
    observedRevision: "revision-2",
  }]);
});

test("Azure SignalR invalidations negotiate through the configured Function endpoint", async () => {
  const runtimeRef = ref("stores-proxy", "runtime");
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const azure = createAzureFunctionConnector({
    baseUrl: "https://stores.example.test/",
    getHeaders: () => ({ "x-functions-key": "function-key" }),
    fetch: async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(null, { status: 503 });
    },
    signalR: {},
  });

  await assert.rejects(
    async () => {
      await azure.subscribeSnapshotInvalidations?.(
        { stateRef: runtimeRef, effectsQueueRef: runtimeRef, runtimeId: "runtime-v1" },
        () => {},
        { signal: new AbortController().signal },
      );
    },
    /negotiation failed with status 503/,
  );
  assert.equal(
    requestedUrl,
    "https://stores.example.test/api/gik/runtime/invalidations/negotiate",
  );
  assert.equal(requestedInit?.method, "POST");
  assert.deepEqual(requestedInit?.headers, { "x-functions-key": "function-key" });
});
