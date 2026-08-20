import type { Json } from "@gik/kernel";
import { serviceConfig } from "@gik/controlface/services";
import type { WorkerServiceInvocation } from "../worker-service-kind";

type McpSession = {
  server: string;
  sessionId: string;
};

const SESSION_CACHE = new Map<string, Promise<McpSession>>();

function streamableHeaders(sessionId?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  };
}

function parseStreamablePayload(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }

  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (dataLines.length === 0) {
    throw new Error("MCP response did not contain JSON data");
  }

  return JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
}

async function readRpcPayload(response: Response): Promise<Record<string, unknown>> {
  return parseStreamablePayload(await response.text());
}

async function initializeSession(
  server: string,
  fetchImpl: typeof globalThis.fetch
): Promise<McpSession> {
  const response = await fetchImpl(server, {
    method: "POST",
    headers: streamableHeaders(),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `initialize:${Date.now()}`,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "@gik/samples",
          version: "0.1.0",
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP initialize failed (${response.status})`);
  }

  const sessionId = response.headers.get("mcp-session-id")?.trim() ?? "";
  if (!sessionId) {
    throw new Error("MCP initialize did not return a session ID");
  }

  const body = await readRpcPayload(response);
  if (body.error && typeof body.error === "object") {
    const message = String((body.error as Record<string, unknown>).message ?? "MCP initialize failed");
    throw new Error(message);
  }

  return { server, sessionId };
}

function getSession(
  server: string,
  fetchImpl: typeof globalThis.fetch
): Promise<McpSession> {
  const cached = SESSION_CACHE.get(server);
  if (cached) return cached;

  const pending = initializeSession(server, fetchImpl).catch((error) => {
    SESSION_CACHE.delete(server);
    throw error;
  });
  SESSION_CACHE.set(server, pending);
  return pending;
}

function invalidateSession(server: string): void {
  SESSION_CACHE.delete(server);
}

function extractText(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content) ? result.content : [];
  return content
    .filter((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).type === "text")
    .map((entry) => String((entry as Record<string, unknown>).text ?? ""))
    .join("\n")
    .trim();
}

function mcpConfig(request: WorkerServiceInvocation): { server: string; tool: string } {
  const config = serviceConfig(request.declaration);
  const server = String(config.server ?? "").trim();
  const tool = String(config.tool ?? "").trim();
  if (!server) throw new Error("mcp service requires a server");
  if (!tool) throw new Error("mcp service requires a tool");
  return { server, tool };
}

export async function executeMcpServiceInvocation(
  request: WorkerServiceInvocation,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)
): Promise<Json> {
  const { server, tool } = mcpConfig(request);
  const session = await getSession(server, fetchImpl);

  let response = await fetchImpl(server, {
    method: "POST",
    headers: streamableHeaders(session.sessionId),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${tool}:${Date.now()}`,
      method: "tools/call",
      params: {
        name: tool,
        arguments: request.input ?? {},
      },
    }),
  });

  if (response.status === 400) {
    invalidateSession(server);
    const retrySession = await getSession(server, fetchImpl);
    response = await fetchImpl(server, {
      method: "POST",
      headers: streamableHeaders(retrySession.sessionId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${tool}:${Date.now()}:retry`,
        method: "tools/call",
        params: {
          name: tool,
          arguments: request.input ?? {},
        },
      }),
    });
  }

  if (!response.ok) {
    throw new Error(`MCP request failed (${response.status})`);
  }

  const body = await readRpcPayload(response);
  if (body.error && typeof body.error === "object") {
    const message = String((body.error as Record<string, unknown>).message ?? "MCP request failed");
    throw new Error(message);
  }

  const result = body.result && typeof body.result === "object"
    ? body.result as Record<string, unknown>
    : {};
  const text = extractText(result);
  if (result.isError === true) {
    throw new Error(text || "MCP tool reported an error");
  }

  return {
    text,
    structured: result.structuredContent && typeof result.structuredContent === "object"
      ? result.structuredContent as Json
      : {},
  } satisfies Record<string, Json>;
}