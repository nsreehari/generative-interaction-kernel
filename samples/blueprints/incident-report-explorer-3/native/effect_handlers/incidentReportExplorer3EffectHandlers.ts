import type { EffectHandlerMap } from "@gik/react";

const handlers: EffectHandlerMap = {
  prepareAnalysis: (ctx) => ({ ops: [
    ctx.set("incident3.pendingContent", ctx.get("externalContext.incident_report") ?? ""),
    ctx.set("incident3.error", ""),
  ] }),
};

export default handlers;