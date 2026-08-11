import assert from "node:assert/strict";
import { test } from "vitest";

import { createSampleServiceKindRegistry } from "../apps/service-kinds";

test("explicit sample catalog registers every admitted kind", () => {
  const registry = createSampleServiceKindRegistry();
  assert.deepEqual(
    registry.describe().map(({ manifest }) => manifest.id).sort(),
    ["copilot-agent", "deterministic-agent", "foundry-agent", "http-service", "mcp"]
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