// ADR-0016: layered DSL lowering. A profile is a Domain DSL + a lowering to the kernel's
// UI DSL. This recasts the live-cards board as a Domain DSL (pure semantics — no kernel
// capabilities, no layout primitives) plus a single lowering stage that compiles it into
// a kernel document. The domain author never writes board/metric/table/actions or edges;
// only the lowering (platform-owned) knows the UI DSL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  InMemoryStateModel,
  Kernel,
  ValidationError,
  assignFrom,
  invoke,
  lowerToDocument,
  node,
  pipeline,
  type DocNode,
  type DocumentPayload,
  type ManifestPayload,
  type ResolvedNode,
  type Stage,
} from "../src/index";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../schemas/fixtures/${name}`, import.meta.url)),
      "utf8"
    )
  );

const manifest = fx("live-cards.manifest.json");
const manifestPayload = manifest.payload as ManifestPayload;

// --- The Domain DSL: what a "board" MEANS. No grid/flex/column, no kernel capabilities. ---
interface BoardDomain {
  title: string;
  metrics: { id: string; label: string; from: string }[];
  table: { id: string; columns: string[]; from: string; selectionTo: string };
  approve: { id: string; label: string; enabledWhen: string; tool: string };
}

// --- Stage: Domain DSL -> UI DSL (kernel document). The only code that knows the kernel
// capabilities (board/metric/table/actions) and edges. This is platform/profile-owned. ---
const lowerBoard: Stage<BoardDomain, DocumentPayload> = (d) => {
  const children: DocNode[] = [
    ...d.metrics.map((m) =>
      node("metric", m.id, { props: { label: m.label }, read: { value: m.from } })
    ),
    node("table", d.table.id, {
      props: { columns: d.table.columns },
      read: { rows: d.table.from },
      on: { rowSelect: [assignFrom(d.table.selectionTo, "$event.id")] },
    }),
    node("actions", d.approve.id, {
      props: { label: d.approve.label },
      gate: d.approve.enabledWhen,
      on: { tap: [invoke(d.approve.tool)] },
    }),
  ];
  return { root: node("board", "board-1", { props: { title: d.title }, children }) };
};

const salesBoard: BoardDomain = {
  title: "Sales",
  metrics: [{ id: "metric-total", label: "Total", from: "computed_values.total" }],
  table: {
    id: "table-orders",
    columns: ["id", "amount"],
    from: "fetched_sources.orders",
    selectionTo: "card_data.selected",
  },
  approve: {
    id: "btn-approve",
    label: "Approve",
    enabledWhen: "card_data.selected != null",
    tool: "approveOrder",
  },
};

function findResolved(n: ResolvedNode, id: string): ResolvedNode | undefined {
  if (n.id === id) return n;
  for (const c of n.children) {
    const hit = findResolved(c, id);
    if (hit) return hit;
  }
  return undefined;
}

test("Domain DSL lowers to a valid kernel document (validate-before-commit)", () => {
  const message = lowerToDocument(lowerBoard, salesBoard);
  assert.equal(message.type, "document");
  assert.equal(message.payload.root.capability, "board");
  assert.equal(message.payload.root.props?.title, "Sales");
});

test("a lowered document is interpretable by the kernel like a hand-authored one", async () => {
  const message = lowerToDocument(lowerBoard, salesBoard);
  const state = new InMemoryStateModel(manifestPayload.namespaces ?? []);
  state.apply([
    { op: "set", path: "computed_values.total", value: 42 },
    { op: "set", path: "fetched_sources.orders", value: [{ id: "order-42", amount: 10 }] },
  ]);
  const k = new Kernel(manifest, message, { state });
  k.init();

  const total = findResolved(await k.resolve(), "metric-total");
  assert.equal(total?.props.value, 42, "metric reads its domain-declared source");

  const approveBefore = findResolved(await k.resolve(), "btn-approve");
  assert.equal(approveBefore?.visible, false, "gate lowered from enabledWhen");

  await k.dispatch({ node: "table-orders", name: "rowSelect", payload: { id: "order-42" } });

  const approveAfter = findResolved(await k.resolve(), "btn-approve");
  assert.equal(approveAfter?.visible, true, "selection satisfies the lowered gate");
});

test("pipeline composes stages and stays type-aligned (Task -> Domain -> UI)", () => {
  // A trivial higher stage above the domain: a Task DSL that picks a domain shape.
  interface BoardTask {
    goal: "review-sales";
  }
  const lowerTask: Stage<BoardTask, BoardDomain> = () => salesBoard;

  const compiled = pipeline(lowerTask).to(lowerBoard).build();
  const message = lowerToDocument(compiled, { goal: "review-sales" });
  assert.equal(message.payload.root.capability, "board");
});

test("a lowering that emits a malformed document is rejected at the kernel boundary", () => {
  const brokenStage: Stage<null, DocumentPayload> = () =>
    ({ root: { id: "x" } } as unknown as DocumentPayload); // missing capability
  assert.throws(() => lowerToDocument(brokenStage, null), ValidationError);
});
