import assert from "node:assert/strict";
import { test } from "vitest";
import { unwrap } from "@gik/kernel";
import { bundleFromJson, loadBundleRuntime, seedState } from "@gik/react";
import { fluentComponentViews } from "@gik/components/fluent";
import { primitiveComponentViews } from "@gik/components/primitives";
import { semanticComponentViews } from "@gik/components/semantic";
import { securityComponentViews } from "@gik/components/security";
import { softwareComponentViews } from "@gik/components/software";

import { copilotC2StateStorageKey } from "../../../../blueprints/copilot-c2/native/effect_handlers/copilotC2EffectHandlers";
import { openSampleBlueprint } from "../../../../catalog/blueprint-catalog";
import { resolveProjectionViews } from "./provider-registry";
import { resolveBlueprintInitialContext, resolveBlueprintNative } from "./sample-bundles";
import { createBlueprintServiceHost } from "./service-host";

test("production native resolution hydrates and persists durable copilot-c2 state only", () => {
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
    const blueprintRuntime = openSampleBlueprint("copilot-c2");
    const context = resolveBlueprintInitialContext("copilot-c2");
    const state = context.initialSeed as Record<string, unknown>;
    const hydrated = state.copilotC2 as Record<string, unknown>;
    assert.equal(hydrated.mcpServer, "https://mcp.example.test/mcp");
    assert.equal(hydrated.workingDir, "C:/work/demo");
    assert.deepEqual(hydrated.agents, [{ id: "reviewer", name: "Reviewer" }]);
    assert.equal(hydrated.view, "dashboard");
    assert.equal(hydrated.runStatus, "No Copilot run selected.");

    const bundle = bundleFromJson({
      vocabulary: blueprintRuntime.vocabulary,
      program: blueprintRuntime.program,
      state,
    }, resolveBlueprintNative("copilot-c2"));
    const bundleRuntime = loadBundleRuntime(bundle);
    bundleRuntime.state.apply([{ op: "set", path: "copilotC2.model", value: "gpt-5.5" }]);
    const afterDurableChange = values.get(copilotC2StateStorageKey) ?? "";
    const persisted = JSON.parse(afterDurableChange);
    assert.equal(persisted.copilotC2.mcpServer, "https://mcp.example.test/mcp");
    assert.equal(persisted.copilotC2.model, "gpt-5.5");
    assert.equal(persisted.copilotC2.view, undefined);
    assert.equal(persisted.copilotC2.runStatus, undefined);

    bundleRuntime.state.apply([{ op: "set", path: "copilotC2.runStatus", value: "Running" }]);
    assert.equal(values.get(copilotC2StateStorageKey), afterDurableChange);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("shared projection imports resolve package and Blueprint providers", () => {
  const copilotViews = resolveProjectionViews("copilot-c2");
  assert.equal(typeof copilotViews?.workspace, "function");
  assert.equal(typeof copilotViews?.["agent-activity-board"], "function");
  assert.equal(typeof copilotViews?.["run-console"], "function");
  const hostViews = resolveProjectionViews("host");
  assert.equal(typeof hostViews?.["credential-access"], "function");
  assert.equal(resolveProjectionViews("foundry"), undefined);
  assert.equal(resolveProjectionViews("http-proxy"), undefined);
  assert.equal(resolveProjectionViews("ai-agent"), undefined);
  const fluentViews = resolveProjectionViews("fluent");
  assert.deepEqual(Object.keys(fluentViews ?? {}).sort(), Object.keys(fluentComponentViews).sort());
  assert.equal(typeof fluentViews?.dropdown, "function");
  assert.equal(typeof fluentViews?.switch, "function");
  assert.equal(typeof fluentViews?.toggle, "function");
  const primitiveViews = resolveProjectionViews("primitive");
  assert.deepEqual(Object.keys(primitiveViews ?? {}).sort(), Object.keys(primitiveComponentViews).sort());
  assert.equal(typeof primitiveViews?.chart, "function");
  assert.equal(typeof primitiveViews?.["growing-container"], "function");
  const semanticViews = resolveProjectionViews("semantic");
  assert.deepEqual(Object.keys(semanticViews ?? {}).sort(), Object.keys(semanticComponentViews).sort());
  assert.equal(typeof semanticViews?.["event-series"], "function");
  assert.equal(typeof semanticViews?.["relationship-set"], "function");
  assert.equal(semanticViews?.["component-data-sections"], undefined);
  assert.equal(resolveProjectionViews("incident-report-explorer-1a"), undefined);
  assert.deepEqual(Object.keys(resolveProjectionViews("security") ?? {}).sort(), Object.keys(securityComponentViews).sort());
  assert.deepEqual(Object.keys(resolveProjectionViews("software") ?? {}).sort(), Object.keys(softwareComponentViews).sort());
  assert.equal(resolveProjectionViews("provider-authoring-demo"), undefined);
  assert.equal(resolveProjectionViews("reactive-demo"), undefined);
  assert.equal(resolveProjectionViews("missing-bundle"), undefined);
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
    control: { tool: "refreshEnvironment" },
    data: {},
  });

  const declaration = (invocation as { declaration: { config: Record<string, unknown> } }).declaration;
  assert.equal(declaration.config.server, "https://mcp.example.test/mcp");
});