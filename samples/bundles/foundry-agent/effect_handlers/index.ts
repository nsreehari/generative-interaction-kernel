// The foundry-agent bundle's named effect handlers. The host discovers a json bundle's handlers by
// convention: `<id>/effect_handlers/index` whose DEFAULT export is the bundle's EffectHandlerMap.
//
// These are the ONLY place effectful work lives. The document declares `invoke("<name>")`; the shared
// dispatcher routes it here. Each handler reads the live store (the kernel applies reducer ops before
// effects run) and returns store deltas.
//
import { setOp, type EffectContext, type EffectHandlerMap } from "@gik/react";
import { clearFoundryAccessKey } from "../../../services/foundry-agent";

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export const effects: EffectHandlerMap = {
  acceptFoundryAccess(ctx: EffectContext) {
    const agentNames = Array.isArray(ctx.payload.agentNames)
      ? ctx.payload.agentNames.filter((value): value is string => typeof value === "string")
      : [];
    const currentAgent = str(ctx.get("agent.agentName"));
    return {
      ops: [
        setOp("agent.agentOptions", agentNames),
        setOp("agent.agentName", agentNames.includes(currentAgent) ? currentAgent : agentNames[0] ?? ""),
        setOp("agent.error", ""),
      ],
    };
  },

  clearFoundryAccess() {
    return {
      ops: [
        setOp("agent.agentName", ""),
        setOp("agent.agentOptions", []),
        setOp("agent.conversationId", ""),
      ],
    };
  },

  signOut() {
    clearFoundryAccessKey();
    return {
      ops: [
        setOp("agent.agentName", ""),
        setOp("agent.reply", ""),
        setOp("agent.lastAsked", ""),
        setOp("agent.conversationId", ""),
        setOp("agent.agentOptions", []),
        setOp("agent.error", ""),
      ],
    };
  },
};

export default effects;
