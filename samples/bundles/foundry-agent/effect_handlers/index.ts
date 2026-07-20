// The foundry-agent bundle's named effect handlers. The host discovers a json bundle's handlers by
// convention: `<id>/effect_handlers/index` whose DEFAULT export is the bundle's EffectHandlerMap.
//
// These are the ONLY place effectful work lives. The document declares `invoke("<name>")`; the shared
// dispatcher routes it here. Each handler reads the live store (the kernel applies reducer ops before
// effects run) and returns store deltas.
//
import { setOp, type EffectHandlerMap } from "@gik/react";

export const effects: EffectHandlerMap = {
  beginFoundryAccess() {
    return {
      ops: [
        setOp("agent.accessStatus", "checking"),
        setOp("agent.accessError", ""),
      ],
    };
  },

  clearFoundryAccess() {
    return {
      ops: [
        setOp("agent.accessStatus", "required"),
        setOp("agent.accessError", ""),
        setOp("agent.agentName", ""),
        setOp("agent.agentOptions", []),
        setOp("agent.conversationId", ""),
      ],
    };
  },

  signOut() {
    return {
      ops: [
        setOp("agent.accessStatus", "required"),
        setOp("agent.accessError", ""),
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
