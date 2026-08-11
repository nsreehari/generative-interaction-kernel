import assert from "node:assert/strict";
import { test } from "vitest";

import { createMemoryStorage } from "../src/storage/memory";
import { createDurableRuntime } from "../src/runtime/browser-runtime";
import type { DurableTransitionAdapter } from "../src/contracts";

function ref(value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind: "memory", value })).toString("base64url")}`;
}

test("in-memory provider preserves journal wakes appended during processing", async () => {
  const provider = createMemoryStorage();
  const runtimeRef = ref("overlapping-wakes");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };

  await provider.appendJournal({ ...refs, entry: { type: "first" } });
  const firstWake = await provider.readEngineWake(refs);
  await provider.appendJournal({ ...refs, entry: { type: "second" } });
  await provider.markEngineWakeProcessed(refs, firstWake.requestedAt!);

  const pendingWake = await provider.readEngineWake(refs);
  assert.ok(pendingWake.requestedAt! > pendingWake.processedAt!);
});

test("in-memory provider supports transition, outbox, and settlement journal work", async () => {
  const provider = createMemoryStorage();
  const runtimeRef = ref("counter");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };
  const transitionAdapter: DurableTransitionAdapter<
    { count: number },
    Record<string, never>,
    { type: string },
    { type: string }
  > = {
    initialState: () => ({ count: 0 }),
    initialSpec: () => ({}),
    transition({ state, events }) {
      const event = events[0];
      if (event?.type === "increment") {
        return { state: { count: state.count + 1 }, effects: [{ type: "save" }] };
      }
      if (event?.type === "saved") {
        return { state: { count: state.count + 10 }, effects: [] };
      }
      return { state, effects: [] };
    },
    applySpecUpdates: ({ spec }) => spec,
  };
  const runtime = createDurableRuntime({
    runtimeId: "counter/v1",
    providers: { memory: provider },
    transitionAdapter,
    effectHandlers: {
      save: () => [{ type: "saved" }],
    },
    effectFailureHandler: (_effect, failure) => [{ type: "failed", error: failure.error }],
  });

  await runtime.initializeRuntime(refs);
  await runtime.appendJournal({ ...refs, entry: { type: "increment" } });
  assert.equal((await runtime.processEngineWake(refs)).status, "committed");
  assert.equal((await runtime.processQueueLaneItem(refs)).status, "completed");
  assert.equal((await runtime.processEngineWake(refs)).status, "committed");

  const snapshot = await runtime.readSnapshot<{ count: number }, object>(refs);
  assert.deepEqual(snapshot.state, { count: 11 });
});