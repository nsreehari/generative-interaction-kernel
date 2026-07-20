import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import { openSampleBlueprint } from "../../shared/blueprints";

import { FOUNDRY_ACCESS_STORAGE_KEY } from "../../services/foundry-agent";
import effects from "./effect_handlers/index";
import {
  browserServiceRegistryOptions,
  declarativeServiceOrchestrator,
} from "../../shared/service-runtime";

function runtime() {
  const blueprintRuntime = openSampleBlueprint("foundry-agent");
  const { manifest, document, state } = blueprintRuntime;
  return loadBundleRuntime(bundleFromJson(
    { manifest, document, state },
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

test("access resolution populates the ask page and selects an available agent", async () => {
  const { controller, state: store } = runtime();
  await controller.start();

  await controller.emit("foundry-access-gate", "accessResolved", {
    key: "access-key",
    agentNames: ["Agent One", "Agent Two"],
  });

  assert.equal(store.get("agent.key"), null);
  assert.deepEqual(store.get("agent.agentOptions"), ["Agent One", "Agent Two"]);
  assert.equal(store.get("agent.agentName"), "Agent One");

  await controller.emit("agent-selector", "select", { value: "Agent Two" });
  assert.equal(store.get("agent.agentName"), "Agent Two");
});

test("sign out clears persistent access and resets the ask session", async () => {
  const values = installLocalStorage();
  values.set(FOUNDRY_ACCESS_STORAGE_KEY, "access-key");
  const { controller, state: store } = runtime();
  await controller.start();
  await controller.emit("foundry-access-gate", "accessResolved", {
    key: "access-key",
    agentNames: ["Agent One"],
  });

  await controller.emit("agent-signout-btn", "press", {});

  assert.equal(values.has(FOUNDRY_ACCESS_STORAGE_KEY), false);
  assert.equal(store.get("agent.key"), null);
  assert.equal(store.get("agent.agentName"), "");
  assert.deepEqual(store.get("agent.agentOptions"), []);
  assert.equal(store.get("agent.conversationId"), "");
});

test("chat resolves the host credential without copying it into Kernel state", async () => {
  const values = installLocalStorage();
  values.set(FOUNDRY_ACCESS_STORAGE_KEY, "access-key");
  const originalFetch = globalThis.fetch;
  let request: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({
      conversationId: "conversation-1",
      responseId: "response-1",
      reply: "Hello from Foundry",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const { controller, state: store } = runtime();
    await controller.start();
    await controller.emit("foundry-access-gate", "accessResolved", {
      key: "access-key",
      agentNames: ["Agent One"],
    });
    await controller.emit("agent-message-field", "input", { value: "Hello" });
    await controller.emit("agent-ask-btn", "press", {}, "human-user");

    assert.equal((request?.headers as Record<string, string>)["x-functions-key"], "access-key");
    assert.equal(store.get("agent.reply"), "Hello from Foundry");
    assert.equal(store.get("agent.conversationId"), "conversation-1");
    assert.equal(store.get("agent.key"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
