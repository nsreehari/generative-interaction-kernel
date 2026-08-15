import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { test } from "vitest";
import {
  createBlueprint,
  createBlueprintDurableTransitionAdapter,
  type DurableBlueprintSpec,
} from "@gik/blueprint";
import { createDurableRuntime } from "@gik/durable-runtime";
import { createIndexedDbStorage } from "@gik/durable-runtime/storage/indexed-db";

function ref(value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind: "indexed-db", value })).toString("base64url")}`;
}

test("app host runs a JSON-portable materialized Blueprint through stateless durable execution", async () => {
  const blueprint = createBlueprint({
    id: "durable-blueprint-counter",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { namespaces: ["counter"], capabilities: {}, state: { counter: { value: 1 } } },
    cells: {
      root: {
        id: "root",
        view: { capability: "screen" },
        behavior: {
          on: {
            increment: [{ do: "assign", target: "counter.value", args: { from: "externalContext.nextValue" } }],
          },
        },
        events: {
          increment: { payloadSchema: { type: "object" } },
        },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  const sourceAdapter = createBlueprintDurableTransitionAdapter({
    blueprint,
    externalContext: { nextValue: 2 },
  });
  const portableSpec = JSON.parse(JSON.stringify(sourceAdapter.initialSpec())) as DurableBlueprintSpec;
  const storage = createIndexedDbStorage({ databaseName: `gik-blueprint-${crypto.randomUUID()}` });
  const runtime = createDurableRuntime({
    runtimeId: "durable-blueprint-counter/v1",
    providers: { "indexed-db": storage },
    transitionAdapter: { ...sourceAdapter, initialSpec: () => structuredClone(portableSpec) },
  });
  const runtimeRef = ref("durable-blueprint-counter");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };

  await runtime.initializeRuntime(refs);
  await runtime.appendJournal({ ...refs, entry: { node: "root", name: "increment" } });
  assert.equal((await runtime.processEngineWake(refs)).status, "committed");

  const snapshot = await storage.acquireTransition<Record<string, unknown>, DurableBlueprintSpec, unknown>({
    ...refs,
    runtimeId: "durable-blueprint-counter/v1",
  });
  assert.deepEqual((snapshot?.state as Record<string, Json>)?.counter, { value: 2 });
  assert.equal(snapshot?.spec.materializedBlueprint.type, "materialized-blueprint");
  if (snapshot) await storage.abortTransition({ ...refs, runtimeId: "durable-blueprint-counter/v1", leaseToken: snapshot.leaseToken });
});