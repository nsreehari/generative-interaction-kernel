import type { Json } from "@gik/kernel";
import { serviceConfig } from "@gik/controlface";
import type { WorkerServiceInvocation } from "../worker-service-kind";
import { executeMcpServiceInvocation } from "../mcp/runtime";

type McpResult = {
  text?: Json;
  structured?: Json;
};

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
    const result = await executeMcpServiceInvocation(
      mcpInvocation(request, "copilot.run_agent", {
        message: String(input.message ?? ""),
        agent: String(input.agentName ?? ""),
        cwd,
        model: String(input.model ?? config.model ?? ""),
        runMode: "sync",
      }),
      fetchImpl,
    ) as McpResult;
    const structured = result.structured && typeof result.structured === "object" && !Array.isArray(result.structured)
      ? result.structured as Record<string, Json>
      : {};
    return {
      reply: String(structured.stdout ?? result.text ?? ""),
      conversationId: String(structured.sessionId ?? input.conversationId ?? ""),
      responseId: String(structured.sessionId ?? request.correlationId ?? "copilot-run"),
    };
  }

  throw new Error(`Unsupported copilot-agent operation '${request.operation}'`);
}