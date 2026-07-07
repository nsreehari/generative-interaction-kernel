// BridgeComponent proof: the workbench's guest->inspect bridge, re-expressed declaratively.
//
// The native bridge did: subscribe(guest render) -> project(tree) -> emit(inspect). Here there is NO
// bridge: chrome, guest and inspect are regions of ONE shared store. `chrome` writes the input; the
// `machine` (a two-step compile->resolve StepFlow, the two engines that must actually run) is invoked;
// its result is projected into the shared `tree` cell by a DECLARATIVE `on` handler; and `inspect`
// simply READS that cell. One kernel, no cross-kernel copy — exactly the superseding component.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  authorDocument,
  node,
  assign,
  assignFrom,
  invoke,
  type ManifestPayload,
  type ResolvedNode,
} from "../../../kernel/src/index";
import { createBridgeComponent, type BridgeComponentSpec } from "../src/bridge-component";
import type { StepFlowConfig } from "../../vendor/step-machine/index.js";

// The manifest of the SUPERSEDING store: the shared vars (`n`, `tree`) + the region capabilities.
const manifest: ManifestPayload = {
  version: "bridge-demo/1.0",
  expression: "jsonata",
  namespaces: ["n", "tree"],
  actions: ["assign", "derive", "invoke", "emit", "navigate", "confirm"],
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

// The machine: the two engines that genuinely RUN — `compile` (inputs -> a document) then `resolve`
// (document -> a rendered value). A single two-step flow; `invoke("build")` runs it to completion.
const buildFlow: StepFlowConfig = {
  settings: { start_step: "compile" },
  steps: {
    compile: { transitions: { ok: "resolve" } },
    resolve: { transitions: { ok: "done" } },
  },
  terminal_states: { done: { return_intent: "ok", return_artifacts: ["value"] } },
};
const machine = {
  build: {
    flow: buildFlow,
    handlers: {
      compile: (input: Record<string, unknown>) => ({ result: "ok", data: { docFactor: 2, docN: input.n } }),
      // resolve sees compile's output (StepMachine threads all produced data) — proving the ORDER.
      resolve: (input: Record<string, unknown>) => ({
        result: "ok",
        data: { value: (input.docN as number) * (input.docFactor as number) },
      }),
    },
    // Default result mapping emits `build:ok` carrying { value }, which the document's `on` handler
    // (below) assigns into the shared `tree` cell — the projection, now fully declarative.
  },
};

function bridgeSpec(): BridgeComponentSpec {
  const root = node("board", "bridge", {
    props: { title: "Bridge" },
    children: [
      // chrome region: shows the shared input var and fires the machine.
      node("board", "chrome", {
        props: { title: "chrome" },
        children: [
          node("metric", "chrome-n", { props: { label: "n" }, read: { value: "n" } }),
          node("actions", "apply", {
            props: { label: "Apply" },
            on: {
              tap: [assign("n", 5), invoke("build", { n: 5 })],
              // The declarative sink: the machine's follow-up event projects into the shared cell.
              "build:ok": [assignFrom("tree", "$event.value")],
            },
          }),
        ],
      }),
      // inspect region: a pure READ of the shared `tree` cell — no subscribe/emit bridge.
      node("board", "inspect", {
        props: { title: "inspect" },
        children: [node("metric", "tree-out", { props: { label: "tree" }, read: { value: "tree" } })],
      }),
    ],
  });
  return {
    children: ["chrome", "inspect"],
    manifest: manifestMessage as never,
    document: authorDocument(root, { manifest: "bridge-demo/1.0" }) as never,
    machine,
  };
}

test("the machine projects into the shared store and the inspect region reads it — no bridge", async () => {
  const comp = createBridgeComponent(bridgeSpec());
  comp.init();

  await comp.dispatch({ node: "apply", name: "tap" });

  const state = comp.state() as Record<string, unknown>;
  assert.equal(state.n, 5, "chrome wrote the shared input var");
  assert.equal(state.tree, 10, "compile->resolve ran and its result was projected into the shared cell");

  const tree = (await comp.resolve()) as ResolvedNode;
  assert.equal(find(tree, "tree-out")?.props.value, 10, "inspect region reads the shared tree cell");
  assert.equal(find(tree, "chrome-n")?.props.value, 5, "chrome region reads the same shared store");
});

test("children are regions of ONE shared store (seeded), exposed as roles", async () => {
  const spec = bridgeSpec();
  spec.seed = { n: 3, tree: 42 };
  const comp = createBridgeComponent(spec);
  comp.init();

  assert.deepEqual([...comp.children], ["chrome", "inspect"], "child roles are exposed for the host");

  const tree = (await comp.resolve()) as ResolvedNode;
  // Both regions render off the single kernel's store — the whole point of the superseding component.
  assert.equal(find(tree, "chrome-n")?.props.value, 3);
  assert.equal(find(tree, "tree-out")?.props.value, 42);
});

test("a machine-less composition is a plain shared-store binding (no invoke tools)", async () => {
  const spec = bridgeSpec();
  delete spec.machine;
  spec.seed = { n: 7, tree: 99 };
  const comp = createBridgeComponent(spec);
  comp.init();

  const tree = (await comp.resolve()) as ResolvedNode;
  assert.equal(find(tree, "chrome-n")?.props.value, 7, "children still share one store without a machine");
  assert.equal(find(tree, "tree-out")?.props.value, 99);
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
