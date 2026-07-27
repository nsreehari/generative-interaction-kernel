import assert from "node:assert/strict";
import { test } from "vitest";

import {
  InMemoryStateModel,
  Kernel,
  authorProjectedProgram,
  envelope,
  invoke,
  node,
  reaction,
  type Orchestrator,
  type ResolvedNode,
} from "@gik/kernel";
import { GenUIController } from "../src/index";

const manifest = envelope("vocabulary", {
  version: "controller-test/1",
  namespaces: ["startup"],
  capabilities: {
    board: { slots: ["children"] },
    text: {},
  },
});

function findById(tree: ResolvedNode, id: string): ResolvedNode | undefined {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const match = findById(child, id);
    if (match) return match;
  }
  return undefined;
}

test("start refreshes after a detached initial reaction settles", async () => {
  const state = new InMemoryStateModel(["startup"]);
  state.apply([{ op: "set", path: "startup.trigger", value: "ready" }]);
  let releaseInvocation!: () => void;
  const invocationGate = new Promise<void>((resolve) => {
    releaseInvocation = resolve;
  });
  const orchestrator: Orchestrator = {
    async invoke() {
      await invocationGate;
      state.apply([{ op: "set", path: "startup.result", value: "complete" }]);
    },
  };
  const program = authorProjectedProgram(
    node("board", "root", {
      react: [reaction("startup.trigger", [invoke("load")], { runInitially: true })],
      children: [node("text", "result", { read: { value: "startup.result" } })],
    }),
    { vocabulary: "controller-test/1" },
  );
  const controller = new GenUIController(new Kernel(manifest, program, { orchestrator, state }));
  const settledTree = new Promise<ResolvedNode>((resolve) => {
    controller.subscribe((tree) => {
      if (findById(tree, "result")?.props.value === "complete") resolve(tree);
    });
  });

  const initialTree = await controller.start();
  assert.equal(findById(initialTree, "result")?.props.value ?? null, null);

  releaseInvocation();
  assert.equal(findById(await settledTree, "result")?.props.value, "complete");
});