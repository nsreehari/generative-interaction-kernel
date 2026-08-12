import type { EffectHandlerMap } from "@gik/react";

const handlers: EffectHandlerMap = {
  prepareAnalysis: (ctx) => ({ ops: [
    ctx.set("incident2.pendingContent", ctx.get("externalContext.incident_report") ?? ""),
    ctx.set("incident2.error", ""),
  ] }),
};

export default handlers;