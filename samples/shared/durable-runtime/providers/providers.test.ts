import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { test } from "vitest";

import { createBrowserDurableRuntime } from "../browser-runtime";
import { createAzureFunctionsProvider } from "./azure-functions";
import { createFilesystemMcpProvider } from "./filesystem-mcp";
import { createIndexedDbProvider } from "./indexed-db";

function ref(kind: string, value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind, value })).toString("base64url")}`;
}

test("direct IndexedDB provider runs local kernel and effect handler", async () => {
  const provider = createIndexedDbProvider({ databaseName: `gik-test-${crypto.randomUUID()}` });
  const runtimeRef = ref("indexed-db", "counter");
  const runtime = createBrowserDurableRuntime({
    providers: { "indexed-db": provider },
    kernels: [{
      id: "counter",
      initialState: () => ({ count: 0 }),
      transition: ({ state, entries }) => {
        const count = (state as { count: number }).count
          + Number((entries[0].payload as { amount: number }).amount);
        return { state: { count }, effects: [{ type: "count-changed", count }] };
      },
    }],
    effectHandlers: {
      "count-changed": (effect) => [{
        type: "effect-completed",
        count: (effect as { count: number }).count,
      }],
    },
  });

  await runtime.appendJournal(runtimeRef, { type: "increment", amount: 2 });
  const initialized = await runtime.initializeRuntime({
    kernelId: "counter", stateRef: runtimeRef, effectsQueueRef: runtimeRef,
  });
  assert.equal(initialized.created, true);
  assert.deepEqual(await runtime.initializeRuntime({
    kernelId: "counter", stateRef: runtimeRef, effectsQueueRef: runtimeRef,
  }), { created: false, revision: initialized.revision });
  const result = await runtime.runEngine({
    kernelId: "counter", stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef,
  });
  assert.equal(result.status, "committed");
  assert.equal(typeof result.revision, "string");
  assert.equal(typeof result.cursor, "string");
  assert.equal(result.entryCount, 1);
  assert.equal(result.effectCount, 1);
  assert.equal((await runtime.processQueueLaneItem({
    effectsQueueRef: runtimeRef, journalRef: runtimeRef,
  })).status, "completed");
  const completed = await provider.acquireTransition({
    kernelId: "counter",
    stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef,
  });
  assert.deepEqual(completed?.entries.map((entry) => entry.payload), [
    { type: "effect-completed", count: 2 },
  ]);
  await provider.abortTransition({
    kernelId: "counter", leaseToken: completed!.leaseToken,
    stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef,
  });
});

test("Azure provider sends storage-only transition routes and live headers", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let key = "first";
  const provider = createAzureFunctionsProvider({
    baseUrl: "https://stores.example.test",
    getHeaders: () => ({ "x-functions-key": key }),
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ leaseToken: "lease", leaseExpiresAt: "later", state: {}, revision: null, cursor: null, entries: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const runtimeRef = ref("stores-proxy", "runtime");
  await provider.initializeRuntime({
    kernelId: "kernel", initialState: {}, stateRef: runtimeRef,
    effectsQueueRef: runtimeRef,
  });
  await provider.acquireTransition({
    kernelId: "kernel", stateRef: runtimeRef, journalRef: runtimeRef,
    effectsQueueRef: runtimeRef,
  });
  key = "second";
  await provider.acquireTransition({
    kernelId: "kernel", stateRef: runtimeRef, journalRef: runtimeRef,
    effectsQueueRef: runtimeRef,
  });
  await provider.commitTransition({
    kernelId: "kernel", stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef,
    leaseToken: "lease", expectedRevision: null, previousCursor: null, nextCursor: "entry",
    state: {}, effects: [],
  });
  await provider.abortTransition({
    kernelId: "kernel", stateRef: runtimeRef, journalRef: runtimeRef,
    effectsQueueRef: runtimeRef, leaseToken: "lease",
  });
  assert.equal(calls[0].url, "https://stores.example.test/api/gik/runtime/initialize");
  assert.equal((calls[1].init.headers as Record<string, string>)["x-functions-key"], "first");
  assert.equal((calls[2].init.headers as Record<string, string>)["x-functions-key"], "second");
  assert.equal(calls[3].url, "https://stores.example.test/api/gik/transition/commit");
  assert.equal(Object.hasOwn(JSON.parse(String(calls[3].init.body)), "initialState"), false);
  assert.equal(calls[4].url, "https://stores.example.test/api/gik/transition/abort");
  assert.equal(Object.hasOwn(JSON.parse(String(calls[4].init.body)), "initialState"), false);
});

test("filesystem MCP provider unwraps object results", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const provider = createFilesystemMcpProvider(async (name, args) => {
    calls.push({ name, args });
    if (name === "filesystem.runtime_initialize") return { structuredContent: { initialization: { created: true, revision: "initial" } } };
    if (name === "filesystem.transition_acquire") return { structuredContent: { transition: null } };
    if (name === "filesystem.transition_abort") return { structuredContent: { aborted: true } };
    return { structuredContent: { ok: true, revision: "next" } };
  });
  const runtimeRef = ref("fs-path", "runtime");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };
  assert.deepEqual(await provider.initializeRuntime({
    stateRef: runtimeRef, effectsQueueRef: runtimeRef, kernelId: "kernel", initialState: {},
  }), {
    created: true, revision: "initial",
  });
  assert.equal(await provider.acquireTransition({ ...refs, kernelId: "kernel" }), null);
  await provider.commitTransition({
    ...refs, kernelId: "kernel", leaseToken: "lease",
    expectedRevision: null, previousCursor: null, nextCursor: "entry", state: {}, effects: [],
  });
  assert.equal(Object.hasOwn(calls[2].args, "initialState"), false);
  assert.equal(await provider.abortTransition({ ...refs, kernelId: "kernel", leaseToken: "lease" }), true);
});