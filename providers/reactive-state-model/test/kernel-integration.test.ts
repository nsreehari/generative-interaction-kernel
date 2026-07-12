// Integration: ReactiveStateModel wired as the REAL Kernel's authoritative store (ADR-0033 item 2).
//
// The point: the document contains NO `derive` action — only an `assign` to a base cell. Yet the
// derived cell (`total = a + b`) is maintained by the store's dependency graph and shows up in both
// authoritative state and the interpreted render tree. That is the shift from pull (author must wire
// an explicit derive action per dependency) to push (the store owns the cascade).
//
// Cells here are single-segment namespaces (`a`/`b`/`total`) so the JSONata derive expression can
// reference them as plain names. Nested/dotted namespaced paths need scope-aliasing and are a
// separate increment (tracked in ADR-0033 / session notes).

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  Kernel,
  JsonataExpressionProvider,
  assign,
  authorDocument,
  node,
  type ManifestPayload,
  type ResolvedNode,
} from "../../../kernel/src/index";
import { ReactiveStateModel } from "../src/reactive-state-model";

const manifestPayload: ManifestPayload = {
  version: "reactive-demo/1.0",
  expression: "jsonata",
  namespaces: ["a", "b", "total"],
  actions: ["assign", "derive", "invoke", "emit", "route", "confirm"],
  capabilities: {
    board: { propsSchema: { type: "object", properties: { title: { type: "string" } } }, slots: ["children"] },
    metric: {
      propsSchema: {
        type: "object",
        required: ["label"],
        properties: { label: { type: "string" }, value: { type: ["number", "string"] } },
      },
    },
    actions: { propsSchema: { type: "object", properties: { label: { type: "string" } } }, emits: ["tap"] },
  },
} as ManifestPayload;

const manifestMessage = { gik: "0.1", type: "manifest", payload: manifestPayload } as const;

// A metric that READS the derived `total`, and a button whose tap ASSIGNS the base cell `a`.
// Crucially, there is no `derive` action anywhere — the store owns that.
function authorDemo() {
  const root = node("board", "board-1", {
    props: { title: "Reactive" },
    children: [
      node("metric", "sum", { props: { label: "Total" }, read: { value: "total" } }),
      node("actions", "btn-bump", { props: { label: "Bump" }, on: { tap: [assign("a", 2)] } }),
    ],
  });
  return authorDocument(root, { manifest: "reactive-demo/1.0" });
}

function find(n: ResolvedNode | null, id: string): ResolvedNode | undefined {
  if (!n) return undefined;
  if (n.id === id) return n;
  for (const c of n.children) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return undefined;
}

const provider = new JsonataExpressionProvider();
const evaluate = (expr: string, scope: Record<string, unknown>) => provider.eval(expr, scope);

test("an assign to a base cell auto-derives through the store into Kernel state (no derive action)", async () => {
  const store = new ReactiveStateModel({
    edges: [{ target: "total", expr: "a + b", deps: ["a", "b"] }],
    evaluate,
    initial: { a: 0, b: 0 },
  });
  const kernel = new Kernel(manifestMessage as never, authorDemo() as never, { state: store });
  kernel.init();
  await store.settle();

  assert.equal((kernel.state() as Record<string, unknown>).total, 0, "seeded derive");

  await kernel.dispatch({ node: "btn-bump", name: "tap" }); // assign a = 2
  await store.settle();

  assert.equal((kernel.state() as Record<string, unknown>).a, 2);
  assert.equal((kernel.state() as Record<string, unknown>).total, 2, "store cascaded the derived cell");
  await store.dispose();
});

test("the derived cell renders through the real interpreter's read edge", async () => {
  const store = new ReactiveStateModel({
    edges: [{ target: "total", expr: "a + b", deps: ["a", "b"] }],
    evaluate,
    initial: { a: 3, b: 4 },
  });
  const kernel = new Kernel(manifestMessage as never, authorDemo() as never, { state: store });
  kernel.init();
  await store.settle();

  const before = find(await kernel.resolve(), "sum");
  assert.equal(before?.props.value, 7, "metric reads the seeded derived total");

  await kernel.dispatch({ node: "btn-bump", name: "tap" }); // a -> 2
  await store.settle();

  const after = find(await kernel.resolve(), "sum");
  assert.equal(after?.props.value, 6, "re-resolve reflects the re-derived total (2 + 4)");
  await store.dispose();
});

test("onChange is the push signal a client bridge re-interprets on", async () => {
  let signals = 0;
  const store = new ReactiveStateModel({
    edges: [{ target: "total", expr: "a + b", deps: ["a", "b"] }],
    evaluate,
    initial: { a: 0, b: 0 },
    onChange: () => { signals += 1; },
  });
  const kernel = new Kernel(manifestMessage as never, authorDemo() as never, { state: store });
  kernel.init();
  await store.settle();
  const baseline = signals;

  await kernel.dispatch({ node: "btn-bump", name: "tap" });
  await store.settle();

  assert.ok(signals > baseline, "store emitted a push signal when the derived cell settled");
  await store.dispose();
});
