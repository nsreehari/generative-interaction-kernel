// The kernel driven as a pure backend service (no UI adapter). This locks in the
// medium-agnostic claim: a custom Orchestrator whose invoke/confirm/route are
// backend services (payment gateway, approval policy, queue router) drives a full
// lifecycle cascade in one dispatch, and resolve() projects the SAME medium-neutral
// ResolvedNode tree a UI adapter would consume. Companion to
// samples/backend-host/order-service.ts.

import { test } from "vitest";
import assert from "node:assert/strict";

import { Kernel } from "../src/index";
import type { GIKEvent, Json, Orchestrator, OrchestratorEffect, ResolvedNode } from "../src/index";

const manifest = {
  version: "backend-host/1",
  namespaces: ["order", "payment"],
  capabilities: {
    workflow: {},
    step: {},
    status: { dataProp: "lifecycle" },
  },
};

const document = {
  gik: "0.1",
  type: "document",
  payload: {
    root: {
      capability: "workflow",
      id: "order-workflow",
      props: { label: "Order approval workflow" },
      edges: {
        children: [
          {
            capability: "step",
            id: "controller",
            props: { label: "Order controller" },
            edges: {
              on: {
                submit: [
                  { do: "confirm", args: { message: "Manager approval required", onConfirm: "approve" } },
                ],
                approve: [{ do: "invoke", args: { tool: "chargeCard" } }],
                charged: [
                  { do: "route", args: { to: "queue:fulfillment" } },
                  { do: "assign", target: "order.fulfillment", args: { value: "queued" } },
                ],
                declined: [{ do: "assign", target: "order.status", args: { value: "payment_failed" } }],
              },
            },
          },
          {
            capability: "status",
            id: "status-view",
            edges: { read: { lifecycle: "order.lifecycle.state", receipt: "payment.receipt" } },
          },
        ],
      },
    },
    machines: [
      {
        id: "order",
        context: "order.lifecycle",
        initial: "draft",
        states: {
          draft: { on: { submit: "pending_review" } },
          pending_review: { on: { approve: "charging", reject: "rejected" } },
          charging: { on: { charged: "confirmed", declined: "failed" } },
          confirmed: { type: "final" },
          rejected: { type: "final" },
          failed: { type: "final" },
        },
      },
    ],
  },
};

function findChild(node: ResolvedNode, id: string): ResolvedNode | undefined {
  if (node.id === id) return node;
  for (const c of node.children) {
    const hit = findChild(c, id);
    if (hit) return hit;
  }
  return undefined;
}

test("backend host: invoke/confirm/route cascade settles a full lifecycle in one rev", async () => {
  const routed: Json[] = [];
  const orchestrator: Orchestrator = {
    async confirm(effect: OrchestratorEffect) {
      const onConfirm = effect.args.onConfirm;
      return typeof onConfirm === "string"
        ? { events: [{ node: effect.node, name: onConfirm, payload: effect.payload } as GIKEvent] }
        : undefined;
    },
    async invoke(effect: OrchestratorEffect) {
      if (effect.tool !== "chargeCard") return;
      const amount = (effect.payload?.amount as number | undefined) ?? 0;
      return {
        ops: [
          {
            op: "set" as const,
            path: "payment.receipt",
            value: { id: `rcpt_${Math.floor(amount)}`, amount, status: "captured" } as Json,
          },
        ],
        events: [{ node: effect.node, name: "charged" } as GIKEvent],
      };
    },
    async route(effect: OrchestratorEffect) {
      routed.push(effect.to ?? null);
    },
  };

  const kernel = new Kernel(manifest as any, document as any, { orchestrator });
  kernel.init();
  assert.equal((kernel.state() as any).order.lifecycle.state, "draft");

  const patch = await kernel.dispatch({
    node: "controller",
    name: "submit",
    payload: { orderId: "ord-42", amount: 129.5 },
  });

  // One dispatch = one rev, regardless of the confirm->invoke->route fan-out.
  assert.equal(patch.rev, 1);
  assert.deepEqual(patch.ops, [
    { op: "set", path: "order.lifecycle.state", value: "pending_review" },
    { op: "set", path: "order.lifecycle.state", value: "charging" },
    { op: "set", path: "payment.receipt", value: { id: "rcpt_129", amount: 129.5, status: "captured" } },
    { op: "set", path: "order.fulfillment", value: "queued" },
    { op: "set", path: "order.lifecycle.state", value: "confirmed" },
  ]);

  // route reached the orchestrator as a backend routing verb (not a screen change).
  assert.deepEqual(routed, ["queue:fulfillment"]);

  // The payment amount threaded through the approval (confirm) seam into the invoke.
  assert.equal((kernel.state() as any).payment.receipt.amount, 129.5);
  assert.equal((kernel.state() as any).order.lifecycle.state, "confirmed");
});

test("backend host: resolve() projects the same medium-neutral tree a UI adapter consumes", async () => {
  const orchestrator: Orchestrator = {
    async confirm(effect: OrchestratorEffect) {
      const onConfirm = effect.args.onConfirm;
      return typeof onConfirm === "string"
        ? { events: [{ node: effect.node, name: onConfirm, payload: effect.payload } as GIKEvent] }
        : undefined;
    },
    async invoke(effect: OrchestratorEffect) {
      if (effect.tool !== "chargeCard") return;
      const amount = (effect.payload?.amount as number | undefined) ?? 0;
      return {
        ops: [{ op: "set" as const, path: "payment.receipt", value: { amount, status: "captured" } as Json }],
        events: [{ node: effect.node, name: "charged" } as GIKEvent],
      };
    },
  };

  const kernel = new Kernel(manifest as any, document as any, { orchestrator });
  kernel.init();
  await kernel.dispatch({ node: "controller", name: "submit", payload: { amount: 50 } });

  const resolved = await kernel.resolve();
  const status = findChild(resolved, "status-view");

  assert.ok(status, "status-view resolves");
  // No pixels — the projection is a plain tree of capability/id/props a non-UI host can read.
  assert.equal(status.capability, "status");
  assert.equal(status.fallback, false);
  assert.equal(status.visible, true);
  assert.equal(status.props.lifecycle, "confirmed");
  assert.deepEqual(status.props.receipt, { amount: 50, status: "captured" });
});
