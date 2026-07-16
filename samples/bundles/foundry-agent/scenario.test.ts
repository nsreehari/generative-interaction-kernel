import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";

import { FOUNDRY_ACCESS_STORAGE_KEY } from "./access-storage";
import document from "./document.json";
import effects from "./effect_handlers/index";
import manifest from "./manifest.json";
import state from "./state.json";

function runtime() {
  return loadBundleRuntime(bundleFromJson({ manifest, document, state }, { effectHandlers: effects }));
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

  assert.equal(store.get("agent.key"), "access-key");
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
  assert.equal(store.get("agent.key"), "");
  assert.equal(store.get("agent.agentName"), "");
  assert.deepEqual(store.get("agent.agentOptions"), []);
  assert.equal(store.get("agent.conversationId"), "");
});
