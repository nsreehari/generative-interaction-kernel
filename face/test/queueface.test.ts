import assert from "node:assert/strict";
import { test } from "vitest";

import type { OrchestratorEffect } from "../../kernel/src/index";
import {
  QueueFace,
  type ServiceAdapter,
  type ServiceCatalogSnapshot,
} from "../src/index";

const catalog: ServiceCatalogSnapshot = {
  provider: { id: "test-provider", version: "1.0.0" },
  revision: "1",
  discoveredAt: "2026-07-19T00:00:00.000Z",
  capabilities: [{
    id: "analyze",
    operation: "analyze",
    version: "1.0.0",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    assurance: "declared-and-locally-validated",
    supports: { validate: true, simulate: true, cancel: true },
  }],
};

function createAdapter(execute: ServiceAdapter["execute"]): ServiceAdapter {
  return {
    provider: catalog.provider,
    discover: async () => catalog,
    validate: async (request) => ({ ok: request.input !== undefined }),
    simulate: async () => ({ output: { recommendation: "hold" } }),
    probe: async () => ({ ok: true }),
    execute,
  };
}

function bind(queueFace: QueueFace, mode: "immediate" | "queued" = "immediate"): void {
  queueFace.bind({
    service: "portfolio-intelligence",
    version: "1.0.0",
    operation: "analyze",
    providerId: "test-provider",
    capabilityId: "analyze",
    invoke: "analyzePortfolio",
    mode,
  });
}

test("registers, describes, and checks logical service requirements", async () => {
  const queueFace = new QueueFace();
  queueFace.registerAdapter(createAdapter(async () => ({ output: {} })));
  bind(queueFace);

  assert.deepEqual(queueFace.satisfies({
    "portfolio-intelligence": { version: "1.0.0", operations: ["analyze"] },
  }), { ok: true, missing: [], incompatible: [] });
  assert.equal(queueFace.satisfies({
    "portfolio-intelligence": { version: "2.0.0", operations: ["analyze", "rebalance"] },
  }).ok, false);

  const description = await queueFace.describeServices();
  assert.equal(description.providers[0].capabilities[0].id, "analyze");
  assert.equal(description.bindings[0].service, "portfolio-intelligence");
});

test("supports validation, simulation, probing, and immediate execution", async () => {
  const queueFace = new QueueFace({ idFactory: () => "request-1" });
  queueFace.registerAdapter(createAdapter(async (request) => ({
    output: { received: request.input ?? null },
  })));
  bind(queueFace);

  const input = { service: "portfolio-intelligence", operation: "analyze", input: { ticker: "MSFT" } };
  assert.deepEqual(await queueFace.validate(input), { ok: true });
  assert.deepEqual(await queueFace.simulate(input), { output: { recommendation: "hold" } });
  assert.deepEqual(await queueFace.probe("test-provider"), { ok: true });

  const record = await queueFace.submit(input);
  assert.equal(record.status, "completed");
  assert.deepEqual(record.result?.output, { received: { ticker: "MSFT" } });
  assert.equal((await queueFace.getRequest("request-1"))?.attempts, 1);
});

test("retries queued work and dead-letters it at the attempt limit", async () => {
  const queueFace = new QueueFace({ maxAttempts: 2, idFactory: () => "queued-1" });
  queueFace.registerAdapter(createAdapter(async () => { throw new Error("provider unavailable"); }));
  bind(queueFace, "queued");

  assert.equal((await queueFace.submit({
    service: "portfolio-intelligence",
    operation: "analyze",
  })).status, "accepted");
  assert.equal((await queueFace.runNext())?.status, "accepted");
  const terminal = await queueFace.runNext();
  assert.equal(terminal?.status, "dead-lettered");
  assert.equal(terminal?.attempts, 2);
  assert.equal(await queueFace.runNext(), undefined);
});

test("routes existing invoke effects through the bound service", async () => {
  const queueFace = new QueueFace({ idFactory: () => "invoke-1" });
  queueFace.registerAdapter(createAdapter(async () => ({
    orchestratorResult: { outcome: "analyzed", detail: { source: "service" } },
  })));
  bind(queueFace);

  const effect: OrchestratorEffect = {
    kind: "invoke",
    node: "portfolio",
    tool: "analyzePortfolio",
    args: { ticker: "MSFT" },
  };
  assert.deepEqual(await queueFace.createOrchestrator().invoke?.(effect), {
    outcome: "analyzed",
    detail: { source: "service" },
  });
});

test("cancels accepted queued requests without executing them", async () => {
  let executions = 0;
  const queueFace = new QueueFace({ idFactory: () => "cancel-1" });
  queueFace.registerAdapter(createAdapter(async () => {
    executions += 1;
    return { output: {} };
  }));
  bind(queueFace, "queued");

  await queueFace.submit({ service: "portfolio-intelligence", operation: "analyze" });
  assert.equal((await queueFace.cancel("cancel-1")).status, "cancelled");
  assert.equal((await queueFace.runNext())?.status, "cancelled");
  assert.equal(executions, 0);
});