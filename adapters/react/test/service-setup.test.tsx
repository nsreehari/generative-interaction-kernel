import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { test, expect } from "vitest";
import { useServiceSetup, ServiceSetupPanel, type ServiceSetupClient } from "../src/service-setup";
import { createProjectionProviderRegistry, type ProjectionView } from "../src/registry";

test("setup discards late target results and does not repeat an uncertain Apply", async () => {
  const empty = { generation: 0, configurations: {}, activeConfigurations: {}, applied: [] };
  let release!: () => void, applied = 0, applyCalls = 0;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const first: ServiceSetupClient = {
    load: async () => { await blocked; return empty; }, inspect: async () => [],
    save: async () => empty, apply: async () => { applyCalls++; throw new Error("Uncertain write"); },
    action: async () => {}, onApplied: () => { applied++; },
  };
  const second: ServiceSetupClient = { ...first, load: async () => ({ ...empty, generation: 4 }) };
  let model!: ReturnType<typeof useServiceSetup>;
  function Host({ client, target }: { client: ServiceSetupClient; target: string }) {
    model = useServiceSetup(client, target);
    return <ServiceSetupPanel model={model} editable={() => true} />;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<Host client={first} target="one" />); });
  try {
    expect(model.ready).toBe(false);
    await act(async () => { renderer.update(<Host client={second} target="two" />); });
    expect(model.ready).toBe(true);
    await act(async () => { release(); await blocked; });
    expect(model.ready).toBe(true);
    await act(async () => { await model.apply(); });
    expect(applied).toBe(0);
    expect(applyCalls).toBe(1);
    expect(model.ready).toBe(false);
    expect(model.error).toBe("Uncertain write");
    await expect(model.apply()).rejects.toThrow("not ready");
    expect(applyCalls).toBe(1);
  } finally { await act(async () => renderer.unmount()); }
});

test("projection composition retains sibling contributions within a named provider", () => {
  const One: ProjectionView = () => null, Two: ProjectionView = () => null;
  const registry = createProjectionProviderRegistry([
    { id: "shared", views: { one: One }, capabilities: {} },
    { id: "shared", views: { two: Two }, capabilities: {} },
  ]);
  expect(registry.resolveViews("shared")).toEqual({ one: One, two: Two });
  expect(registry.resolveViews("unregistered")).toBeUndefined();
});

test("Save And Apply uses the confirmed staged generation and preserves independent staging", async () => {
  const config = { interval: 60 };
  const empty = { generation: 2, configurations: { timer: config }, activeConfigurations: {}, applied: [] };
  const calls: string[] = [];
  const client: ServiceSetupClient = {
    load: async () => empty,
    inspect: async configurations => [{
      id: "timer", config: configurations.timer,
      provider: { id: "timer", version: "1", configSchema: {}, subjects: [], executionModes: [] },
      setup: { identity: { blueprintId: "test", blueprintRevision: "1", serviceId: "timer" },
        kind: "timer", ready: true, validation: { ok: true }, dependencies: [] },
    }],
    save: async (_id, config, generation) => {
      calls.push(`save:${generation}`);
      return { ...empty, generation: generation + 1, configurations: { timer: config } };
    },
    apply: async generation => {
      calls.push(`apply:${generation}`);
      return { ...empty, generation: generation + 1, activeConfigurations: { timer: config } };
    },
    action: async () => {},
    onApplied: configurations => { expect(configurations).toEqual({ timer: config }); calls.push("activated"); },
  };
  let model!: ReturnType<typeof useServiceSetup>;
  function Host() { model = useServiceSetup(client, "target"); return <ServiceSetupPanel model={model} editable={() => true} saveMode="apply" />; }
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<Host />); });
  try {
    await act(async () => { await model.saveAndApply("timer"); });
    expect(calls).toEqual(["save:2", "apply:3", "activated"]);
    expect(model.status).toBe("Settings saved and applied.");
    calls.length = 0;
    await act(async () => { await model.save("timer"); });
    expect(calls).toEqual(["save:4"]);
  } finally { await act(async () => renderer.unmount()); }
});

test("Save And Apply never applies a failed Save or retries an uncertain Apply", async () => {
  for (const failAt of ["save", "apply"]) {
    const calls: string[] = [];
    const empty = { generation: 0, configurations: { service: { value: "test" } }, activeConfigurations: {}, applied: [] };
    const client: ServiceSetupClient = {
      load: async () => empty,
      inspect: async configurations => [{
        id: "service", config: configurations.service,
        provider: { id: "service", version: "1", configSchema: {}, subjects: [], executionModes: [] },
        setup: { identity: { blueprintId: "test", blueprintRevision: "1", serviceId: "service" },
          kind: "service", ready: true, validation: { ok: true }, dependencies: [] },
      }],
      save: async () => {
        calls.push("save");
        if (failAt === "save") throw new Error("Uncertain Save");
        return { ...empty, generation: 1 };
      },
      apply: async () => { calls.push("apply"); throw new Error("Uncertain Apply"); },
      action: async () => {},
      onApplied: () => { throw new Error("Unconfirmed configuration must not activate."); },
    };
    let model!: ReturnType<typeof useServiceSetup>;
    function Host() { model = useServiceSetup(client, "target"); return null; }
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Host />); });
    try {
      await act(async () => { await model.saveAndApply("service"); });
      expect(calls).toEqual(failAt === "save" ? ["save"] : ["save", "apply"]);
      expect(model.ready).toBe(false);
      await expect(model.saveAndApply("service")).rejects.toThrow("not ready");
      expect(calls).toHaveLength(failAt === "save" ? 1 : 2);
    } finally { await act(async () => renderer.unmount()); }
  }
});
