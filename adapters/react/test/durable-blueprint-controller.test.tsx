import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { test } from "vitest";
import { createBlueprint } from "@gik/blueprint";
import { createIndexedDbStorage } from "@gik/durable-runtime/storage/indexed-db";
import { DurableBlueprintController } from "../src/durable-blueprint-controller";

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
});