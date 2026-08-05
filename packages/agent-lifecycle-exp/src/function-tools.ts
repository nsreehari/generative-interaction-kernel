import type { AgentTool, JsonSchema } from "./types";

export interface AgentFunctionToolDefinition {
  readonly type: "function";
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
  readonly strict: true;
}

export interface AgentFunctionCall {
  readonly callId: string;
  readonly name: string;
  readonly arguments: string;
}

export interface AgentFunctionCallOutput {
  readonly type: "function_call_output";
  readonly call_id: string;
  readonly output: string;
}

function requireAgentTool(tool: AgentTool): AgentTool {
  if (tool.lifecycle !== "agent") {
    throw new Error(`Lifecycle tool '${tool.name}' is '${tool.lifecycle}' and cannot execute with agent authority`);
  }
  return tool;
}

export function toAgentFunctionTools(tools: readonly AgentTool[]): AgentFunctionToolDefinition[] {
  return tools.map(requireAgentTool).map(({ name, description, inputSchema }) => ({
    type: "function",
    name,
    description,
    parameters: inputSchema,
    strict: true,
  }));
}

export async function executeAgentFunctionCall(
  tools: readonly AgentTool[],
  call: AgentFunctionCall,
): Promise<AgentFunctionCallOutput> {
  const tool = tools.find(({ name }) => name === call.name);
  if (!tool) throw new Error(`Unknown agent lifecycle function '${call.name}'`);
  requireAgentTool(tool);
  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    throw new Error(`Agent lifecycle function '${call.name}' received invalid JSON arguments`);
  }
  const result = await tool.handler(args);
  return {
    type: "function_call_output",
    call_id: call.callId,
    output: JSON.stringify(result ?? null),
  };
}