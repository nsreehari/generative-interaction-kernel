// The foundry-agent bundle's named effect handlers. The host discovers a json bundle's handlers by
// convention: `<id>/effect_handlers/index` whose DEFAULT export is the bundle's EffectHandlerMap.
//
// These are the ONLY place effectful work lives. The document declares `invoke("<name>")`; the shared
// dispatcher routes it here. Each handler reads the live store (the kernel applies reducer ops before
// effects run) and returns store deltas.
//
// All three talk to the BFF proxy (foundry-agent-proxy Azure Function) — never to Azure directly, so
// the published static page holds no Azure credential. The user-supplied function key travels as the
// `x-functions-key` header and the user-supplied agent name in the request body.

import { setOp, type EffectContext, type EffectHandlerMap } from "@gik/react";
import { createFoundryProxy, FoundryProxyError } from "../../../shared/foundry-proxy";
import { clearFoundryAccessKey } from "../access-storage";
import manifest from "../manifest.json";

/** The Foundry proxy base URL is declared once in the bundle manifest (payload.config.proxyBase). */
function proxyBase(): string {
  return manifest.payload.config.proxyBase.replace(/\/$/, "");
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export const effects: EffectHandlerMap = {
  acceptFoundryAccess(ctx: EffectContext) {
    const key = str(ctx.payload.key).trim();
    const agentNames = Array.isArray(ctx.payload.agentNames)
      ? ctx.payload.agentNames.filter((value): value is string => typeof value === "string")
      : [];
    const currentAgent = str(ctx.get("agent.agentName"));
    return {
      ops: [
        setOp("agent.key", key),
        setOp("agent.agentOptions", agentNames),
        setOp("agent.agentName", agentNames.includes(currentAgent) ? currentAgent : agentNames[0] ?? ""),
        setOp("agent.error", ""),
      ],
    };
  },

  clearFoundryAccess() {
    return {
      ops: [
        setOp("agent.key", ""),
        setOp("agent.agentName", ""),
        setOp("agent.agentOptions", []),
        setOp("agent.conversationId", ""),
      ],
    };
  },

  // Post a message to the agent through the proxy, threading the conversation via conversationId.
  async askAgent(ctx: EffectContext) {
    const message = str(ctx.get("agent.draft")).trim();
    if (!message) return { ops: [] };
    const key = str(ctx.get("agent.key")).trim();
    const agentName = str(ctx.get("agent.agentName")).trim();
    try {
      const data = await createFoundryProxy({ baseUrl: proxyBase(), key }).chat({
        message,
        agentName,
        conversationId: str(ctx.get("agent.conversationId")) || undefined,
      });
      return {
        ops: [
          setOp("agent.error", ""),
          setOp("agent.lastAsked", message),
          setOp("agent.draft", ""),
          setOp("agent.conversationId", data.conversationId),
          setOp("agent.reply", data.reply),
        ],
      };
    } catch (error) {
      return {
        ops: [
          setOp("agent.error", error instanceof FoundryProxyError ? error.message : "Couldn't reach the service. Please try again."),
        ],
      };
    }
  },

  signOut() {
    clearFoundryAccessKey();
    return {
      ops: [
        setOp("agent.key", ""),
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
