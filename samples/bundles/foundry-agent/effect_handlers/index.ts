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
import manifest from "../manifest.json";

/** The Foundry proxy base URL is declared once in the bundle manifest (payload.config.proxyBase). */
function proxyBase(): string {
  return manifest.payload.config.proxyBase.replace(/\/$/, "");
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** Best-effort read of a JSON `{ error }` message from a failed response. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (data && typeof data.error === "string") return data.error;
  } catch {
    // ignore non-JSON bodies
  }
  return "";
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
      const res = await fetch(`${proxyBase()}/api/agent/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-functions-key": key },
        body: JSON.stringify({ agentName }),
      });
      if (res.status === 401 || res.status === 403) {
        return { ops: [setOp("agent.authError", "That access key was rejected.")] };
      }
      if (!res.ok) {
        const msg = await errorMessage(res);
        return { ops: [setOp("agent.authError", msg || "Couldn't sign in. Check your key and agent.")] };
      }
      const data = (await res.json()) as { agentName?: string };
      return {
        ops: [
          setOp("agent.authError", ""),
          setOp("agent.agentName", str(data?.agentName) || agentName),
          setOp("agent.stage", "unlocked"),
        ],
      };
    } catch {
      return { ops: [setOp("agent.authError", "Couldn't reach the service. Please try again.")] };
    }
  },

  // Post a message to the agent through the proxy, threading the conversation via conversationId.
  // Every return bumps replyRev — the agent:ask view watches it to clear its in-flight spinner.
  async askAgent(ctx: EffectContext) {
    const nextRev = (Number(ctx.get("agent.replyRev")) || 0) + 1;
    const message = str(ctx.get("agent.draft")).trim();
    if (!message) return { ops: [setOp("agent.replyRev", nextRev)] };
    const key = str(ctx.get("agent.key")).trim();
    const agentName = str(ctx.get("agent.agentName")).trim();
    try {
      const res = await fetch(`${proxyBase()}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-functions-key": key },
        body: JSON.stringify({
          message,
          agentName,
          conversationId: str(ctx.get("agent.conversationId")) || undefined,
        }),
      });
      if (!res.ok) {
        const msg = await errorMessage(res);
        return {
          ops: [
            setOp("agent.replyRev", nextRev),
            setOp("agent.error", msg || "Couldn't get a reply. Please try again."),
          ],
        };
      }
      const data = (await res.json()) as { conversationId?: string; reply?: string };
      return {
        ops: [
          setOp("agent.replyRev", nextRev),
          setOp("agent.error", ""),
          setOp("agent.lastAsked", message),
          setOp("agent.draft", ""),
          setOp("agent.conversationId", str(data?.conversationId)),
          setOp("agent.reply", str(data?.reply)),
        ],
      };
    } catch {
      return {
        ops: [
          setOp("agent.replyRev", nextRev),
          setOp("agent.error", "Couldn't reach the service. Please try again."),
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
        setOp("agent.error", ""),
        setOp("agent.authError", ""),
      ],
    };
  },
};

export default effects;
