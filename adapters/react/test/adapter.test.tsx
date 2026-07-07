// Phase 2 React adapter tests: the resolved tree renders, the fallback path works,
// events wire back to the controller, and the kernel loop flips a gated node live.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, Fragment, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InMemoryStateModel, Kernel } from "../../../kernel/src/index";
import type { ResolvedNode } from "../../../kernel/src/types";
import { GenUIController } from "../src/controller";
import { renderNode } from "../src/render";
import { buildRegistryFromImports } from "../src/registry";
import {
  ActionButton,
  Board,
  FallbackView,
  Table,
  liveCardsRegistry,
} from "../src/components";

const fx = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../schemas/fixtures/${name}`, import.meta.url)),
      "utf8"
    )
  );

const manifest = fx("live-cards.manifest.json");
const document = fx("example.document.json");

function makeKernel(): Kernel {
  const store = new InMemoryStateModel(manifest.payload.namespaces);
  store.apply([
    {
      op: "set",
      path: "fetched_sources.orders",
      value: [
        { id: "order-42", amount: 100 },
        { id: "order-7", amount: 50 },
      ],
    },
    { op: "set", path: "computed_values.total", value: 150 },
  ]);
  return new Kernel(manifest, document, { state: store });
}

function find(node: ResolvedNode, id: string): ResolvedNode | undefined {
  if (node.id === id) return node;
  for (const c of node.children) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return undefined;
}

const markupOf = (tree: ResolvedNode, registry = liveCardsRegistry) =>
  renderToStaticMarkup(
    createElement(Fragment, null, renderNode(tree, registry, () => {}))
  );

test("renders the resolved document tree to markup (reads + props)", async () => {
  const controller = new GenUIController(makeKernel());
  const tree = await controller.start();
  const markup = markupOf(tree);

  assert.match(markup, /Sales/); // board title
  assert.match(markup, /Total/); // metric label
  assert.match(markup, /150/); // metric value from read binding
  assert.match(markup, /order-42/); // seeded table row
});

test("gated node is absent from markup until selected, then appears", async () => {
  const controller = new GenUIController(makeKernel());
  await controller.start();

  assert.doesNotMatch(markupOf(controller.getTree()!), /Approve/);

  await controller.emit("table-orders", "rowSelect", { id: "order-42" });

  assert.equal(find(controller.getTree()!, "btn-approve")?.visible, true);
  assert.match(markupOf(controller.getTree()!), /Approve/);
});

test("event wiring: a component's handler calls emit with the right name/payload", () => {
  const calls: Array<{ name: string; payload?: Record<string, unknown> }> = [];
  const emit = (name: string, payload?: Record<string, unknown>) =>
    calls.push({ name, payload });

  const btn = ActionButton({
    node: { capability: "actions", id: "btn", props: { label: "Approve" }, visible: true, fallback: false, children: [] },
    emit,
    children: null,
  }) as ReactElement<{ onClick: () => void }>;
  btn.props.onClick();

  const table = Table({
    node: {
      capability: "table",
      id: "t",
      props: { columns: ["id"], rows: [{ id: "order-42" }] },
      visible: true,
      fallback: false,
      children: [],
    },
    emit,
    children: null,
  }) as ReactElement<{ children: ReactElement<{ children: ReactElement<{ onClick: () => void }>[] }>[] }>;
  // table children are [thead, tbody]; tbody -> first tr -> onClick
  const tbody = table.props.children[1];
  const firstRow = tbody.props.children[0] as ReactElement<{ onClick: () => void }>;
  firstRow.props.onClick();

  assert.deepEqual(calls, [
    { name: "tap", payload: undefined },
    { name: "rowSelect", payload: { id: "order-42" } },
  ]);
});

test("fallback: a capability with no registered component renders the fallback view", async () => {
  const controller = new GenUIController(makeKernel());
  const tree = await controller.start();

  // Registry intentionally missing "metric".
  const partial = buildRegistryFromImports(
    { ui: { from: "profile" } },
    () => ({ board: Board, table: Table, actions: ActionButton }),
    FallbackView
  );
  const markup = markupOf(tree, partial);

  assert.match(markup, /data-fallback/);
  assert.match(markup, /Unsupported capability: ui:metric/);
});
