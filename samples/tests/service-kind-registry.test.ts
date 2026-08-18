import assert from "node:assert/strict";
import { test } from "vitest";

import { createSampleServiceKindRegistry } from "../service-kinds";

test("explicit sample catalog registers every admitted kind", () => {
  const registry = createSampleServiceKindRegistry();
  assert.deepEqual(
    registry.describe().map(({ manifest }) => manifest.id).sort(),
    ["copilot-agent", "deterministic-agent", "durable-storage", "foundry-agent", "http-service", "mcp"]
  );
});

test("worker service kinds remain visible but unavailable without host executors", () => {
  const descriptions = createSampleServiceKindRegistry().describe();
  assert.equal(descriptions.find(({ manifest }) => manifest.id === "deterministic-agent")?.available, true);
  assert.equal(descriptions.find(({ manifest }) => manifest.id === "foundry-agent")?.available, false);
  assert.deepEqual(
    descriptions.find(({ manifest }) => manifest.id === "copilot-agent")?.missingHostCapabilities,
    ["copilot-executor", "workspace-resolver"]
  );
});

test("Foundry declarations require host-authorized endpoints", async () => {
  const registry = createSampleServiceKindRegistry({
    hostCapabilities: ["foundry-executor", "credential-resolver"],
    resolveCredential: async () => "resolved-by-host",
    authorizeEndpoint: () => false,
  });
  const report = await registry.validate({
    kind: "foundry-agent",
    version: "1",
    operations: {
      chat: {
        operation: "chat",
        contract: "chat/v1",
        settlement: { transform: { kind: "jsonata", expr: "{'outcome':'completed'}" } },
      },
    },
    config: {
      endpoint: "https://untrusted.example",
      agent: "Agent One",
      credentialRef: "foundry/access",
    },
  });

  assert.equal(report.ok, false);
  assert.match(report.errors?.join(" ") ?? "", /not authorized/);
});

test("Copilot declarations accept named agents and JSON responses", async () => {
  const registry = createSampleServiceKindRegistry({
    hostCapabilities: ["copilot-executor", "workspace-resolver"],
    execute: async () => ({}),
  });
  const report = await registry.validate({
    kind: "copilot-agent",
    version: "1",
    operations: {
      requestIntelligence: {
        operation: "chat",
        contract: "portfolio-intelligence/v1",
        settlement: { transform: { kind: "jsonata", expr: "{'outcome':'completed'}" } },
      },
    },
    config: {
      server: "http://127.0.0.1:7801/mcp",
      model: "gpt-5.4",
      workspaceRef: ".copilot-workspace",
      agent: "Portfolio-Intelligence-Agent",
      responseMode: "json",
    },
  });

  assert.deepEqual(report, { ok: true });
});