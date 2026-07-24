// A NON-UI host for the reference kernel — proof that the kernel is medium-blind.
//
// There is no React, no DOM, no HTTP framework here. This is a plain middleware /
// backend service (imagine it behind an HTTP handler or a queue consumer) that:
//
//   1. drives the kernel with the raw dispatch(event) -> Patch loop,
//   2. supplies its OWN Orchestrator whose invoke/confirm/route are backend
//      services (a payment gateway, a programmatic approval, a queue router) —
//      NOT screens, and
//   3. declares handlers and machines directly, without inventing a projection tree.
//
// Run:  npx tsx generative-interaction-kernel/samples/backend-host/order-service.ts

import { authorProgram, Kernel } from "@gik/kernel";
import type {
  GIKEvent,
  Json,
  Orchestrator,
  OrchestratorEffect,
  Patch,
  HeadlessVocabularyManifest,
  TraceEvent,
} from "@gik/kernel";

// --- Runtime vocabulary: state and effects, with no projection capabilities ---
const manifest: HeadlessVocabularyManifest = {
  version: "backend-host/1",
  namespaces: ["order", "payment"],
};

// --- The document: an order-approval workflow -------------------------------
// A lifecycle machine plus a controller whose closed-grammar handlers reach backend
// services through the Orchestrator seam.
const document = authorProgram({
  handlers: [
    {
      id: "controller",
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
});

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
      ? { events: [{ node: effect.node, name: onConfirm, payload: effect.payload } as GIKEvent] }
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
      events: [{ node: effect.node, name: "charged" } as GIKEvent],
    };
  },

  async route(effect: OrchestratorEffect) {
    console.log(`   [router]    routed order to ${JSON.stringify(effect.to)}`);
  },
};

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
  const inbound: GIKEvent[] = [
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

  await kernel.whenIdle();

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
