// The foundry-agent bundle's named effect handlers. The host discovers a json bundle's handlers by
// convention: `<id>/effect_handlers/index` whose DEFAULT export is the bundle's EffectHandlerMap.
//
// These are the ONLY place effectful work lives. The document declares `invoke("<name>")`; the shared
// dispatcher routes it here. Each handler reads the live store (the kernel applies reducer ops before
// effects run) and returns store deltas.
//
// All three talk to the BFF proxy (foundry-agent-proxy Azure Function) — never to Azure directly, so
// the published static page holds no Azure credential. The user-supplied function key travels as the
// `x-functions-key` header and the user-supplied agent id in the request body.

import { setOp, type EffectContext, type EffectHandlerMap } from "@gik/react";

/** The proxy base URL is injected at build time (VITE_FOUNDRY_PROXY_BASE); dev defaults to local func. */
function proxyBase(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_FOUNDRY_PROXY_BASE || "http://localhost:7071").replace(/\/$/, "");
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
  // Fetch the agent ids this function key can see, via the proxy's transparent passthrough
  // (GET /api/foundry/assistants). Populates agent.agentOptions so the document can offer a
  // dropdown instead of a free-text agent id box.
  async listAgents(ctx: EffectContext) {
    const key = str(ctx.get("agent.key")).trim();
    if (!key) {
      return { ops: [setOp("agent.authError", "Enter your access key first.")] };
    }
    try {
      const res = await fetch(`${proxyBase()}/api/foundry/assistants?api-version=2025-05-01`, {
        method: "GET",
        headers: { "x-functions-key": key },
      });
      if (res.status === 401 || res.status === 403) {
        return { ops: [setOp("agent.authError", "That access key was rejected.")] };
      }
      if (!res.ok) {
        const msg = await errorMessage(res);
        return { ops: [setOp("agent.authError", msg || "Couldn't load the agent list.")] };
      }
      const data = (await res.json()) as { data?: Array<{ id?: unknown; name?: unknown }> };
      const options = (Array.isArray(data?.data) ? data.data : [])
        .filter((a) => a && typeof a.id === "string")
        .map((a) => {
          const id = str(a.id);
          const name = str(a.name);
          return { value: id, label: name ? `${name} (${id})` : id };
        });
      if (options.length === 0) {
        return { ops: [setOp("agent.authError", "No agents are available for this key.")] };
      }
      const ops = [setOp("agent.authError", ""), setOp("agent.agentOptions", options)];
      // Default the selection to the first agent when nothing is chosen yet.
      if (!str(ctx.get("agent.agentId")).trim()) ops.push(setOp("agent.agentId", options[0].value));
      return { ops };
    } catch {
      return { ops: [setOp("agent.authError", "Couldn't reach the service. Please try again.")] };
    }
  },

  // Smoke test: the proxy host rejects a bad key with 401/403; a valid key + resolvable agent id
  // returns 200 with the agent name, which unlocks the demo.
  async verifyKey(ctx: EffectContext) {
    const key = str(ctx.get("agent.key")).trim();
    const agentId = str(ctx.get("agent.agentId")).trim();
    if (!key || !agentId) {
      return { ops: [setOp("agent.authError", "Enter your access key and choose an agent.")] };
    }
    try {
      const res = await fetch(`${proxyBase()}/api/agent/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-functions-key": key },
        body: JSON.stringify({ agentId }),
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
          setOp("agent.agentName", str(data?.agentName) || agentId),
          setOp("agent.stage", "unlocked"),
        ],
      };
    } catch {
      return { ops: [setOp("agent.authError", "Couldn't reach the service. Please try again.")] };
    }
  },

  // Post a message to the agent through the proxy, threading the conversation via threadId.
  async askAgent(ctx: EffectContext) {
    const message = str(ctx.get("agent.draft")).trim();
    if (!message) return;
    const key = str(ctx.get("agent.key")).trim();
    const agentId = str(ctx.get("agent.agentId")).trim();
    try {
      const res = await fetch(`${proxyBase()}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-functions-key": key },
        body: JSON.stringify({
          message,
          agentId,
          threadId: str(ctx.get("agent.threadId")) || undefined,
        }),
      });
      if (!res.ok) {
        const msg = await errorMessage(res);
        return { ops: [setOp("agent.error", msg || "Couldn't get a reply. Please try again.")] };
      }
      const data = (await res.json()) as { threadId?: string; reply?: string };
      return {
        ops: [
          setOp("agent.error", ""),
          setOp("agent.lastAsked", message),
          setOp("agent.draft", ""),
          setOp("agent.threadId", str(data?.threadId)),
          setOp("agent.reply", str(data?.reply)),
        ],
      };
    } catch {
      return { ops: [setOp("agent.error", "Couldn't reach the service. Please try again.")] };
    }
  },

  // Lock the demo again and drop the key + conversation from state.
  signOut() {
    return {
      ops: [
        setOp("agent.stage", "locked"),
        setOp("agent.key", ""),
        setOp("agent.agentOptions", []),
        setOp("agent.reply", ""),
        setOp("agent.lastAsked", ""),
        setOp("agent.threadId", ""),
        setOp("agent.error", ""),
        setOp("agent.authError", ""),
      ],
    };
  },
};

export default effects;
