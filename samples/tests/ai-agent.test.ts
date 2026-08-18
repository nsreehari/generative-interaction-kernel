import assert from "node:assert/strict";
import { test } from "vitest";
import { materializeBlueprint } from "@gik/blueprint";
import { BlueprintController } from "@gik/react";
import { openSampleBlueprint, resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";
import { createFoundryAgentKind } from "../service-kinds/foundry-agent";
import { resolveBlueprintNativeFromMaterialized } from "../apps/browser-host/src/runtime/sample-bundles";

async function waitForState(
  controller: BlueprintController,
  predicate: (state: Record<string, unknown>) => boolean,
  timeoutMs = 30_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = controller.getState() as Record<string, unknown>;
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ai-agent state: ${JSON.stringify(controller.getState())}`);
}

test("Foundry service exposes schema-constrained replies as structured output", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const factory = createFoundryAgentKind(async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      conversationId: "conversation-1",
      responseId: "response-1",
      reply: JSON.stringify({ summary: "Concentrated portfolio" }),
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const adapter = factory.create({
    kind: "foundry-agent",
    version: "1",
    operations: { analyze: { operation: "chat", contract: "portfolio-intelligence/v1" } },
    config: {
      endpoint: "https://foundry.example",
      agent: "Portfolio-Intelligence-Agent",
      credentialRef: "foundry-agent/access-key",
    },
  }, {
    hostCapabilities: new Set(["foundry-executor", "credential-resolver"]),
    resolveCredential: async () => "access-key",
  });
  const result = await adapter.execute({
    operation: "chat",
    capabilityId: "portfolio-intelligence/v1",
    input: { message: "Analyze this portfolio", maxOutputTokens: 1800 },
  } as never, {
    responseValidators: [{
      kind: "ajv-schema",
      code: "provider-structured-output",
      schema: {
        type: "object",
        required: ["summary"],
        properties: { summary: { type: "string" } },
        additionalProperties: false,
      },
    }],
  } as never);

  assert.equal((requestBody?.responseSchema as { name?: string })?.name, "portfolio-intelligence_v1_response");
  assert.equal(requestBody?.maxOutputTokens, 1800);
  assert.deepEqual(result.output, { summary: "Concentrated portfolio" });
  assert.deepEqual(result.detail, { responseId: "response-1", conversationId: "conversation-1" });
});

test("Foundry service executes declared host lifecycle calls and continues the response", async () => {
  const requestBodies: Record<string, unknown>[] = [];
  const factory = createFoundryAgentKind(async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const firstTurn = requestBodies.length === 1;
    return new Response(JSON.stringify(firstTurn ? {
      conversationId: "conversation-1",
      responseId: "response-1",
      reply: "",
      toolCalls: [
        { callId: "call-1", name: "use_blueprint_inspect", arguments: "{\"id\":\"incident-1\"}" },
        { callId: "call-2", name: "author_blueprint_set_in_progress_proposal", arguments: "{\"actions\":[]}" },
      ],
    } : {
      conversationId: "conversation-1",
      responseId: "response-2",
      reply: JSON.stringify({ summary: "Inspection complete" }),
      toolCalls: [],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const adapter = factory.create({
    kind: "foundry-agent",
    version: "1",
    operations: { analyze: { operation: "chat", contract: "incident/v1" } },
    config: {
      endpoint: "https://foundry.example",
      agent: "Incident-Agent",
      credentialRef: "foundry-agent/access-key",
    },
  }, {
    hostCapabilities: new Set(["foundry-executor", "credential-resolver"]),
    resolveCredential: async () => "access-key",
  });
  const result = await adapter.execute({
    id: "request-1",
    operation: "chat",
    capabilityId: "incident/v1",
    input: { message: "Inspect this incident" },
  } as never, {
    agentTools: [{
      name: "use_blueprint_inspect",
      description: "Inspect the active incident.",
      inputSchema: { type: "object" },
      lifecycle: "agent",
      handler: (input) => ({ active: true, input }),
    }, {
      name: "author_blueprint_set_in_progress_proposal",
      description: "Replace the in-progress authored Blueprint proposal.",
      inputSchema: { type: "object" },
      lifecycle: "agent",
      handler: (draft, context) => ({ draft, requestId: context?.requestId }),
    }],
    responseValidators: [{
      kind: "ajv-schema",
      code: "provider-structured-output",
      schema: {
        type: "object",
        required: ["summary"],
        properties: { summary: { type: "string" } },
        additionalProperties: false,
      },
    }],
  });

  assert.deepEqual(requestBodies[1].toolOutputs, [
    { callId: "call-1", output: JSON.stringify({ active: true, input: { id: "incident-1" } }) },
    { callId: "call-2", output: JSON.stringify({ draft: { actions: [] }, requestId: "request-1" }) },
  ]);
  assert.equal(requestBodies[1].conversationId, "conversation-1");
  assert.equal(requestBodies[1].message, undefined);
  assert.deepEqual(result.output, { summary: "Inspection complete" });
  assert.equal(result.detail?.inProgressProposal, true);
});

test.each([
  ["missing ai context", undefined],
  ["explicit Foundry context", { ai: "foundry" }],
] as const)("ai-agent lowers to Foundry for %s", (_label, externalContext) => {
  const blueprintRuntime = openSampleBlueprint("ai-agent", externalContext);
  const assistant = blueprintRuntime.definition.payload.services?.assistant;

  assert.equal(assistant?.kind, "foundry-agent");
  assert.equal(assistant?.operations?.discoverAgents?.contract, "ai-agent-list/v1");
  assert.equal(assistant?.operations?.askAgent?.contract, "ai-agent-chat/v1");
  assert.equal(assistant?.operations?.discoverAgents?.response?.validators?.length, 1);
  assert.equal(assistant?.operations?.askAgent?.response?.validators?.length, 1);
});

test("ai-agent lowers to Copilot when requested", () => {
  const blueprintRuntime = openSampleBlueprint("ai-agent", { ai: "copilot" });
  const assistant = blueprintRuntime.definition.payload.services?.assistant;

  assert.equal(assistant?.kind, "copilot-agent");
  assert.equal(assistant?.config?.server, "http://127.0.0.1:7801/mcp");
  assert.equal(assistant?.config?.workspaceRef, ".copilot-workspace");
  assert.equal(assistant?.operations?.discoverAgents?.contract, "ai-agent-list/v1");
  assert.equal(assistant?.operations?.askAgent?.contract, "ai-agent-chat/v1");
  assert.equal(assistant?.operations?.discoverAgents?.response?.validators?.length, 1);
  assert.equal(assistant?.operations?.askAgent?.response?.validators?.length, 1);
});

test.runIf(process.env.GIK_LIVE_COPILOT === "1")(
  "ai-agent cells discover and run a provisioned Copilot agent",
  async () => {
    const blueprint = resolveSampleBlueprintSource("ai-agent");
    const externalContext = { ai: "copilot" };
    const materialized = materializeBlueprint({ blueprint, externalContext });
    const controller = new BlueprintController(blueprint, {
      externalContext,
      materializedBlueprint: materialized,
      native: resolveBlueprintNativeFromMaterialized("ai-agent", materialized),
    });
    try {
      await controller.start();
      const discovered = await waitForState(controller, (state) =>
        Array.isArray((state.agent as { agentOptions?: unknown[] })?.agentOptions)
          && (state.agent as { agentOptions: unknown[] }).agentOptions.length > 0
      );
      assert.deepEqual((discovered.agent as { agentOptions: unknown[] }).agentOptions, [{
        value: "simple-chat",
        label: "simple-chat",
      }]);

      await controller.emit("agent-query-form", "save", {
        values: {
          agentName: "simple-chat",
          message: "Reply with exactly: AI_AGENT_BLUEPRINT_OK",
        },
      });
      const answered = await waitForState(controller, (state) =>
        String((state.agent as { reply?: string })?.reply ?? "").includes("AI_AGENT_BLUEPRINT_OK")
      );
      assert.match(String((answered.agent as { reply?: string }).reply), /AI_AGENT_BLUEPRINT_OK/);
    } finally {
      controller.stop();
    }
  },
  180_000,
);
