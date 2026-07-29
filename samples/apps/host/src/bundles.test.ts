import assert from "node:assert/strict";
import { test } from "vitest";
import { unwrap } from "@gik/kernel";
import { loadBundleRuntime, seedState } from "@gik/react";

import { createHostRegistry, DEFAULT_BLUEPRINT, resolveBundleProjectionViews } from "./bundles";
import { copilotC2StateStorageKey } from "../../../bundles/copilot-c2/effect_handlers";
import { openSampleBlueprint } from "../../../shared/blueprints";
import { createBlueprintServiceHost } from "../../../shared/service-runtime";

test("host registry exposes only approved Blueprints to the switcher", () => {
  const registry = createHostRegistry();

  assert.equal(DEFAULT_BLUEPRINT, "samples-overview");
  assert.equal(registry.has("samples-overview"), true);
  assert.equal(registry.has("manage-blueprints"), true);
  assert.equal(registry.has("manage-bundles"), true);
  assert.equal(registry.has("copilot-c2"), true);
  assert.equal(registry.has("foundry-agent"), true);
  assert.equal(registry.has("foundry-agent-no-cells"), true);
  assert.equal(registry.has("live-workspace-soc"), true);
  assert.equal(registry.has("portfolio-tracker"), true);
  assert.equal(registry.has("vocabulary-lowering"), true);
  assert.deepEqual(
    [...registry.ids({ listable: true })].sort(),
    ["copilot-c2", "foundry-agent", "foundry-agent-no-cells", "live-workspace-soc", "manage-blueprints", "manage-bundles", "portfolio-tracker", "portfolio-tracker-2tiers", "samples-overview", "vocabulary-lowering"]
  );
  assert.equal(registry.has("reactive-demo"), false);
  assert.equal(registry.has("provider-authoring-demo"), false);
});

test("host registry keeps playground embed-only instead of switcher-visible", () => {
  const registry = createHostRegistry();

  assert.equal(registry.has("playground"), true);
  assert.equal(registry.ids({ listable: true }).includes("playground"), false);
  assert.equal(registry.ids().includes("playground"), true);
});

test("host registry hydrates and persists durable copilot-c2 state only", () => {
  const values = new Map<string, string>([[
    copilotC2StateStorageKey,
    JSON.stringify({
      copilotC2: {
        mcpServer: "https://mcp.example.test/mcp",
        workingDir: "C:/work/demo",
        model: "gpt-5.4",
        agents: [{ id: "reviewer", name: "Reviewer" }],
        runs: [{ id: "run-1", status: "completed" }],
        selectedRunId: "run-1",
        currentRun: { id: "run-1", status: "completed", stdout: "Done" },
        view: "agent",
        runStatus: "stale status",
      },
    }),
  ]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  try {
    const entry = createHostRegistry().get("copilot-c2");
    if (!entry || entry.kind !== "bundle") throw new Error("copilot-c2 bundle is unavailable");
    const bundle = entry.make();
    const hydrated = bundle.state?.copilotC2 as Record<string, unknown>;
    assert.equal(hydrated.mcpServer, "https://mcp.example.test/mcp");
    assert.equal(hydrated.workingDir, "C:/work/demo");
    assert.deepEqual(hydrated.agents, [{ id: "reviewer", name: "Reviewer" }]);
    assert.equal(hydrated.view, "dashboard");
    assert.equal(hydrated.runStatus, "No Copilot run selected.");

    const runtime = loadBundleRuntime(bundle);
    runtime.state.apply([{ op: "set", path: "copilotC2.model", value: "gpt-5.5" }]);
    const afterDurableChange = values.get(copilotC2StateStorageKey) ?? "";
    const persisted = JSON.parse(afterDurableChange);
    assert.equal(persisted.copilotC2.mcpServer, "https://mcp.example.test/mcp");
    assert.equal(persisted.copilotC2.model, "gpt-5.5");
    assert.equal(persisted.copilotC2.view, undefined);
    assert.equal(persisted.copilotC2.runStatus, undefined);

    runtime.state.apply([{ op: "set", path: "copilotC2.runStatus", value: "Running" }]);
    assert.equal(values.get(copilotC2StateStorageKey), afterDurableChange);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("host projection imports can resolve another bundle by id", () => {
  const copilotViews = resolveBundleProjectionViews("copilot-c2");
  assert.equal(typeof copilotViews?.workspace, "function");
  assert.equal(typeof copilotViews?.["agent-activity-board"], "function");
  assert.equal(typeof copilotViews?.["run-console"], "function");
  const foundryProviderViews = resolveBundleProjectionViews("foundry");
  assert.equal(typeof foundryProviderViews?.["access-gate"], "function");
  const foundryViews = resolveBundleProjectionViews("foundry-agent");
  assert.equal(foundryViews?.["access-modal"], undefined);
  assert.equal(typeof foundryViews?.["agent-selector"], "function");
  const fluentViews = resolveBundleProjectionViews("fluent");
  assert.equal(typeof fluentViews?.dropdown, "function");
  assert.equal(typeof fluentViews?.switch, "function");
  assert.equal(typeof fluentViews?.toggle, "function");
  assert.equal(resolveBundleProjectionViews("missing-bundle"), undefined);
});

test("copilot-c2 opens as a declarative MCP-backed Blueprint", () => {
  const runtime = openSampleBlueprint("copilot-c2");
  const services = unwrap(runtime.vocabulary).externals?.services as Record<string, {
    kind?: string;
    config?: Record<string, unknown>;
  }>;

  assert.equal(runtime.blueprintId, "copilot-c2");
  assert.equal(Object.keys(services).length, 8);
  assert.deepEqual(
    Object.values(services).map((service) => service.kind),
    ["mcp", "mcp", "mcp", "mcp", "mcp", "mcp", "mcp", "mcp"]
  );
  assert.deepEqual(
    Object.values(services).map((service) => service.config?.serverStatePath),
    Array(8).fill("copilotC2.mcpServer")
  );
});

test("copilot-c2 resolves its editable MCP server before execution", async () => {
  const runtime = openSampleBlueprint("copilot-c2");
  const state = seedState(runtime.vocabulary as Parameters<typeof seedState>[0], runtime.state);
  state.apply([{ op: "set", path: "copilotC2.mcpServer", value: "https://mcp.example.test/mcp" }]);
  let invocation: unknown;
  const serviceHost = createBlueprintServiceHost(runtime, state, {
    hostCapabilities: ["mcp-executor"],
    execute: async (request) => {
      invocation = request;
      return { text: "No agents found.", structured: { agents: [] } };
    },
  });

  await serviceHost.invoke({
    kind: "invoke",
    node: "copilot-c2-discover-agents",
    tool: "refreshEnvironment",
    args: {},
  });

  const declaration = (invocation as { declaration: { config: Record<string, unknown> } }).declaration;
  assert.equal(declaration.config.server, "https://mcp.example.test/mcp");
});
