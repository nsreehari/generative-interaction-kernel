import type { EffectHandlerMap, LoadBundleOptions } from "@gik/react";

const handlers: EffectHandlerMap = {
  chargeCard: (context) => {
    const amount = Number(context.payload.amount ?? 0);
    return {
      ops: [context.set("payment.receipt", {
        id: `rcpt_${Math.floor(amount)}`,
        amount,
        status: "captured",
      })],
      events: [{ node: "order-controller", name: "charged" }],
    };
  },
};

export function wrapOrchestrator(
  next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>,
): NonNullable<LoadBundleOptions["wrapOrchestrator"]> {
  return (fallback, state) => {
    const orchestrator = next(fallback, state);
    return {
      ...orchestrator,
      async confirm(effect) {
        const onConfirm = effect.args.onConfirm;
        return typeof onConfirm === "string"
          ? { events: [{ node: effect.node, name: onConfirm, payload: effect.payload }] }
          : undefined;
      },
    };
  };
}

export default handlers;