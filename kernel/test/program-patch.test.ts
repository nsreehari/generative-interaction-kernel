import assert from "node:assert/strict";
import { test } from "vitest";
import { Kernel, type Orchestrator, type ProgramPatch } from "../src/index";

const manifest = {
  gik: "0.1" as const,
  type: "vocabulary" as const,
  payload: { version: "program-patch/1", capabilities: {} },
};

const root = (id: string) => ({ capability: "surface", id });

test("an authorized program patch commits as its own revision", async () => {
  const kernel = new Kernel(manifest, {
    gik: "0.1",
    type: "program",
    payload: { root: root("before") },
  });

  const program: ProgramPatch = [{ op: "setRoot", root: root("after") }];
  const transition = await kernel.applyProgramPatch(program);

  assert.equal(transition.revision, 1);
  assert.deepEqual(transition.patch.program, program);
  assert.equal(kernel.program().root?.id, "after");
});

test("an invalid candidate leaves the current program unchanged", async () => {
  const kernel = new Kernel(manifest, {
    gik: "0.1",
    type: "program",
    payload: { root: root("stable") },
  });

  await assert.rejects(kernel.applyProgramPatch([{ op: "removeRoot" }]), /Invalid GIK program/);
  assert.equal(kernel.program().root?.id, "stable");
  assert.equal(kernel.snapshotPatch().rev, 0);
});

test("a graph-local program patch preserves surviving token and node execution state", async () => {
  const kernel = new Kernel(manifest, {
    gik: "0.1",
    type: "program",
    payload: {
      graph: {
        inputs: ["seed"],
        outputs: ["settled"],
        nodes: [{
          id: "copy",
          inputs: { value: "seed" },
          outputs: { value: "settled" },
          operation: { kind: "compute", expression: "$inputs.value" },
        }],
      },
    },
  });

  await kernel.publish({ seed: 2 });
  const before = kernel.execution();
  await kernel.applyProgramPatch([{
    op: "mutateGraph",
    mutations: [{ op: "addPort", token: "future" }],
  }]);
  const after = kernel.execution();

  assert.deepEqual(after.tokens.seed, before.tokens.seed);
  assert.deepEqual(after.tokens.settled, before.tokens.settled);
  assert.deepEqual(after.nodes.copy, before.nodes.copy);
  assert.equal(after.topologyVersion, before.topologyVersion + 1);
});

test("runtime-originated patches require admission and travel with the event patch", async () => {
  const adaptiveRoot = root("adapted");
  const orchestrator: Orchestrator = {
    async confirm() {
      return { program: [{ op: "setRoot", root: adaptiveRoot }] };
    },
  };
  const program = {
    gik: "0.1" as const,
    type: "program" as const,
    payload: {
      root: {
        capability: "surface",
        id: "before",
        edges: { on: { adapt: [{ do: "confirm" }] } },
      },
    },
  };
  const fixed = new Kernel(manifest, program, { orchestrator });
  await assert.rejects(fixed.dispatch({ node: "before", name: "adapt" }), /no configured admission hook/);

  const adaptive = new Kernel(manifest, program, {
    orchestrator,
    admitProgramPatch: (patch) => patch,
  });
  const patch = await adaptive.dispatch({ node: "before", name: "adapt" });
  assert.equal(patch.program?.[0].op, "setRoot");
  assert.equal(adaptive.program().root?.id, "adapted");
});

test("an asynchronous invocation settlement publishes its admitted program patch", async () => {
  const patches: Array<{ program?: ProgramPatch }> = [];
  const kernel = new Kernel(manifest, {
    gik: "0.1",
    type: "program",
    payload: {
      root: {
        capability: "surface",
        id: "before",
        edges: { on: { adapt: [{ do: "invoke", args: { tool: "adapter" } }] } },
      },
    },
  }, {
    orchestrator: {
      async invoke() {
        return { program: [{ op: "setRoot", root: root("async-adapted") }] };
      },
    },
    admitProgramPatch: (patch) => patch,
  });
  kernel.subscribePatches((patch) => patches.push(patch));

  await kernel.dispatch({ node: "before", name: "adapt" });
  await kernel.whenIdle();

  assert.equal(kernel.program().root?.id, "async-adapted");
  assert.equal(patches.at(-1)?.program?.[0].op, "setRoot");
});

test("a program-bearing checkpoint restores an adaptive program through a patch", async () => {
  const kernel = new Kernel(manifest, {
    gik: "0.1",
    type: "program",
    payload: { root: root("first") },
  });
  const checkpoint = kernel.checkpoint({ includeProgram: true });
  await kernel.applyProgramPatch([{ op: "setRoot", root: root("second") }]);

  const patch = await kernel.restore(checkpoint);
  assert.equal(kernel.program().root?.id, "first");
  assert.equal(patch.program?.[0].op, "setRoot");
});