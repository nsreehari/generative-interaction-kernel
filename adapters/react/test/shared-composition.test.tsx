// SharedCompositionElement proof: TWO regions (chrome, inspect) render over ONE shared controller, and
// the inspect region reflects a `computed` derivation of a value the chrome region wrote — with no
// bridge and no invoke. This is the React face of the orchestrator-free SharedComposition.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  authorDocument,
  node,
  assign,
  type ManifestPayload,
} from "../../../kernel/src/index";
import { createSharedComposition } from "../../../providers/shared-composition/src/shared-composition";
import { GenUIController } from "../src/controller";
import { createRegistry, type CapabilityView } from "../src/registry";
import {
  SharedCompositionProvider,
  SharedCompositionRegion,
} from "../src/primitives/composition";

const manifest = {
  version: "shared-react/1.0",
  expression: "jsonata",
  namespaces: ["n", "tree"],
  actions: ["assign", "derive", "emit", "navigate", "confirm"],
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
const manifestMessage = { gup: "0.1", type: "manifest", payload: manifest } as const;

function sharedDocument() {
  const root = node("board", "shared", {
    props: { title: "Shared" },
    children: [
      node("board", "chrome", {
        props: { title: "chrome" },
        children: [
          node("metric", "chrome-n", { props: { label: "n" }, read: { value: "n" } }),
          node("actions", "apply", { props: { label: "Apply" }, on: { tap: [assign("n", 5)] } }),
        ],
      }),
      node("board", "inspect", {
        props: { title: "inspect" },
        children: [node("metric", "tree-out", { props: { label: "tree" }, read: { value: "tree" } })],
      }),
    ],
  });
  return authorDocument(root, { manifest: "shared-react/1.0" });
}

const Board: CapabilityView = ({ children }) => createElement("div", { className: "board" }, children);
const Metric: CapabilityView = ({ node: n }) =>
  createElement("span", null, `${String(n.props.label)}: ${String(n.props.value)}`);
const Actions: CapabilityView = ({ node: n, emit }) =>
  createElement("button", { onClick: () => emit("tap") }, String(n.props.label));
const Fallback: CapabilityView = ({ node: n }) => createElement("i", null, `?${n.capability}`);
const registry = createRegistry({ board: Board, metric: Metric, actions: Actions }, Fallback);

function newComposition() {
  return createSharedComposition({
    children: ["chrome", "inspect"],
    manifest: manifestMessage as never,
    document: sharedDocument() as never,
    seed: { n: 0 },
    computed: { tree: "n * 2" },
  });
}

const regions = (children: ReactNode) =>
  renderToStaticMarkup(createElement(Fragment, null, children));

test("two regions render over ONE controller; inspect reflects the computed the chrome region wrote", async () => {
  const comp = newComposition();
  const source = new GenUIController(comp.kernel, () => comp.settle());
  await source.start();
  await source.emit("apply", "tap"); // chrome writes n = 5; the computed cascade settles before resolve

  const tree = source.getTree();
  const markup = regions(
    createElement(
      SharedCompositionProvider,
      { value: { tree, emit: () => {}, registry } },
      createElement(SharedCompositionRegion, { key: "c", rootId: "chrome" }),
      createElement(SharedCompositionRegion, { key: "i", rootId: "inspect" })
    )
  );

  assert.match(markup, /n: 5/, "chrome region rendered the shared input it wrote");
  assert.match(markup, /tree: 10/, "inspect region rendered the computed derivation (n * 2) of the SAME store");
  await comp.dispose();
});

test("each region renders only its own subtree", async () => {
  const comp = newComposition();
  const source = new GenUIController(comp.kernel, () => comp.settle());
  await source.start();

  const tree = source.getTree();
  const chromeOnly = regions(
    createElement(
      SharedCompositionProvider,
      { value: { tree, emit: () => {}, registry } },
      createElement(SharedCompositionRegion, { rootId: "chrome" })
    )
  );

  assert.match(chromeOnly, /n: 0/, "chrome region shows the seeded input");
  assert.doesNotMatch(chromeOnly, /tree:/, "chrome region does NOT include the inspect region's subtree");
  await comp.dispose();
});

test("a region whose id is absent renders nothing", async () => {
  const comp = newComposition();
  const source = new GenUIController(comp.kernel, () => comp.settle());
  await source.start();

  const markup = regions(
    createElement(
      SharedCompositionProvider,
      { value: { tree: source.getTree(), emit: () => {}, registry } },
      createElement(SharedCompositionRegion, { rootId: "does-not-exist" })
    )
  );

  assert.equal(markup, "", "an unknown region id renders nothing");
  await comp.dispose();
});
