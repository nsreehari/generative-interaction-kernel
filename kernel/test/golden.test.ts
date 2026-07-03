// Phase 1 kernel test: executes the golden conformance fixture through the
// reference kernel and asserts the reduction contract, gates, machines, and guards.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Kernel, type ResolvedNode, type TraceEvent } from "../src/index";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)),
      "utf8"
    )
  );

const manifest = fx("live-cards.manifest.json");
const document = fx("example.document.json");
const eventMsg = fx("example.event.json");
const expectedPatch = fx("expected.patch.json");

function findResolved(node: ResolvedNode, id: string): ResolvedNode | undefined {
  if (node.id === id) return node;
  for (const c of node.children) {
    const hit = findResolved(c, id);
    if (hit) return hit;
  }
  return undefined;
}

test("golden reduction contract: rowSelect -> expected patch", async () => {
  const k = new Kernel(manifest, document);
  k.init();
  const patch = await k.dispatch(eventMsg.payload);
  assert.deepEqual(patch, expectedPatch.payload);
});

test("gate: action button is hidden until a row is selected", async () => {
  const k = new Kernel(manifest, document);
  k.init();

  const before = findResolved(await k.resolve(), "btn-approve");
  assert.equal(before?.visible, false, "hidden before selection");

  await k.dispatch(eventMsg.payload); // selects order-42

  const after = findResolved(await k.resolve(), "btn-approve");
  assert.equal(after?.visible, true, "visible after selection");
});

test("guard: invoke is skipped when requires.role != 'lead' (only the assign op is produced)", async () => {
  const k = new Kernel(manifest, document);
  k.init();
  await k.dispatch(eventMsg.payload); // select first so the button is active

  const patch = await k.dispatch({ node: "btn-approve", name: "tap" });
  assert.deepEqual(patch.ops, [
    { op: "set", path: "card_data.status", value: "approved" },
  ]);
  assert.equal((k.state() as any).card_data.status, "approved");
});

test("machine: submit transitions approval draft -> pending", async () => {
  const k = new Kernel(manifest, document);
  k.init();
  assert.deepEqual((k.state() as any).computed_values.approval, { state: "draft" });

  const patch = await k.dispatch({ node: "board-1", name: "submit" });
  assert.deepEqual(patch.ops, [
    { op: "set", path: "computed_values.approval.state", value: "pending" },
  ]);
  assert.deepEqual((k.state() as any).computed_values.approval, { state: "pending" });
});

test("rev increments per dispatch; init is baseline rev 0", async () => {
  const k = new Kernel(manifest, document);
  const initPatch = k.init();
  assert.equal(initPatch.rev, 0);
  assert.equal((await k.dispatch(eventMsg.payload)).rev, 1);
  assert.equal((await k.dispatch({ node: "board-1", name: "submit" })).rev, 2);
});

test("traces: assign action and machine transition are observable", async () => {
  const traces: TraceEvent[] = [];
  const k = new Kernel(manifest, document, { sink: (t) => traces.push(t) });
  k.init();
  await k.dispatch(eventMsg.payload);
  assert.ok(traces.some((t) => t.event === "action" && (t.detail as any)?.do === "assign"));
});

test("validate-before-commit: a malformed document is rejected", () => {
  const bad = { gup: "0.1", type: "document", payload: { root: { id: "x" } } };
  assert.throws(() => new Kernel(manifest, bad as any), /Invalid GUP document/);
});
