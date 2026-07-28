import assert from "node:assert/strict";
import { test } from "vitest";
import { createBlueprint } from "@gik/blueprint";
import { BlueprintController } from "../src/index";

test("BlueprintController renders and transitions Blueprint-owned in-memory state", async () => {
  const blueprint = createBlueprint({
    id: "counter",
    kind: "runtime-blueprint",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: {
      namespaces: ["counter"],
      state: { counter: { value: 1 } },
      capabilities: {},
    },
    cells: {
      root: {
        id: "root",
        view: {
          capability: "screen",
          bindings: { value: { from: "counter.value" } },
        },
        behavior: {
          events: {
            increment: [{ do: "assign", target: "counter.value", args: { value: 2 } }],
          },
        },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
  const controller = new BlueprintController(blueprint);

  assert.equal((await controller.start()).props.value, 1);
  assert.equal((await controller.emit("root", "increment")).props.value, 2);
  assert.deepEqual(controller.getState(), { counter: { value: 2 } });
});