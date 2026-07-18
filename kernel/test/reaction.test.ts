// ADR-0034: declarative reactions. A node's `react: [{ when, run }]` is a standing, state-triggered
// effect — the kernel runs `run` when `when`'s value changes (never on the initial seed), folding into
// the same settle/depth machinery as event handlers and orchestrator effects.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  Kernel,
  authorDocument,
  node,
  assignFrom,
  invoke,
  InMemoryStateModel,
  reaction,
  envelope,
} from "../src/index";
import type { Orchestrator, OrchestratorEffect } from "../src/index";

const manifest = {
  version: "react-test/1",
  namespaces: ["n", "doubled", "quad"],
  capabilities: {
    board: { slots: ["children"] },
    actions: { emits: ["set"] },
  },
};
const manifestMsg = envelope("manifest", manifest);

// A button that writes `n` from the event payload; the root carries the reactions.
function docWith(...reactions: ReturnType<typeof reaction>[]) {
  return authorDocument(
    node("board", "root", {
      react: reactions,
      children: [node("actions", "apply", { on: { set: [assignFrom("n", "$event.value")] } })],
    }),
    { manifest: "react-test/1" }
  );
}

const setN = (value: number) => ({ node: "apply", name: "set", payload: { value } });

test("a reaction derives state when its `when` value changes", async () => {
  const k = new Kernel(manifestMsg, docWith(reaction("n", [assignFrom("doubled", "n * 2")])));

  await k.dispatch(setN(5));
  assert.equal(k.state().doubled, 10);

  await k.dispatch(setN(7));
  assert.equal(k.state().doubled, 14);
});

test("an effectful reaction fires once per change, never on an unchanged write or the seed", async () => {
  let calls = 0;
  const orchestrator: Orchestrator = {
    async invoke(_effect: OrchestratorEffect) {
      calls += 1;
    },
  };
  const k = new Kernel(manifestMsg, docWith(reaction("n", [invoke("onChanged")])), { orchestrator });

  await k.dispatch(setN(5)); // 0 -> 5: fires
  assert.equal(calls, 1);

  await k.dispatch(setN(5)); // unchanged: does NOT fire
  assert.equal(calls, 1);

  await k.dispatch(setN(9)); // 5 -> 9: fires
  assert.equal(calls, 2);
});

test("an opted-in reaction consumes pre-seeded mailbox state once", async () => {
  let calls = 0;
  const orchestrator: Orchestrator = {
    async invoke(_effect: OrchestratorEffect) {
      calls += 1;
    },
  };
  const initial = reaction("n", [invoke("consumeMailbox")], { runInitially: true });
  const state = new InMemoryStateModel(manifest.namespaces);
  state.apply([{ op: "set", path: "n", value: 7 }]);
  const k = new Kernel(manifestMsg, docWith(initial), { orchestrator, state });

  await k.syncExternal();
  assert.equal(calls, 1);

  await k.syncExternal();
  assert.equal(calls, 1);
});

test("an opted-in reaction ignores an initially empty mailbox", async () => {
  let calls = 0;
  const initial = reaction("n", [invoke("consumeMailbox")], { runInitially: true });
  const state = new InMemoryStateModel(manifest.namespaces);
  state.apply([{ op: "set", path: "n", value: null }]);
  const k = new Kernel(manifestMsg, docWith(initial), {
    orchestrator: { async invoke() { calls += 1; } },
    state,
  });

  await k.syncExternal();
  assert.equal(calls, 0);
});

test("reactions cascade: a reaction's write triggers a downstream reaction", async () => {
  const k = new Kernel(
    manifestMsg,
    docWith(
      reaction("n", [assignFrom("doubled", "n * 2")]),
      reaction("doubled", [assignFrom("quad", "doubled * 2")])
    )
  );

  await k.dispatch(setN(3));
  assert.equal(k.state().doubled, 6);
  assert.equal(k.state().quad, 12);
});
