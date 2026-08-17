import type { EffectHandlerMap, LoadBundleOptions } from "@gik/react";

const handlers: EffectHandlerMap = {
  chargeCard: (context) => {
    const amount = Number(context.data.amount ?? 0);
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
      async request(effect) {
        return {
          settlement: {
            effectId: effect.effectId!,
            outcome: "resolved",
            data: { approved: true, amount: effect.data.amount },
          },
        };
      },
    };
  };
}

export default handlers;