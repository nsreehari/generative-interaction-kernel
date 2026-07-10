// StepOrchestrator (ADR-0033 item 1): the vendored StepMachine fulfilling a document's `invoke`
// effect — branching, retry, and end-to-end through the real Kernel with zero imperative glue.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Kernel,
  authorDocument,
  node,
  invoke,
  type ManifestPayload,
  type ResolvedNode,
  type OrchestratorResult,
} from "../../../kernel/src/index";
import { StepOrchestrator } from "../src/step-orchestrator";
import type { StepFlowConfig } from "../../vendor/step-machine/index.js";

test("a flow's branch selects the follow-up event (default result mapping)", async () => {
  const flow: StepFlowConfig = {
    settings: { start_step: "check" },
    steps: { check: { transitions: { big: "big_end", small: "small_end" } } },
    terminal_states: {
      big_end: { return_intent: "big", return_artifacts: ["value"] },
      small_end: { return_intent: "small", return_artifacts: ["value"] },
    },
  };
  const handlers = {
    check: (input: Record<string, unknown>) => ({
      result: (input.value as number) >= 5 ? "big" : "small",
      data: { value: input.value },
    }),
  };
  const orch = new StepOrchestrator({ classify: { flow, handlers } });

  const big = (await orch.invoke({ kind: "invoke", node: "n1", tool: "classify", args: { value: 9 } })) as OrchestratorResult;
  assert.deepEqual(big.events, [{ node: "n1", name: "classify:big", payload: { value: 9 } }]);

  const small = (await orch.invoke({ kind: "invoke", node: "n1", tool: "classify", args: { value: 2 } })) as OrchestratorResult;
  assert.equal(small.events?.[0].name, "classify:small");
});

test("a failing step retries under the flow's retry policy (the vendored crux)", async () => {
  let attempts = 0;
  const flow: StepFlowConfig = {
    settings: { start_step: "flaky" },
    steps: { flaky: { transitions: { ok: "done" }, retry: { max_attempts: 5 } } },
    terminal_states: { done: { return_intent: "ok", return_artifacts: ["attempts"] } },
  };
  const handlers = {
    flaky: () => {
      attempts += 1;
      if (attempts < 3) throw new Error("transient");
      return { result: "ok", data: { attempts } };
    },
  };
  const orch = new StepOrchestrator({ fetch: { flow, handlers } });

  const res = (await orch.invoke({ kind: "invoke", node: "n1", tool: "fetch", args: {} })) as OrchestratorResult;
  assert.equal(res.events?.[0].name, "fetch:ok", "reached the success terminal after retries");
  assert.equal(res.events?.[0].payload?.attempts, 3, "succeeded on the third attempt");
});

test("the Kernel fulfils an invoke through a flow and applies its result to the store", async () => {
  const manifest: ManifestPayload = {
    version: "invoke-demo/1.0",
    expression: "jsonata",
    namespaces: ["result"],
    actions: ["assign", "derive", "invoke", "emit", "route", "confirm"],
    capabilities: {
      board: { propsSchema: { type: "object", properties: { title: { type: "string" } } }, slots: ["children"] },
      metric: { propsSchema: { type: "object", required: ["label"], properties: { label: { type: "string" }, value: { type: ["number", "string"] } } } },
      actions: { propsSchema: { type: "object", properties: { label: { type: "string" } } }, emits: ["tap"] },
    },
  } as ManifestPayload;
  const manifestMessage = { gup: "0.1", type: "manifest", payload: manifest } as const;

  const root = node("board", "board-1", {
    props: { title: "Invoke" },
    children: [
      node("metric", "out", { props: { label: "Result" }, read: { value: "result" } }),
      node("actions", "btn", { props: { label: "Compute" }, on: { tap: [invoke("compute", { seed: 5 })] } }),
    ],
  });
  const doc = authorDocument(root, { manifest: "invoke-demo/1.0" });

  const flow: StepFlowConfig = {
    settings: { start_step: "run" },
    steps: { run: { transitions: { ok: "done" } } },
    terminal_states: { done: { return_intent: "ok", return_artifacts: ["value"] } },
  };
  const orchestrator = new StepOrchestrator({
    compute: {
      flow,
      handlers: { run: (input: Record<string, unknown>) => ({ result: "ok", data: { value: (input.seed as number) * 2 } }) },
      // Write the flow's result straight into the store — a document `on` handler could instead
      // consume the default follow-up event; here we assert the ops path end to end.
      onResult: (r) => ({ ops: [{ op: "set", path: "result", value: (r.data.value as number) ?? null }] }),
    },
  });

  const kernel = new Kernel(manifestMessage as never, doc as never, { orchestrator });
  kernel.init();

  await kernel.dispatch({ node: "btn", name: "tap" });
  assert.equal((kernel.state() as Record<string, unknown>).result, 10, "invoke ran the flow and applied its result");

  const tree = (await kernel.resolve()) as ResolvedNode;
  const out = find(tree, "out");
  assert.equal(out?.props.value, 10, "the computed result renders through the read edge");
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
