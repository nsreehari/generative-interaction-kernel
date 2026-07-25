import assert from "node:assert/strict";
import { test } from "vitest";

import { createBrowserDurableRuntime } from "./browser-runtime";
import type { DurableProvider, TransitionSnapshot } from "./contracts";

function ref(kind: string, value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind, value })).toString("base64url")}`;
}

function provider(snapshot: TransitionSnapshot): DurableProvider & {
  commits: unknown[];
  aborts: unknown[];
} {
  const commits: unknown[] = [];
  const aborts: unknown[] = [];
  return {
    commits,
    aborts,
    appendJournal: async (_journalRef, entry) => ({ id: "entry-appended", payload: entry }),
    initializeRuntime: async () => ({ created: true, revision: "revision-1" }),
    acquireTransition: async () => snapshot,
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

test("browser durable runtime routes by ref kind and runs the kernel locally", async () => {
  const storage = provider({
    leaseToken: "lease-1",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    state: { count: 1 },
    revision: "revision-1",
    cursor: null,
    entries: [{ id: "entry-1", payload: { amount: 2 } }],
  });
  const runtime = createBrowserDurableRuntime({
    providers: { "fs-path": storage },
    kernels: [{
      id: "counter",
      initialState: () => ({ count: 0 }),
      transition: ({ state, entries }) => ({
        state: { count: (state as { count: number }).count + Number((entries[0].payload as { amount: number }).amount) },
        effects: [{ type: "count-changed", count: 3 }],
      }),
    }],
  });
  const runtimeRef = ref("fs-path", "counter");
  assert.deepEqual(await runtime.initializeRuntime({
    kernelId: "counter", stateRef: runtimeRef, effectsQueueRef: runtimeRef,
  }), { created: true, revision: "revision-1" });
  const result = await runtime.runEngine({
    kernelId: "counter",
    stateRef: runtimeRef,
    journalRef: runtimeRef,
    effectsQueueRef: runtimeRef,
  });

  assert.deepEqual(result, {
    status: "committed",
    revision: "revision-2",
    cursor: "entry-1",
    entryCount: 1,
    effectCount: 1,
  });
  assert.equal(storage.commits.length, 1);
  assert.deepEqual((storage.commits[0] as { state: unknown }).state, { count: 3 });
  assert.equal(storage.aborts.length, 0);
});

test("browser durable runtime aborts the lease when the local kernel fails", async () => {
  const storage = provider({
    leaseToken: "lease-1",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    state: {},
    revision: null,
    cursor: null,
    entries: [{ id: "entry-1", payload: {} }],
  });
  const runtime = createBrowserDurableRuntime({
    providers: { "indexed-db": storage },
    kernels: [{
      id: "broken",
      initialState: () => ({}),
      transition: () => { throw new Error("kernel failed"); },
    }],
  });
  const runtimeRef = ref("indexed-db", "broken");
  await assert.rejects(runtime.runEngine({
    kernelId: "broken",
    stateRef: runtimeRef,
    journalRef: runtimeRef,
    effectsQueueRef: runtimeRef,
  }), /kernel failed/);
  assert.equal(storage.commits.length, 0);
  assert.equal(storage.aborts.length, 1);
});

test("browser durable runtime rejects transitions spanning providers", async () => {
  const runtime = createBrowserDurableRuntime({ providers: {}, kernels: [{
    id: "counter", initialState: () => ({}), transition: () => ({ state: {}, effects: [] }),
  }] });
  await assert.rejects(runtime.runEngine({
    kernelId: "counter",
    stateRef: ref("indexed-db", "counter"),
    journalRef: ref("fs-path", "counter"),
    effectsQueueRef: ref("indexed-db", "counter"),
  }), /cannot span storage provider kinds/);
});