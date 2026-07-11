// The shared MCP tool-surface primitive: a JSON tool catalog plus a pure, transport-free JSON-RPC
// 2.0 dispatcher over it. BOTH faces are expressed as `McpTool[]` and dispatched through here —
// AgentFace over its (agent-safe) subset, ControlFace over the full catalog — so the projection is
// literally "filter the tool list". This knows nothing about HTTP/SSE/stdio: a message goes in, a
// reply comes out.
//
// The dispatcher is MaybePromise: a tool with a synchronous handler yields a synchronous reply
// (so pure design-time tools stay sync), while an async handler yields a Promise. Callers that mix
// both simply `await` the result.

/** The advertised protocol version (MCP revision this surface speaks). */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** A single tool: `tools/list` metadata plus the JSON->JSON handler `tools/call` invokes. */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

export class McpToolError extends Error {}

export interface McpServerInfo {
  name: string;
  version: string;
}

type Reply = Record<string, unknown>;
type MaybeReply = Reply | undefined;

export interface McpDispatcher {
  /** The tools this dispatcher serves. */
  readonly tools: McpTool[];
  /** Tool metadata for `tools/list` (drops the handler). */
  listTools(): { name: string; description: string; inputSchema: Record<string, unknown> }[];
  /** Invoke one tool by name; throws {@link McpToolError} for an unknown tool. MaybePromise. */
  callTool(name: string, args?: Record<string, unknown>): unknown | Promise<unknown>;
  /**
   * Handle one JSON-RPC message and return the reply (or `undefined` for a notification). Sync for
   * a sync tool, a Promise for an async tool. Supports `initialize`, `tools/list`, `tools/call`.
   */
  handleMcpMessage(message: unknown): MaybeReply | Promise<MaybeReply>;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });

const isPromise = (v: unknown): v is Promise<unknown> =>
  typeof (v as { then?: unknown } | null)?.then === "function";

/** Build a dispatcher over a tool catalog. Pure and transport-free. */
export function createMcpDispatcher(
  tools: McpTool[],
  serverInfo: McpServerInfo = { name: "genui", version: "0.1" }
): McpDispatcher {
  const byName = new Map(tools.map((t) => [t.name, t]));

  const listTools = () =>
    tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

  const callTool = (name: string, args: Record<string, unknown> = {}) => {
    const tool = byName.get(name);
    if (!tool) throw new McpToolError(`unknown tool: ${name}`);
    return tool.handler(args ?? {});
  };

  const okResult = (id: unknown, result: unknown) =>
    rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    });
  // A tool that throws is reported as a tool result with isError, per MCP.
  const errResult = (id: unknown, e: unknown) =>
    rpcResult(id, { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });

  const handleMcpMessage = (message: unknown): MaybeReply | Promise<MaybeReply> => {
    const req = (message ?? {}) as JsonRpcRequest;
    const { id, method, params } = req;
    const isNotification = id === undefined;

    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo,
        });
      case "notifications/initialized":
        return undefined; // client notification, no reply
      case "tools/list":
        return rpcResult(id, { tools: listTools() });
      case "tools/call": {
        const name = params?.name as string | undefined;
        const args = (params?.arguments as Record<string, unknown>) ?? {};
        if (!name || !byName.has(name)) {
          return isNotification ? undefined : rpcError(id, -32602, `unknown tool: ${String(name)}`);
        }
        let result: unknown;
        try {
          result = byName.get(name)!.handler(args);
        } catch (e) {
          return errResult(id, e);
        }
        if (isPromise(result)) {
          return result.then((r) => okResult(id, r)).catch((e) => errResult(id, e));
        }
        return okResult(id, result);
      }
      default:
        return isNotification ? undefined : rpcError(id, -32601, `method not found: ${String(method)}`);
    }
  };

  return { tools, listTools, callTool, handleMcpMessage };
}
