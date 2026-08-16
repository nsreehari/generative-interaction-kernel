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

const receipt = (id: string): BlueprintProposalReceipt<UseProposal> => ({
  id,
  proposal: {
    id: `proposal-${id}`,
    capability: "use-blueprint",
    target: { kind: "blueprint-instance", id: "incident-report-explorer-1a", instanceId: "default" },
    actions: [{ kind: "improve-report", payload: { operation: "improveReport" } }],
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
    blueprintId: "incident-report-explorer-1a",
  });
  await memory.create(receipt("memory"));
  const freshMemory = createSampleBlueprintProposalStore({
    durableEnabled: false,
    blueprintId: "incident-report-explorer-1a",
  });
  assert.equal(await freshMemory.get("memory"), undefined);

  const databaseName = `gik-host-test-${crypto.randomUUID()}`;
  const durable = createSampleBlueprintProposalStore({
    durableEnabled: true,
    blueprintId: "incident-report-explorer-1a",
    databaseName,
  });
  await durable.create(receipt("durable"));
  const reopened = createSampleBlueprintProposalStore({
    durableEnabled: true,
    blueprintId: "incident-report-explorer-1a",
    databaseName,
  });
  assert.deepEqual(await reopened.get("durable"), receipt("durable"));
});

test("unmigrated samples do not receive legacy demo scenarios", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        href: "https://example.test/?b=live-workspace-soc&demo=1",
        search: "?b=live-workspace-soc&demo=1",
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
    assert.deepEqual(capturedProps.externalContext, { "intelligence-model": "simple", view: "desktop" });
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});