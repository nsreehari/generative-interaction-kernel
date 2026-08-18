import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";

const capturedProps = vi.hoisted(() => ({
  scenariosJson: undefined as unknown,
  externalContext: undefined as unknown,
}));

vi.mock("@gik/demo-runner-host", () => ({
  GikDemoBlueprintHost: (props: { scenariosJson?: unknown; externalContext?: unknown }) => {
    capturedProps.scenariosJson = props.scenariosJson;
    capturedProps.externalContext = props.externalContext;
    return null;
  },
}));

import "fake-indexeddb/auto";
import type { BlueprintProposalReceipt } from "@gik/blueprint-agent-host";
import type { UseProposal } from "./runtime/blueprint-agent-lifecycle";
import { Host, createSampleBlueprintProposalStore } from "./Host";
import { getSampleBlueprintCatalog } from "../../../catalog/blueprint-catalog";
import { createBrowserBlueprintStorageConnectionFactory } from "./runtime/blueprint-storage";

const receipt = (id: string): BlueprintProposalReceipt<UseProposal> => ({
  id,
  proposal: {
    id: `proposal-${id}`,
    capability: "use-blueprint",
    target: { kind: "blueprint-instance", id: "incident-analysis-new-shell", instanceId: "default" },
    actions: [{ kind: "analyze-report", payload: { operation: "analyzeReportBlueprint" } }],
    createdAt: "2026-08-05T00:00:00.000Z",
  },
  actor: { id: "ai-agent" },
  status: "admitted",
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  audit: [],
});

test("sample host selects isolated memory or persistent IndexedDB proposal stores", async () => {
  const memory = createSampleBlueprintProposalStore({
    durableEnabled: false,
    blueprintId: "incident-analysis-new-shell",
  });

  await memory.create(receipt("memory"));
  const freshMemory = createSampleBlueprintProposalStore({
    durableEnabled: false,
    blueprintId: "incident-analysis-new-shell",
  });
  assert.equal(await freshMemory.get("memory"), undefined);

  const databaseName = `gik-host-test-${crypto.randomUUID()}`;
  const durable = createSampleBlueprintProposalStore({
    durableEnabled: true,
    blueprintId: "incident-analysis-new-shell",
    databaseName,
  });
  await durable.create(receipt("durable"));
  const reopened = createSampleBlueprintProposalStore({
    durableEnabled: true,
    blueprintId: "incident-analysis-new-shell",
    databaseName,
  });
  assert.deepEqual(await reopened.get("durable"), receipt("durable"));
});

test("sample host bootstraps isolated memory or persistent IndexedDB Blueprint storage", async () => {
  const instanceId = `incident-assets:${crypto.randomUUID()}`;
  const identity = { blueprintId: "incident-analysis-assets", instanceId };
  const request = {
    capability: "kv" as const,
    operation: "write" as const,
    args: ["asset:test", { persisted: true }],
  };

  const memory = createBrowserBlueprintStorageConnectionFactory(false)(identity);
  await memory.api.dispatch({ ...request, ref: memory.ref });
  const freshMemory = createBrowserBlueprintStorageConnectionFactory(false)(identity);
  assert.equal(await freshMemory.api.dispatch({
    ref: freshMemory.ref,
    capability: "kv",
    operation: "read",
    args: ["asset:test"],
  }), null);

  const durable = createBrowserBlueprintStorageConnectionFactory(true)(identity);
  await durable.api.dispatch({ ...request, ref: durable.ref });
  const reopened = createBrowserBlueprintStorageConnectionFactory(true)(identity);
  assert.deepEqual(await reopened.api.dispatch({
    ref: reopened.ref,
    capability: "kv",
    operation: "read",
    args: ["asset:test"],
  }), { persisted: true });
});

test("samples without demo scenarios do not receive them", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href: "https://example.test/?b=ai-agent&demo=1",
        search: "?b=ai-agent&demo=1",
      },
    },
  });

  try {
    renderToStaticMarkup(React.createElement(Host));
    assert.equal(capturedProps.scenariosJson, undefined);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("portfolio tracker uses Blueprint-authored launch defaults", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href: "https://example.test/?b=portfolio-tracker-new&gik=1",
        search: "?b=portfolio-tracker-new&gik=1",
      },
    },
  });

  try {
    renderToStaticMarkup(React.createElement(Host));
    assert.deepEqual(capturedProps.scenariosJson, getSampleBlueprintCatalog().demoScenarios["portfolio-tracker-new"]);
    assert.deepEqual(capturedProps.externalContext, {
      ai: "foundry",
      "intelligence-model": "simple",
      "market-prices": "mock",
      view: "desktop",
    });
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});