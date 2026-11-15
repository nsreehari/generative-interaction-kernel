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
