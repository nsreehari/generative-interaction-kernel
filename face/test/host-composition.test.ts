import { test, expect } from "vitest";
import { createMemoryStorage } from "../../packages/durable-runtime/src/storage/memory";
import { createMemoryStorageRef } from "../../packages/durable-runtime/src/storage/memory/api";
import { openServiceSettings } from "../src/services/settings";
import { createServiceSetupController } from "../src/services/setup";
import { ServiceKindRegistry, type ServiceDependencyStatus } from "../src/services/service-kinds";
import { InMemoryStateModel, type NativeServiceDeclaration } from "../../kernel/src/index";
import { createServiceOrchestrator } from "../src/services/orchestrator";

const declaration: NativeServiceDeclaration = {
  kind: "feed", version: "1", config: { endpoint: "feed" },
  operations: { read: { operation: "get", contract: "feed/v1", request: { transform: { kind: "jsonata", expr: "input" } },
    settlement: { transform: { kind: "jsonata", expr: "{'ops':[]}" } } } },
};

test("settings stage separately, reject stale writers, resume and inspect a lost commit reply", async () => {
  const provider = createMemoryStorage();
  const ref = createMemoryStorageRef("settings");
  const options = { provider, refs: { stateRef: ref, journalRef: ref, effectsQueueRef: ref }, runtimeId: "sample-settings",
    validate: async () => {} };
  const first = await openServiceSettings(options);
  const second = await openServiceSettings(options);
  const saved = await first.save("feed", { endpoint: "new" }, 0);
  expect(saved.activeConfigurations).toEqual({});
  await expect(second.save("feed", { endpoint: "stale" }, 0)).rejects.toMatchObject({ code: "SERVICE_SETTINGS_CHANGED" });
  const applied = await first.apply(1);
  expect(applied.activeConfigurations).toEqual({ feed: { endpoint: "new" } });
  const original = provider.commitTransition.bind(provider);
  provider.commitTransition = async request => { await original(request); throw new Error("reply lost"); };
  await expect(first.save("feed", { endpoint: "later" }, 2)).rejects.toMatchObject({ code: "SERVICE_SETTINGS_UNCERTAIN" });
  await expect(first.apply(3)).rejects.toMatchObject({ code: "SERVICE_SETTINGS_UNCERTAIN" });
  expect((await first.read()).generation).toBe(3);
  provider.commitTransition = original;
  expect((await (await openServiceSettings(options)).read()).activeConfigurations).toEqual({ feed: { endpoint: "new" } });
  expect((await first.apply(3)).activeConfigurations).toEqual({ feed: { endpoint: "later" } });
});

test("invalid settings never commit and release their transition lease", async () => {
  const provider = createMemoryStorage(), ref = createMemoryStorageRef("invalid-settings");
  const settings = await openServiceSettings({ provider, refs: { stateRef: ref, journalRef: ref, effectsQueueRef: ref }, runtimeId: "settings",
    validate: async configs => { if (configs.feed?.endpoint === "invalid") throw new Error("Invalid endpoint"); } });
  await expect(settings.save("feed", { endpoint: "invalid" }, 0)).rejects.toThrow("Invalid endpoint");
  expect((await settings.read()).generation).toBe(0);
  expect((await settings.save("feed", { endpoint: "valid" }, 0)).generation).toBe(1);
});

test("setup reports do not materialize adapters and actions require fresh dependency admission", async () => {
  let created = 0, called = 0;
  let status: ServiceDependencyStatus = { state: "authorization-required", message: "Authorize feed",
    actions: [{ id: "feed.connect", title: "Connect", inputSchema: { type: "object", required: ["approved"], properties: { approved: { const: true } } } }] };
  const registry = new ServiceKindRegistry({ inspectDependency: () => status });
  registry.register({
    manifest: { id: "feed", version: "1", configSchema: { type: "object", properties: { endpoint: { const: "feed" } }, required: ["endpoint"] },
      executionModes: ["immediate"], subjects: ["cell"] },
    describeDependencies: () => [{ id: "account", kind: "credential", title: "Feed Account" }],
    create: () => { created++; throw new Error("Must not materialize during setup"); },
  });
  const controller = createServiceSetupController({ blueprintId: "reader", blueprintRevision: "1", declarations: { feed: declaration }, registry,
    actions: { "feed.connect": async () => { called++; } } });
  expect((await controller.describe())[0].setup.ready).toBe(false);
  await expect(controller.action("feed", "account", "feed.connect", {}, new AbortController().signal)).rejects.toThrow();
  await controller.action("feed", "account", "feed.connect", { approved: true }, new AbortController().signal);
  expect(called).toBe(1);
  status = { state: "ready" };
  await expect(controller.action("feed", "account", "feed.connect", { approved: true }, new AbortController().signal)).rejects.toThrow("not currently");
  expect(created).toBe(0);
});

test("service routing uses declaration identity rather than ambiguous operation names", async () => {
  let called = 0, fallback = 0;
  const orchestrator = createServiceOrchestrator({
    declarations: { feed: declaration }, state: new InMemoryStateModel(),
    host: { invoke: async () => { called++; return { outcome: "completed" }; } },
    fallback: { invoke: async () => { fallback++; } },
  });
  const control = { id: "1", signal: new AbortController().signal, emit: async () => {}, emitProgress: async () => {} };
  await orchestrator.invoke!({ kind: "invoke", node: "source", data: {}, control: { serviceRef: "feed", tool: "read" } }, control);
  await orchestrator.invoke!({ kind: "invoke", node: "source", data: {}, control: { serviceRef: "other", tool: "read" } }, control);
  expect([called, fallback]).toEqual([1, 1]);
});
