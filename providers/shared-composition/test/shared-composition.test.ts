// SharedComposition proof: the workbench's chrome->inspect "bridge", re-expressed as what it actually is.
//
// There is NO bridge and NO effect: chrome, inspect are regions of ONE shared store. `chrome` writes
// the shared input `n`; the shared cell `tree` is a standing JSONata `computed` (`n * 2`) the reactive
// store maintains; and `inspect` simply READS `tree`. No invoke, no tool, no orchestrator — the whole
// composition is pure data. That is the honest superseding component: upstream state change, downstream
// derived read, one kernel.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  authorDocument,
  node,
  assign,
  type ManifestPayload,
  type ResolvedNode,
} from "../../../kernel/src/index";
import {
  createSharedComposition,
  type SharedCompositionSpec,
} from "../src/shared-composition";

// The manifest of the SUPERSEDING store: the shared vars (`n`, `tree`) + the region capabilities.
const manifest: ManifestPayload = {
  version: "shared-demo/1.0",
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

// The composition document: the two regions over the one shared store. chrome writes `n`; inspect
// reads `tree`. The link between them is NOT in the document — it is the `computed` map on the spec.
function sharedDocument() {
  const root = node("board", "shared", {
    props: { title: "Shared" },
    children: [
      // chrome region: shows the shared input var and writes it. That is the ONLY action — a plain assign.
      node("board", "chrome", {
        props: { title: "chrome" },
        children: [
          node("metric", "chrome-n", { props: { label: "n" }, read: { value: "n" } }),
          node("actions", "apply", { props: { label: "Apply" }, on: { tap: [assign("n", 5)] } }),
        ],
      }),
      // inspect region: a pure READ of the shared `tree` cell — no subscribe/emit bridge.
      node("board", "inspect", {
        props: { title: "inspect" },
        children: [node("metric", "tree-out", { props: { label: "tree" }, read: { value: "tree" } })],
      }),
    ],
  });
  return authorDocument(root, { manifest: "shared-demo/1.0" });
}

function sharedSpec(): SharedCompositionSpec {
  return {
    children: ["chrome", "inspect"],
    manifest: manifestMessage as never,
    document: sharedDocument() as never,
    seed: { n: 0 },
    computed: { tree: "n * 2" }, // the projection — a standing derivation, not an effect.
  };
}

test("chrome writes n upstream, the computed tree derives, inspect reads it — no invoke, no bridge", async () => {
  const comp = createSharedComposition(sharedSpec());
  comp.init();
  await comp.settle();

  await comp.dispatch({ node: "apply", name: "tap" }); // assign n = 5
  await comp.settle();

  const state = comp.state() as Record<string, unknown>;
  assert.equal(state.n, 5, "chrome wrote the shared input var");
  assert.equal(state.tree, 10, "the standing computed derived tree = n * 2 after the assign landed");

  const tree = (await comp.resolve()) as ResolvedNode;
  assert.equal(find(tree, "tree-out")?.props.value, 10, "inspect region reads the shared tree cell");
  assert.equal(find(tree, "chrome-n")?.props.value, 5, "chrome region reads the same shared store");
  await comp.dispose();
});

test("children are regions of ONE shared store (seeded), exposed as roles", async () => {
  const spec = sharedSpec();
  spec.seed = { n: 3 };
  const comp = createSharedComposition(spec);
  comp.init();
  await comp.settle();

  assert.deepEqual([...comp.children], ["chrome", "inspect"], "child roles are exposed for the host");

  const tree = (await comp.resolve()) as ResolvedNode;
  // Both regions render off the single kernel's store — the whole point of the superseding component.
  assert.equal(find(tree, "chrome-n")?.props.value, 3);
  assert.equal(find(tree, "tree-out")?.props.value, 6, "the seeded input derives through the computed cell");
  await comp.dispose();
});

test("a computed-less composition is a plain shared-store binding (no derivations, no orchestrator)", async () => {
  const spec = sharedSpec();
  delete spec.computed;
  spec.seed = { n: 7, tree: 99 };
  const comp = createSharedComposition(spec);
  comp.init();

  const tree = (await comp.resolve()) as ResolvedNode;
  assert.equal(find(tree, "chrome-n")?.props.value, 7, "children still share one store without any computed");
  assert.equal(find(tree, "tree-out")?.props.value, 99, "tree is just a plain shared cell here");
  await comp.dispose();
});

function find(n: ResolvedNode | null, id: string): ResolvedNode | undefined {
  if (!n) return undefined;
  if (n.id === id) return n;
  for (const c of n.children) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return undefined;
}
