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
import manifest from "../manifest.json";

/** The Foundry proxy base URL is declared once in the bundle manifest (payload.config.proxyBase). */
function proxyBase(): string {
  return manifest.payload.config.proxyBase.replace(/\/$/, "");
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export const effects: EffectHandlerMap = {
  // Smoke test: the proxy host rejects a bad key with 401/403; a valid key + resolvable agent name
  // returns 200 with the agent name, which unlocks the demo.
  async verifyKey(ctx: EffectContext) {
    const key = str(ctx.get("agent.key")).trim();
    const agentName = str(ctx.get("agent.agentName")).trim();
    if (!key || !agentName) {
      return { ops: [setOp("agent.authError", "Enter your access key and choose an agent.")] };
    }
    try {
      const verifiedAgentName = await createFoundryProxy({ baseUrl: proxyBase(), key }).ping(agentName);
      return {
        ops: [
          setOp("agent.authError", ""),
          setOp("agent.agentName", verifiedAgentName),
          setOp("agent.stage", "unlocked"),
        ],
      };
    } catch (error) {
      if (error instanceof FoundryProxyError && (error.status === 401 || error.status === 403)) {
        return { ops: [setOp("agent.authError", "That access key was rejected.")] };
      }
      if (error instanceof FoundryProxyError) {
        return { ops: [setOp("agent.authError", error.message || "Couldn't sign in. Check your key and agent.")] };
      }
      return { ops: [setOp("agent.authError", "Couldn't reach the service. Please try again.")] };
    }
  },

  // List the agents available for this key (new Foundry Agent Service, agents-by-name). Results are
  // written to the store so the login view renders from state and a plain ui:button gets the spinner.
  async listAgents(ctx: EffectContext) {
    const key = str(ctx.get("agent.key")).trim();
    if (!key) return { ops: [] };
    try {
      const names = await createFoundryProxy({ baseUrl: proxyBase(), key }).listAgents();
      const ops = [
        setOp("agent.listError", ""),
        setOp("agent.listed", true),
        setOp("agent.agentOptions", names),
      ];
      // Default-select the first agent so the Select matches state and Continue can appear.
      if (names.length > 0 && str(ctx.get("agent.agentName")).trim() === "") {
        ops.push(setOp("agent.agentName", names[0]));
      }
      return { ops };
    } catch (error) {
      const rejected = error instanceof FoundryProxyError && (error.status === 401 || error.status === 403);
      return {
        ops: [
          setOp("agent.agentOptions", []),
          setOp("agent.listed", true),
          setOp("agent.listError", rejected ? "That access key was rejected." : "Couldn't load the agent list."),
        ],
      };
    }
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

  // Lock the demo again and drop the key + conversation from state.
  signOut() {
    return {
      ops: [
        setOp("agent.stage", "locked"),
        setOp("agent.key", ""),
        setOp("agent.reply", ""),
        setOp("agent.lastAsked", ""),
        setOp("agent.conversationId", ""),
        setOp("agent.agentOptions", []),
        setOp("agent.listed", false),
        setOp("agent.listError", ""),
        setOp("agent.error", ""),
        setOp("agent.authError", ""),
      ],
    };
  },
};

export default effects;
