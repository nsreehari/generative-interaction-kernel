import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import { openSampleBlueprint } from "../shared/blueprints";

import { FUNCTION_ACCESS } from "../shared/function-access";

const FOUNDRY_ACCESS_STORAGE_KEY = FUNCTION_ACCESS.foundry.storageKey;
import effects from "../bundles/foundry-agent/effect_handlers";
import {
  browserServiceRegistryOptions,
  declarativeServiceOrchestrator,
} from "../shared/service-runtime";

const FOUNDRY_BLUEPRINTS = ["foundry-agent", "foundry-agent-no-cells"] as const;

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

test("sign out resets the ask session and returns access state to required", async () => {
  const values = installLocalStorage();
  values.set(FOUNDRY_ACCESS_STORAGE_KEY, "access-key");
  const { controller, state: store } = runtime(blueprintId);
  await controller.start();
  await controller.emit("agent-signout-btn", "press", {});
  await controller.settle();

  assert.equal(values.has(FOUNDRY_ACCESS_STORAGE_KEY), true);
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
