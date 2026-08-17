import assert from "node:assert/strict";
import { test } from "vitest";

import { InMemoryStateModel, Kernel, unwrap, type Orchestrator, type OrchestratorEffect } from "@gik/kernel";
import { openSampleBlueprint, resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";

function runtimeState(runtime: ReturnType<typeof openSampleBlueprint>): InMemoryStateModel {
  const state = new InMemoryStateModel(Object.keys(runtime.state));
  state.apply(Object.entries(runtime.state).map(([path, value]) => ({ op: "set" as const, path, value })));
  return state;
}

test("backend order Blueprint executes its headless orchestrator workflow", async () => {
  const source = resolveSampleBlueprintSource("backend-order-processing");
  const runtime = openSampleBlueprint("backend-order-processing");
  const routed: unknown[] = [];
  const orchestrator: Orchestrator = {
    async request(effect: OrchestratorEffect) {
      return { settlement: { effectId: effect.effectId!, outcome: "resolved", data: { approved: true } } };
    },
    async invoke(effect: OrchestratorEffect) {
      assert.equal(effect.kind === "invoke" && effect.control.tool, "chargeCard");
      return {
        ops: [{ op: "set", path: "payment.receipt", value: { id: "receipt-1", status: "captured" } }],
        events: [{ node: effect.node, name: "charged" }],
      };
    },
    async route(effect: OrchestratorEffect) {
      if (effect.kind === "route") routed.push(effect.control.to);
    },
  };
  const kernel = new Kernel(runtime.vocabulary, runtime.program, { state: runtimeState(runtime), orchestrator });
  kernel.init();

  assert.equal(source.payload.projections, undefined);
  assert.equal(unwrap(runtime.program).root, undefined);
  assert.deepEqual(unwrap(runtime.program).handlers?.map(({ id }) => id), ["order-controller"]);
  await kernel.dispatch({ node: "order-controller", name: "submit", payload: { orderId: "ord-42", amount: 129.5 } });
  await kernel.whenIdle();

  assert.equal(source.payload.metadata?.scope, "backend");
  assert.equal(kernel.state().order.status, "confirmed");
  assert.equal(kernel.state().order.fulfillment, "queued");
  assert.deepEqual(kernel.state().payment.receipt, { id: "receipt-1", status: "captured" });
  assert.deepEqual(routed, ["queue:fulfillment"]);
});

test("middleware continuity Blueprint executes MCP and worker events", async () => {
  const source = resolveSampleBlueprintSource("middleware-continuity");
  const runtime = openSampleBlueprint("middleware-continuity");
  const kernel = new Kernel(runtime.vocabulary, runtime.program, { state: runtimeState(runtime) });
  kernel.init();

  assert.equal(source.payload.projections, undefined);
  assert.equal(unwrap(runtime.program).root, undefined);
  assert.deepEqual(unwrap(runtime.program).handlers?.map(({ id }) => id), ["continuity-controller"]);
  await kernel.dispatch({ node: "continuity-controller", name: "queue" });
  assert.equal(kernel.state().continuity.job.status, "queued");
  assert.equal(kernel.state().continuity.job.requestedBy, "mcp-control");

  await kernel.dispatch({ node: "continuity-controller", name: "complete" });
  assert.equal(source.payload.metadata?.scope, "middleware");
  assert.equal(kernel.state().continuity.job.status, "completed");
  assert.equal(kernel.state().continuity.job.result, "background-analysis-ready");
  assert.equal(kernel.state().continuity.job.completedBy, "background-worker");
});