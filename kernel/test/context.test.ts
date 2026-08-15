// ADR-0034: `context` as a scope, not a verb. A namespace bound to a shared StateModel routes
// read/assign/derive to that shared store, so independently-mounted kernels share one source of
// truth. No new action families — only which store a path resolves against changes.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  Kernel,
  InMemoryStateModel,
  authorProjectedProgram,
  node,
  assignFrom,
  envelope,
} from "../src/index";

// A manifest declaring `shared` as context. `namespaces` still lists the kernel's own local roots.
function manifestMsg(namespaces: string[]) {
  return envelope("vocabulary", {
    version: "context-test/1",
    namespaces,
    contexts: ["shared"],
    capabilities: {
      board: { slots: ["children"] },
      actions: { emits: ["set"] },
    },
  });
}

const setEvent = (value: number | string) => ({ node: "apply", name: "set", payload: { value } });

test("a context namespace is one source of truth across independently-mounted kernels", async () => {
  const shared = new InMemoryStateModel(["shared"]);

  // Writer kernel: its button assigns into the context namespace.
  const writer = new Kernel(
    manifestMsg(["local"]),
    authorProjectedProgram(
      node("board", "root", {
        children: [node("actions", "apply", { on: { set: [assignFrom("shared.title", "$event.value")] } })],
      }),
      { vocabulary: "context-test/1" }
    ),
    { contexts: { shared } }
  );

  // Reader kernel: a separate document/kernel bound to the SAME shared store.
  const reader = new Kernel(
    manifestMsg(["mirror"]),
    authorProjectedProgram(node("board", "root", {}), { vocabulary: "context-test/1" }),
    { contexts: { shared } }
  );

  await writer.dispatch(setEvent("hello"));

  const readerState = reader.state() as Record<string, Record<string, unknown>>;
  assert.equal(readerState.shared.title, "hello", "reader sees the writer's context write");
  assert.equal(shared.snapshot().shared && (shared.snapshot().shared as Record<string, unknown>).title, "hello");
});

test("writes route by scope: a context path hits the shared store, a local path stays local", async () => {
  const shared = new InMemoryStateModel(["shared"]);

  const a = new Kernel(
    manifestMsg(["local"]),
    authorProjectedProgram(
      node("board", "root", {
        children: [
          node("actions", "apply", {
            on: { set: [assignFrom("shared.x", "$event.value"), assignFrom("local.y", "$event.value")] },
          }),
        ],
      }),
      { vocabulary: "context-test/1" }
    ),
    { contexts: { shared } }
  );

  const b = new Kernel(
    manifestMsg(["local"]),
    authorProjectedProgram(node("board", "root", {}), { vocabulary: "context-test/1" }),
    { contexts: { shared } }
  );

  await a.dispatch(setEvent(42));

  const bState = b.state() as Record<string, Record<string, unknown>>;
  assert.equal(bState.shared.x, 42, "context write is visible to the other kernel");
  assert.deepEqual(bState.local, {}, "the writer's local namespace is NOT shared");
});
