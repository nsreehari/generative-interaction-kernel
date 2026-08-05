import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import { openSampleBlueprint, resolveSampleBlueprintSource } from "../shared/blueprints";

import { FUNCTION_ACCESS } from "../shared/function-access";

const FOUNDRY_ACCESS_STORAGE_KEY = FUNCTION_ACCESS.foundry.storageKey;
import effects from "../blueprints/foundry-agent/native/effect_handlers/foundryAgentEffectHandlers";
import { createFoundryAgentKind } from "../services/foundry-agent";
import {
  browserServiceRegistryOptions,
  declarativeServiceOrchestrator,
} from "../shared/service-runtime";

const FOUNDRY_BLUEPRINTS = ["foundry-agent", "foundry-agent-no-cells"] as const;

test("the no-cells variant means behavior-only Cells without token dataflow", () => {
  const standardSource = resolveSampleBlueprintSource("foundry-agent");
  const behaviorOnlySource = resolveSampleBlueprintSource("foundry-agent-no-cells");
  const standard = openSampleBlueprint("foundry-agent");
  const behaviorOnly = openSampleBlueprint("foundry-agent-no-cells");
  assert.equal(behaviorOnlySource.payload.metadata?.sampleVariant, "behavior-only-no-dataflow");
  assert.equal(Object.values(behaviorOnlySource.payload.cells ?? {}).every((cell) =>
    (cell.inputs?.length ?? 0) === 0 && (cell.outputs?.length ?? 0) === 0
  ), true);
  assert.equal(Object.values(standardSource.payload.cells ?? {}).some((cell) =>
    (cell.inputs?.length ?? 0) > 0 || (cell.outputs?.length ?? 0) > 0
  ), true);
  assert.equal(behaviorOnly.program.payload.root.id, standard.program.payload.root.id);
});

