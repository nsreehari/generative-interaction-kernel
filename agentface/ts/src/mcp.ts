// The MCP tool surface: one tool per AgentFace method, plus a PURE JSON-RPC dispatcher. This stays
// transport-free — it turns a JSON-RPC message into a JSON-RPC reply and knows nothing about HTTP,
// stdio, or SSE. A host (node-host `/mcp`, or an in-proc caller) is a thin shell
// that feeds messages in and writes replies out. Same "library first, wrap later" discipline as the
// kernel-vs-transport seam.

import { describeCatalog, namespaces, effects } from "./catalog";
import { validateDocument, lint, authorDocument } from "./document";
import { validateCapability } from "./capability";
import { describeInteractions, validateInteraction } from "./interaction";
import { validatePresentation } from "./presentation";
import { validateIntent, intentToEdits } from "./intent";

/** The advertised protocol version (MCP revision this surface speaks). */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** A single MCP tool: metadata for `tools/list` plus the JSON->JSON handler `tools/call` invokes. */
export interface AgentFaceTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => unknown;
}

const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const any = { type: "object" } as const;

/** One tool per public AgentFace method. Handlers are the JSON-native library functions verbatim. */
export const agentFaceTools: AgentFaceTool[] = [
  {
    name: "describeCatalog",
    description: "Project a manifest into a discovery catalog (capabilities, namespaces, effects).",
    inputSchema: obj({ manifest: any }, ["manifest"]),
    handler: (a) => describeCatalog(a.manifest),
  },
  {
    name: "namespaces",
    description: "List the state namespaces a manifest declares.",
    inputSchema: obj({ manifest: any }, ["manifest"]),
    handler: (a) => namespaces(a.manifest),
  },
  {
    name: "effects",
    description: "List the external effect handlers a manifest declares.",
    inputSchema: obj({ manifest: any }, ["manifest"]),
    handler: (a) => effects(a.manifest),
  },
  {
    name: "validateDocument",
    description: "Dry-run validate a UI document against a manifest (structure + reference lint).",
    inputSchema: obj({ manifest: any, document: any }, ["manifest", "document"]),
    handler: (a) => validateDocument(a.manifest, a.document),
  },
  {
    name: "lintDocument",
    description: "Lint a UI document's references against a manifest (non-throwing warnings only).",
    inputSchema: obj({ manifest: any, document: any }, ["manifest", "document"]),
    handler: (a) => lint(a.manifest, a.document),
  },
  {
    name: "authorDocument",
    description: "Validate then commit a UI document, returning a wire message or a shaped error.",
    inputSchema: obj({ document: any, manifest: any }, ["document"]),
    handler: (a) => authorDocument(a.document, a.manifest as never),
  },
  {
    name: "validateCapability",
    description: "Validate a capability DEFINITION (leaf track); optional registry view enables render/floor checks.",
    inputSchema: obj({ capability: any, registryView: any }, ["capability"]),
    handler: (a) => validateCapability(a.capability, a.registryView as never),
  },
  {
    name: "describeInteractions",
    description: "List the interaction taxonomy (every kind with its facets) — vocabulary discovery.",
    inputSchema: obj({}),
    handler: () => describeInteractions(),
  },
  {
    name: "validateInteraction",
    description: "Validate an InteractionSpec (kind known, subject present, facet/data references).",
    inputSchema: obj({ spec: any }, ["spec"]),
    handler: (a) => validateInteraction(a.spec),
  },
  {
    name: "validatePresentation",
    description: "Validate a Presentation DSL artifact (structure + the required-facet-survives invariant).",
    inputSchema: obj({ spec: any }, ["spec"]),
    handler: (a) => validatePresentation(a.spec),
  },
  {
    name: "validateIntent",
    description: "Validate an IntentSpec; when an interaction is supplied, check targets against its facets.",
    inputSchema: obj({ intent: any, interaction: any }, ["intent"]),
    handler: (a) => validateIntent(a.intent, a.interaction as never),
  },
  {
    name: "intentToEdits",
    description: "Project an IntentSpec into PresentationEdits (the sanctioned override channel).",
    inputSchema: obj({ intent: any }, ["intent"]),
    handler: (a) => intentToEdits(a.intent as never),
  },
];

const byName = new Map(agentFaceTools.map((t) => [t.name, t]));

/** Tool metadata for `tools/list` (drops the handler). */
export function listTools(): { name: string; description: string; inputSchema: Record<string, unknown> }[] {
  return agentFaceTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/** Invoke one tool by name. Throws {@link McpToolError} for an unknown tool. */
export function callTool(name: string, args: Record<string, unknown> = {}): unknown {
  const tool = byName.get(name);
  if (!tool) throw new McpToolError(`unknown tool: ${name}`);
  return tool.handler(args ?? {});
}

export class McpToolError extends Error {}

// --- JSON-RPC 2.0 (the MCP wire contract), pure and transport-free ---------

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

/**
 * Handle one MCP JSON-RPC message and return the reply object (or `undefined` for a notification —
 * a request with no `id`). Supports `initialize`, `tools/list`, and `tools/call`. Pure: no I/O.
 */
export function handleMcpMessage(message: unknown): Record<string, unknown> | undefined {
  const req = (message ?? {}) as JsonRpcRequest;
  const { id, method, params } = req;
  const isNotification = id === undefined;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "genui-agentface", version: "0.1" },
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
      try {
        const result = callTool(name, args);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        });
      } catch (e) {
        // A tool that throws is reported as a tool result with isError, per MCP.
        return rpcResult(id, {
          content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        });
      }
    }
    default:
      return isNotification ? undefined : rpcError(id, -32601, `method not found: ${String(method)}`);
  }
}
