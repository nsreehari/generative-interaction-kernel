import assert from "node:assert/strict";
import { test } from "vitest";

import { createBrowserRuntimeQueueProcessor } from "../src/queue-processor/browser-runtime-adapter";
import { createDurableQueueProcessor } from "../src/queue-processor/queue-processor";

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await Promise.resolve();
    }
  }
  assertion();
}

test("each notification processes one item", async () => {
  let notify!: () => void;
  const statuses = ["completed", "completed", "idle"] as const;
  let calls = 0;
  const processor = createDurableQueueProcessor({
    subscribe: (listener) => { notify = listener; },
    async processNext() {
      const status = statuses[calls] ?? "idle";
      calls += 1;
      return { status };
    },
  });

  await processor.start();
  notify();
  await eventually(() => assert.equal(calls, 1));
  notify();
  await eventually(() => assert.equal(calls, 2));
  processor.stop();
});

test("duplicate notifications coalesce during an active cycle", async () => {
  let notify!: () => void;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const processor = createDurableQueueProcessor({
    subscribe: (listener) => { notify = listener; },
    async processNext() {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (calls === 1) await blocked;
      active -= 1;
      return { status: "idle" };
    },
  });

  await processor.start();
  notify();
  notify();
  notify();
  release();
  await eventually(() => assert.equal(calls, 2));
  assert.equal(maxActive, 1);
  processor.stop();
});

test("retry waits for another notification", async () => {
  let notify!: () => void;
  const statuses = ["retry", "completed", "idle"] as const;
  let calls = 0;
  const processor = createDurableQueueProcessor({
    subscribe: (listener) => { notify = listener; },
    async processNext() {
      const status = statuses[calls] ?? "idle";
      calls += 1;
      return { status };
    },
  });

  await processor.start();
  notify();
  await eventually(() => assert.equal(calls, 1));
  notify();
  await eventually(() => assert.equal(calls, 2));
  processor.stop();
});

test("browser adapter forwards one queue request per notification", async () => {
  let notify!: () => void;
  const requests: unknown[] = [];
  const processor = createBrowserRuntimeQueueProcessor({
    runtime: {
      async processQueueLaneItem(request) {
        requests.push(request);
        return { status: requests.length === 1 ? "completed" : "idle" };
      },
    },
    request: {
      stateRef: "state",
      journalRef: "journal",
      effectsQueueRef: "effects",
      effectsLane: "email",
    },
    subscribe: (listener) => { notify = listener; },
  });

  await processor.start();
  notify();
  await eventually(() => assert.equal(requests.length, 1));
  processor.stop();
});

test("stop aborts and unsubscribes notification transport", async () => {
  let signal!: AbortSignal;
  let unsubscribed = false;
  const processor = createDurableQueueProcessor({
    subscribe: (_notify, subscriptionSignal) => {
      signal = subscriptionSignal;
      return () => { unsubscribed = true; };
    },
    processNext: async () => ({ status: "idle" }),
  });

  await processor.start();
  processor.stop();

  assert.equal(signal.aborted, true);
  assert.equal(unsubscribed, true);
  assert.equal(processor.isRunning, false);
});