function runtime(blueprintId: typeof FOUNDRY_BLUEPRINTS[number]) {
  const blueprintRuntime = openSampleBlueprint(blueprintId);
  const { vocabulary, program, state } = blueprintRuntime;
  return loadBundleRuntime(bundleFromJson(
    { vocabulary, program, state },
    {
      effectHandlers: effects,
      wrapOrchestrator: declarativeServiceOrchestrator(blueprintRuntime, browserServiceRegistryOptions),
    }
  ));
}

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
  return values;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("foundry service exposes schema-constrained replies as structured output", async () => {
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

test("foundry service executes declared host lifecycle calls and continues the response", async () => {
  const requestBodies: Record<string, unknown>[] = [];
  const factory = createFoundryAgentKind(async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const firstTurn = requestBodies.length === 1;
    return new Response(JSON.stringify(firstTurn ? {
      conversationId: "conversation-1",
      responseId: "response-1",
      reply: "",
      toolCalls: [{ callId: "call-1", name: "use_blueprint_inspect", arguments: '{"id":"incident-1"}' }],
    } : {
      conversationId: "conversation-1",
      responseId: "response-2",
      reply: "Inspection complete",
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
    }],
  });

  assert.deepEqual(requestBodies[1].toolOutputs, [{
    callId: "call-1",
    output: JSON.stringify({ active: true, input: { id: "incident-1" } }),
  }]);
  assert.equal(requestBodies[1].conversationId, "conversation-1");
  assert.equal(requestBodies[1].message, undefined);
  assert.equal((result.output as { reply?: string }).reply, "Inspection complete");
});

describe.each(FOUNDRY_BLUEPRINTS)("%s Blueprint runtime", (blueprintId) => {
test("access check and agent discovery run as separate phases", async () => {
  const values = installLocalStorage();
  values.set(FOUNDRY_ACCESS_STORAGE_KEY, "access-key");
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return String(input).includes("/api/access/check")
      ? new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({
          data: [
            { name: "Agent One", state: "enabled" },
            { name: "Agent Two", state: "enabled" },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const { controller, state: store } = runtime(blueprintId);
    await controller.start();
    await controller.emit("foundry-access-gate", "accessRequested", {});

    assert.equal(store.get("agent.accessStatus"), "ready");
    assert.equal(store.get("agent.agentsStatus"), "idle");
    assert.equal(requests.length, 1);
    assert.match(requests[0], /\/api\/access\/check$/);

    await controller.emit("agent-selector", "agentsRequested", {});

    assert.equal(store.get("agent.key"), null);
    assert.equal(store.get("agent.accessStatus"), "ready");
    assert.equal(store.get("agent.agentsStatus"), "ready");
    assert.equal(requests.length, 2);
    assert.match(requests[1], /\/api\/foundry\/agents/);
    assert.deepEqual(store.get("agent.agentOptions"), ["Agent One", "Agent Two"]);
    assert.equal(store.get("agent.agentName"), "Agent One");

    await controller.emit("agent-selector", "select", { value: "Agent Two" });
    assert.equal(store.get("agent.agentName"), "Agent Two");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sign out clears shared access and resets the ask session", async () => {
  const values = installLocalStorage();
  values.set(FOUNDRY_ACCESS_STORAGE_KEY, "access-key");
  const { controller, state: store } = runtime(blueprintId);
  await controller.start();
  await controller.emit("agent-signout-btn", "press", {});
  await controller.settle();

  assert.equal(values.has(FOUNDRY_ACCESS_STORAGE_KEY), false);
  assert.equal(store.get("agent.key"), null);
  assert.equal(store.get("agent.accessStatus"), "required");
  assert.equal(store.get("agent.agentName"), "");
  assert.deepEqual(store.get("agent.agentOptions"), []);
  assert.equal(store.get("agent.conversationId"), "");
});

test("chat resolves the host credential without copying it into Kernel state", async () => {
  const values = installLocalStorage();
  values.set(FOUNDRY_ACCESS_STORAGE_KEY, "access-key");
  const originalFetch = globalThis.fetch;
  let request: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("/api/access/check")) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(input).includes("/api/foundry/agents")) {
      return new Response(JSON.stringify({ data: [{ name: "Agent One", state: "enabled" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    request = init;
    return new Response(JSON.stringify({
      conversationId: "conversation-1",
      responseId: "response-1",
      reply: "Hello from Foundry",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const { controller, state: store } = runtime(blueprintId);
    await controller.start();
    await controller.emit("foundry-access-gate", "accessRequested", {});
    await controller.settle();
    await controller.emit("agent-selector", "agentsRequested", {});
    await controller.settle();
    await controller.emit("agent-message-field", "input", { value: "Hello" });
    await controller.emit("agent-ask-btn", "press", {}, "human-user");
    await controller.settle();

    assert.equal((request?.headers as Record<string, string>)["x-functions-key"], "access-key");
    assert.equal(JSON.parse(String(request?.body)).responseSchema, undefined);
    assert.equal(store.get("agent.reply"), "Hello from Foundry");
    assert.equal(store.get("agent.conversationId"), "conversation-1");
    assert.equal(store.get("agent.key"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing access settles as required without invoking the proxy", async () => {
  installLocalStorage();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(null, { status: 500 });
  };
  try {
    const { controller, state: store } = runtime(blueprintId);
    await controller.start();
    await controller.emit("foundry-access-gate", "accessRequested", {});
    await controller.settle();

    assert.equal(calls, 0);
    assert.equal(store.get("agent.accessStatus"), "required");
    assert.equal(store.get("agent.accessError"), "Foundry access is required.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejected access is cleared and settles back to required", async () => {
  const values = installLocalStorage();
  values.set(FOUNDRY_ACCESS_STORAGE_KEY, "rejected-key");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
  try {
    const { controller, state: store } = runtime(blueprintId);
    await controller.start();
    await controller.emit("foundry-access-gate", "accessRequested", {});
    await controller.settle();

    assert.equal(values.has(FOUNDRY_ACCESS_STORAGE_KEY), false);
    assert.equal(store.get("agent.accessStatus"), "required");
    assert.equal(store.get("agent.accessError"), "That access key was rejected.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat failures settle into application error state", async () => {
  const values = installLocalStorage();
  values.set(FOUNDRY_ACCESS_STORAGE_KEY, "access-key");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("/api/access/check")
    ? new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    : String(input).includes("/api/foundry/agents")
      ? new Response(JSON.stringify({ data: [{ name: "Agent One", state: "enabled" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
      : new Response(JSON.stringify({ error: "Provider unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
  try {
    const { controller, state: store } = runtime(blueprintId);
    await controller.start();
    await controller.emit("foundry-access-gate", "accessRequested", {});
    await controller.settle();
    await controller.emit("agent-selector", "agentsRequested", {});
    await controller.settle();
    await controller.emit("agent-message-field", "input", { value: "Hello" });
    await controller.emit("agent-ask-btn", "press", {}, "human-user");
    await controller.settle();

    assert.equal(store.get("agent.accessStatus"), "ready");
    assert.equal(store.get("agent.error"), "Provider unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
});
