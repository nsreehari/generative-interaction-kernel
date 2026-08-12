import type { EffectHandlerMap } from "@gik/react";

const handlers: EffectHandlerMap = {
  prepareRefinement: (ctx) => ({
    ops: [
      ctx.set("incident1a.pendingContent", ctx.get("externalContext.incident_report") ?? ""),
      ctx.set("incident1a.error", ""),
    ],
  }),
};

export default handlers;
