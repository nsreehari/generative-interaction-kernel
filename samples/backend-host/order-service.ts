// A NON-UI host for the reference kernel — proof that the kernel is medium-blind.
//
// There is no React, no DOM, no HTTP framework here. This is a plain middleware /
// backend service (imagine it behind an HTTP handler or a queue consumer) that:
//
//   1. drives the kernel with the raw dispatch(event) -> Patch loop,
//   2. supplies its OWN Orchestrator whose invoke/confirm/route are backend
//      services (a payment gateway, a programmatic approval, a queue router) —
//      NOT screens, and
//   3. consumes resolve() through a NON-UI projector that renders the medium-neutral
//      ResolvedNode tree into a server-side text view (it could just as well be a
//      JSON API body, a webhook payload, or a log line).
//
// Run:  npx tsx genui-platform/samples/backend-host/order-service.ts

import { Kernel } from "../../kernel/src/index";
import type {
  GupEvent,
  Json,
  Orchestrator,
  OrchestratorEffect,
  Patch,
  ResolvedNode,
  TraceEvent,
} from "../../kernel/src/index";

// --- The capability manifest: pure data, no presentation assumptions ---------
// `status` declares dataProp so a projector knows which prop carries its bound data.
const manifest = {
  version: "backend-host/1",
  namespaces: ["order", "payment"],
  capabilities: {
    workflow: {},
    step: {},
    status: { dataProp: "lifecycle" },
  },
};

// --- The document: an order-approval workflow -------------------------------
// A lifecycle machine plus a controller node whose closed-grammar handlers reach
// backend services via the Orchestrator seam. Nothing here is a widget.
const document = {
  gup: "0.1",
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
                // submit -> ask a (programmatic) approver; on yes, emit `approve`.
                submit: [
                  { do: "confirm", args: { message: "Manager approval required", onConfirm: "approve" } },
                ],
                // approve -> charge the card via the payment gateway service.
                approve: [{ do: "invoke", args: { tool: "chargeCard" } }],
                // charged -> route the order to the fulfillment queue (route as a
                // backend ROUTING verb, not a screen transition) and record it.
                charged: [
                  { do: "route", args: { to: "queue:fulfillment" } },
                  { do: "assign", target: "order.fulfillment", args: { value: "queued" } },
                ],
                // declined -> record the failure reason.
                declined: [{ do: "assign", target: "order.status", args: { value: "payment_failed" } }],
              },
            },
          },
          {
            capability: "status",
            id: "status-view",
            // Live projection of kernel state into node props — read by the projector below.
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

// --- The backend Orchestrator: effects are SERVICES, not UI ------------------
// invoke  = call the payment gateway
// confirm = a programmatic approval policy (could be a rules engine or a human via a queue)
// route   = route the order to another backend queue
const orchestrator: Orchestrator = {
  async confirm(effect: OrchestratorEffect) {
    console.log(`   [approver]  policy check: "${effect.args.message}" -> APPROVED`);
    const onConfirm = effect.args.onConfirm;
    // Forward the originating payload so downstream effects (the charge) keep the amount.
    return typeof onConfirm === "string"
      ? { events: [{ node: effect.node, name: onConfirm, payload: effect.payload } as GupEvent] }
      : undefined;
  },

  async invoke(effect: OrchestratorEffect) {
    if (effect.tool !== "chargeCard") return;
    const amount = (effect.payload?.amount as number | undefined) ?? 0;
    console.log(`   [payments]  charging card for $${amount} ...`);
    const receipt = { id: `rcpt_${Math.floor(amount)}`, amount, status: "captured" };
    // The gateway settled: write the receipt and emit the follow-up lifecycle event.
    return {
      ops: [{ op: "set" as const, path: "payment.receipt", value: receipt as Json }],
      events: [{ node: effect.node, name: "charged" } as GupEvent],
    };
  },

  async route(effect: OrchestratorEffect) {
    console.log(`   [router]    routed order to ${JSON.stringify(effect.to)}`);
  },
};

// --- A NON-UI projector over the medium-neutral ResolvedNode tree ------------
// resolve() returns { capability, id, props, visible, fallback, children } — no
// pixels. Here we project it to indented text; an API host would project the same
// tree to a JSON response body instead.
function projectToText(node: ResolvedNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  const propsKeys = Object.keys(node.props);
  const props = propsKeys.length
    ? " " + propsKeys.map((k) => `${k}=${JSON.stringify(node.props[k])}`).join(" ")
    : "";
  const flags = node.fallback ? " (fallback)" : node.visible ? "" : " (hidden)";
  const self = `${pad}<${node.capability}#${node.id}${flags}>${props}`;
  return [self, ...node.children.map((c) => projectToText(c, depth + 1))].join("\n");
}

// --- The service loop --------------------------------------------------------
async function main(): Promise<void> {
  const traces: TraceEvent[] = [];
  const kernel = new Kernel(manifest as any, document as any, {
    orchestrator,
    sink: (t) => traces.push(t),
  });
  kernel.init();

  console.log("=== Backend host: driving the kernel with no UI ===\n");
  console.log("initial lifecycle:", (kernel.state() as any).order.lifecycle.state, "\n");

  // Inbound events, as if pulled off an HTTP handler or a message queue.
  const inbound: GupEvent[] = [
    { node: "controller", name: "submit", payload: { orderId: "ord-42", amount: 129.5 } },
  ];

  for (const event of inbound) {
    console.log(`-> dispatch ${event.node}:${event.name} ${JSON.stringify(event.payload ?? {})}`);
    const patch: Patch = await kernel.dispatch(event);

    // One dispatch = one rev, regardless of how many services it cascaded through.
    console.log(`<- patch rev ${patch.rev} (${patch.ops.length} ops):`);
    for (const op of patch.ops) {
      console.log(`     ${op.op} ${op.path} = ${JSON.stringify(op.value)}`);
    }
    console.log();
  }

  // The projection half — same resolve() a UI adapter uses, consumed by a non-UI host.
  const resolved = await kernel.resolve();
  console.log("=== Server-side projection of resolve() ===");
  console.log(projectToText(resolved), "\n");

  console.log("=== Forensic trace (emitted by the pure reducer, no opt-in) ===");
  for (const t of traces) {
    console.log(`   ${t.event}${t.node ? " " + t.node : ""}: ${JSON.stringify(t.detail ?? {})}`);
  }

  console.log("\nfinal state:", JSON.stringify(kernel.state(), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
