// ADR-0034: two independently-mounted runtimes sharing a context re-render when either writes it.
// A SharedContextStore notifies on write; the host re-`resync()`s the reader so its tree catches up,
// even though the reader dispatched nothing itself. This is the adapter runtime under a React Context.

import { test } from "vitest";
import assert from "node:assert/strict";

import { GenUIController, SharedContextStore } from "../src/index";
import { Kernel, authorDocument, node, assignFrom, envelope, type ResolvedNode } from "@gik/kernel";

const manifest = envelope("manifest", {
  version: "shared-context-test/1",
  namespaces: [],
  contexts: ["shared"],
  capabilities: {
    board: { slots: ["children"] },
    actions: { emits: ["set"] },
    text: {},
  },
});

function findById(node: ResolvedNode, id: string): ResolvedNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return undefined;
}

test("a reader runtime re-resolves when a writer runtime updates the shared context", async () => {
  const shared = SharedContextStore.create(["shared"]);

  const writer = new Kernel(
    manifest,
    authorDocument(
      node("board", "root", {
        children: [node("actions", "apply", { on: { set: [assignFrom("shared.title", "$event.value")] } })],
      }),
      { manifest: "shared-context-test/1" }
    ),
    { contexts: { shared } }
  );

  const reader = new Kernel(
    manifest,
    authorDocument(
      node("board", "root", { children: [node("text", "label", { read: { text: "shared.title" } })] }),
      { manifest: "shared-context-test/1" }
    ),
    { contexts: { shared } }
  );

  const writerCtl = new GenUIController(writer);
  const readerCtl = new GenUIController(reader);

  // The host wires the context: any write re-syncs the reader (what a React Context re-render does).
  const pending: Promise<unknown>[] = [];
  let notifications = 0;
  shared.subscribe(() => {
    notifications += 1;
    pending.push(readerCtl.resync());
  });

  await writerCtl.start();
  await readerCtl.start();

  const before = findById(readerCtl.getTree()!, "label");
  assert.equal(before?.props.text ?? null, null, "reader starts with no shared value");

  await writerCtl.emit("apply", "set", { value: "hello" });
  await Promise.all(pending);

  assert.ok(notifications >= 1, "the shared store notified on the write");
  const after = findById(readerCtl.getTree()!, "label");
  assert.equal(after?.props.text, "hello", "reader's tree reflects the writer's context write");
});
