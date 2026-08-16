import assert from "node:assert/strict";
import { test } from "vitest";
import { executeCopilotAgentInvocation } from "../service-kinds/copilot-agent/runtime";

function mcpFetch(structuredContent: Record<string, unknown>) {
  let calls = 0;
  const requests: Record<string, unknown>[] = [];
  const fetchImpl: typeof globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: "init", result: {} }), {
        status: 200,
        headers: { "content-type": "application/json", "mcp-session-id": "session-1" },
      });
    }
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "call",
      result: { content: [], structuredContent },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, requests };
}

function invocation(operation: string, input: Record<string, unknown>) {
  return {
    kind: "copilot-agent",
    operation,
    input,
    declaration: {
      kind: "copilot-agent",
      version: "1",
      operations: {},
      config: {
        server: `https://mcp.example/${operation}`,
        model: "gpt-5.4",
        workspaceRef: "C:/workspace",
      },
      scope: "per-session",
    },
  } as never;
}

test("Copilot discovery lists provisioned MCP agents", async () => {
  const { fetchImpl, requests } = mcpFetch({
    agents: [{ id: "reviewer" }, { id: "planner" }],
  });

  const result = await executeCopilotAgentInvocation(invocation("discover", {}), fetchImpl);

  assert.deepEqual(result, ["reviewer", "planner"]);
  assert.deepEqual((requests[1].params as { name: string; arguments: unknown }), {
    name: "copilot.list_agents",
    arguments: { cwd: "C:/workspace" },
  });
});

test("Copilot chat runs the selected provisioned agent", async () => {
  const { fetchImpl, requests } = mcpFetch({
    stdout: "Repository analysis complete",
    sessionId: "copilot-session",
  });

  const result = await executeCopilotAgentInvocation(invocation("chat", {
    message: "Analyze the repository",
    agentName: "reviewer",
  }), fetchImpl);

  assert.deepEqual(result, {
    reply: "Repository analysis complete",
    conversationId: "copilot-session",
    responseId: "copilot-session",
  });
  assert.deepEqual((requests[1].params as { name: string; arguments: unknown }), {
    name: "copilot.run_agent",
    arguments: {
      message: "Analyze the repository",
      agent: "reviewer",
      cwd: "C:/workspace",
      model: "gpt-5.4",
      runMode: "sync",
    },
  });
});

test.runIf(process.env.GIK_LIVE_COPILOT === "1")(
  "Copilot bridge discovers and runs the provisioned agent over live MCP",
  async () => {
    const declaration = {
      kind: "copilot-agent",
      version: "1",
      operations: {},
      config: {
        server: "http://127.0.0.1:7801/mcp",
        model: "gpt-5.4",
        workspaceRef: ".copilot-workspace",
      },
      scope: "per-session",
    };
    const request = (operation: string, input: Record<string, unknown>) => ({
      kind: "copilot-agent",
      operation,
      input,
      declaration,
      correlationId: "ai-agent-live-test",
    }) as never;

    const agents = await executeCopilotAgentInvocation(request("discover", {}));
    assert.equal(Array.isArray(agents) && agents.includes("simple-chat"), true);

    const response = await executeCopilotAgentInvocation(request("chat", {
      agentName: "simple-chat",
      message: "Reply with exactly: AI_AGENT_HTTP_OK",
    })) as { reply: string };
    assert.match(response.reply, /AI_AGENT_HTTP_OK/);
  },
  180_000,
);