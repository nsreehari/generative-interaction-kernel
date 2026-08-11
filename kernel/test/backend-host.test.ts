// The kernel driven as a pure backend service (no UI adapter). This locks in the
// medium-agnostic claim: a custom Orchestrator whose invoke/confirm/route are
// backend services (payment gateway, approval policy, queue router) drives a full
// lifecycle cascade without inventing a projection tree. Companion to
// samples/blueprints/backend-order-processing/blueprint.json.

import { test } from "vitest";
import assert from "node:assert/strict";

import { Kernel, ProjectionUnavailableError } from "../src/index";
import type {
  GIKEvent,
  Json,
  Orchestrator,
  OrchestratorEffect,
  Patch,
  ProgramMessage,
} from "../src/index";

const manifest = {
  version: "backend-host/1",
  namespaces: ["order", "payment"],
};

const document: ProgramMessage = {
  gik: "0.1",
  type: "program",
  payload: {
    handlers: [
      {
        id: "controller",
        on: {
          submit: [
            {
              do: "confirm",
              args: {
                message: "Manager approval required",
                onConfirm: "approve",
              },
            },
          ],
          approve: [{ do: "invoke", args: { tool: "chargeCard" } }],
          charged: [
            { do: "route", args: { to: "queue:fulfillment" } },
            {
              do: "assign",
              target: "order.fulfillment",
              args: { value: "queued" },
            },
          ],
          declined: [
            {
              do: "assign",
              target: "order.status",
              args: { value: "payment_failed" },
            },
          ],
        },
      },
    ],
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

test("backend host: invoke settlement publishes a later lifecycle patch", async () => {
  const routed: Json[] = [];
  const orchestrator: Orchestrator = {
    async confirm(effect: OrchestratorEffect) {
      const onConfirm = effect.args.onConfirm;
      return typeof onConfirm === "string"
        ? {
            events: [
              {
                node: effect.node,
                name: onConfirm,
                payload: effect.payload,
              } as GIKEvent,
            ],
          }
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
            value: {
              id: `rcpt_${Math.floor(amount)}`,
              amount,
              status: "captured",
            } as Json,
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
  const patches: Patch[] = [];
  kernel.subscribePatches((published) => patches.push(published));
  kernel.init();
  assert.equal((kernel.state() as any).order.lifecycle.state, "draft");

  const patch = await kernel.dispatch({
    node: "controller",
    name: "submit",
    payload: { orderId: "ord-42", amount: 129.5 },
  });

  assert.equal(patch.rev, 1);
  assert.deepEqual(patch.ops, [
    { op: "set", path: "order.lifecycle.state", value: "pending_review" },
    { op: "set", path: "order.lifecycle.state", value: "charging" },
  ]);

  await kernel.whenIdle();
  assert.deepEqual(patches[1], {
    rev: 2,
    ops: [
      {
        op: "set",
        path: "payment.receipt",
        value: { id: "rcpt_129", amount: 129.5, status: "captured" },
      },
      { op: "set", path: "order.fulfillment", value: "queued" },
      { op: "set", path: "order.lifecycle.state", value: "confirmed" },
    ],
  });

  // route reached the orchestrator as a backend routing verb (not a screen change).
  assert.deepEqual(routed, ["queue:fulfillment"]);

  // The payment amount threaded through the approval (confirm) seam into the invoke.
  assert.equal((kernel.state() as any).payment.receipt.amount, 129.5);
  assert.equal((kernel.state() as any).order.lifecycle.state, "confirmed");
  assert.equal(kernel.hasProjection(), false);
  await assert.rejects(kernel.resolve(), ProjectionUnavailableError);
});
test("backend host: document-level reactions run without a projection root", async () => {
  const reactiveDocument = structuredClone(document);
  reactiveDocument.payload.reactions = [
    {
      id: "order-audit",
      when: "order.lifecycle.state",
      run: [
        { do: "assign", target: "order.observed", args: { from: "$when" } },
      ],
    },
  ];
  const kernel = new Kernel(manifest as any, reactiveDocument as any);
  kernel.init();
  await kernel.syncExternal();
  assert.equal((kernel.state() as any).order.observed, undefined);

  await kernel.dispatch({ node: "controller", name: "submit" });
  assert.equal((kernel.state() as any).order.observed, "pending_review");
});
