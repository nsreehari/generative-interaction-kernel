import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

interface McpReply<T> {
  result?: { structuredContent: T };
  error?: { message?: string };
}

async function callMcp<T>(baseUrl: string, path: string, name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const reply = (await response.json()) as McpReply<T>;
  if (!response.ok || reply.error || !reply.result) {
    throw new Error(reply.error?.message || `MCP ${name} failed with HTTP ${response.status}`);
  }
  return reply.result.structuredContent;
}

export interface ContinuityWorkerResult {
  processed: boolean;
  rev?: number;
}

export async function processContinuityQueue(baseUrl: string): Promise<ContinuityWorkerResult> {
  const state = await callMcp<{ continuity?: { job?: { status?: string } } }>(baseUrl, "/mcp", "getState", {});
  if (state.continuity?.job?.status !== "queued") return { processed: false };

  const patch = await callMcp<{ rev: number }>(baseUrl, "/mcp-control", "emit", {
    event: {
      node: "continuity-controller",
      name: "complete",
      payload: { actorId: "background-worker" },
    },
  });
  return { processed: true, rev: patch.rev };
}

const isEntrypoint = process.argv[1] ? resolvePath(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isEntrypoint) {
  const baseUrl = process.env.GIK_CONTINUITY_URL || "http://127.0.0.1:8788";
  processContinuityQueue(baseUrl)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}