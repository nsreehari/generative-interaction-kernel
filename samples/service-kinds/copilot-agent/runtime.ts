import type { Json } from "@gik/kernel";
import { serviceConfig } from "@gik/controlface/services";
import type { WorkerServiceInvocation } from "../worker-service-kind";
import { executeMcpServiceInvocation } from "../mcp/runtime";
import { parseAgentJsonReply } from "../agent-json-response";

type McpResult = {
  text?: Json;
  structured?: Json;
};

const DEFAULT_COPILOT_TIMEOUT_MS = 120_000;

function mcpInvocation(
  request: WorkerServiceInvocation,
  tool: string,
  input: Record<string, Json>,
): WorkerServiceInvocation {
  const config = serviceConfig(request.declaration);
  const server = String(config.server ?? "").trim();
  if (!server) throw new Error("copilot-agent requires an MCP server");
  return {
    ...request,
    kind: "mcp",
    declaration: {
      ...request.declaration,
      kind: "mcp",
      config: { server, tool },
    },
    operation: "call-tool",
    input,
  };
}

export async function executeCopilotAgentInvocation(
  request: WorkerServiceInvocation,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): Promise<Json> {
  const config = serviceConfig(request.declaration);
  const input = request.input && typeof request.input === "object" && !Array.isArray(request.input)
    ? request.input as Record<string, Json>
    : {};
  const cwd = String(input.workspaceRef ?? config.workspaceRef ?? ".");

  if (request.operation === "discover") {
    const result = await executeMcpServiceInvocation(
      mcpInvocation(request, "copilot.list_agents", { cwd }),
      fetchImpl,
    ) as McpResult;
    const structured = result.structured && typeof result.structured === "object" && !Array.isArray(result.structured)
      ? result.structured as Record<string, Json>
      : {};
    const agents = Array.isArray(structured.agents) ? structured.agents : [];
    return agents
      .map((agent) => agent && typeof agent === "object" && !Array.isArray(agent)
        ? String((agent as Record<string, Json>).id ?? "").trim()
        : "")
      .filter(Boolean);
  }

  if (request.operation === "chat") {
    const instructions = String(input.instructions ?? "").trim();
    const message = String(input.message ?? "").trim();
    const timeoutMs = typeof config.timeoutMs === "number"
      ? config.timeoutMs
      : DEFAULT_COPILOT_TIMEOUT_MS;
    const additionalMcpConfig = JSON.stringify({
      mcpServers: {
        "gik-agent-authoring": {
          type: "http",
          url: String(config.server ?? ""),
          tools: ["describe"],
        },
      },
    });
    const result = await executeMcpServiceInvocation(
      mcpInvocation(request, "copilot.run_agent", {
        message: instructions ? `${message}\n\n${instructions}` : message,
        agent: String(input.agentName ?? config.agent ?? ""),
        cwd,
        model: String(input.model ?? config.model ?? ""),
        runMode: "sync",
        timeoutMs,
        additionalMcpConfigs: [additionalMcpConfig],
      }),
      fetchImpl,
    ) as McpResult;
    const structured = result.structured && typeof result.structured === "object" && !Array.isArray(result.structured)
      ? result.structured as Record<string, Json>
      : {};
    const reply = String(structured.stdout ?? result.text ?? "");
    if (config.responseMode === "json") {
      return parseAgentJsonReply("copilot-agent", reply);
    }
    return {
      reply,
      conversationId: String(structured.sessionId ?? input.conversationId ?? ""),
      responseId: String(structured.sessionId ?? request.correlationId ?? "copilot-run"),
    };
  }

  throw new Error(`Unsupported copilot-agent operation '${request.operation}'`);
}