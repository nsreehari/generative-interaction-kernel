// ADR-0034: `context` as a scope, not a verb. A namespace bound to a shared StateModel routes
// read/assign/derive to that shared store, so independently-mounted kernels share one source of
// truth. No new action families — only which store a path resolves against changes.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Kernel,
  InMemoryStateModel,
  authorDocument,
  node,
  assignFrom,
  reaction,
  envelope,
} from "../src/index";

// A manifest declaring `shared` as context. `namespaces` still lists the kernel's own local roots.
function manifestMsg(namespaces: string[]) {
  return envelope("manifest", {
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
    authorDocument(
      node("board", "root", {
        children: [node("actions", "apply", { on: { set: [assignFrom("shared.title", "$event.value")] } })],
      }),
      { manifest: "context-test/1" }
    ),
    { contexts: { shared } }
  );

  // Reader kernel: a separate document/kernel bound to the SAME shared store.
  const reader = new Kernel(
    manifestMsg(["mirror"]),
    authorDocument(node("board", "root", {}), { manifest: "context-test/1" }),
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
    authorDocument(
      node("board", "root", {
        children: [
          node("actions", "apply", {
            on: { set: [assignFrom("shared.x", "$event.value"), assignFrom("local.y", "$event.value")] },
          }),
        ],
      }),
      { manifest: "context-test/1" }
    ),
    { contexts: { shared } }
  );

  const b = new Kernel(
    manifestMsg(["local"]),
    authorDocument(node("board", "root", {}), { manifest: "context-test/1" }),
    { contexts: { shared } }
  );

  await a.dispatch(setEvent(42));

  const bState = b.state() as Record<string, Record<string, unknown>>;
  assert.equal(bState.shared.x, 42, "context write is visible to the other kernel");
  assert.deepEqual(bState.local, {}, "the writer's local namespace is NOT shared");
});

test("react composes with context: a reaction's `when` reads the shared namespace", async () => {
  const shared = new InMemoryStateModel(["shared"]);

  const k = new Kernel(
    manifestMsg(["local"]),
    authorDocument(
      node("board", "root", {
        react: [reaction("shared.n", [assignFrom("local.doubled", "shared.n * 2")])],
        children: [node("actions", "apply", { on: { set: [assignFrom("shared.n", "$event.value")] } })],
      }),
      { manifest: "context-test/1" }
    ),
    { contexts: { shared } }
  );

  await k.dispatch(setEvent(5));

  const state = k.state() as Record<string, Record<string, unknown>>;
  assert.equal(state.shared.n, 5);
  assert.equal(state.local.doubled, 10, "the reaction fired off a context change and wrote local state");
});
