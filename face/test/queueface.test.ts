import assert from "node:assert/strict";
import { test } from "vitest";

import { InMemoryStateModel, JsonataExpressionProvider, type ServiceDeclaration } from "../../kernel/src/index";
import {
  DefaultServiceHost,
  QueueFace,
  ServiceKindRegistry,
  type ServiceAdapter,
  type ServiceExecutionResult,
} from "../src/index";

function createHost(
  execute: ServiceAdapter["execute"],
  operation: Partial<ServiceDeclaration["operations"][string]> = {},
  options: { maxAttempts?: number; maxGuardrailAttempts?: number } = {}
): DefaultServiceHost {
  const registry = new ServiceKindRegistry();
  registry.register({
    manifest: {
      id: "deterministic-agent",
      version: "1",
      configSchema: {},
      executionModes: ["immediate", "queued"],
      subjects: ["cell"],
      supports: { probe: true, simulate: true, cancel: true },
    },
    create: () => ({
      provider: { id: "deterministic:test", version: "1" },
      discover: async () => ({ provider: { id: "deterministic:test", version: "1" }, revision: "1", discoveredAt: "now", capabilities: [] }),
      validate: async (request) => ({ ok: request.input !== undefined }),
      simulate: async () => ({ output: { recommendation: "hold" } }),
      probe: async () => ({ ok: true }),
      execute,
    }),
  });
  const declarations: Record<string, ServiceDeclaration> = {
    analysis: {
      kind: "deterministic-agent",
      version: "1",
      operations: {
        analyzePortfolio: {
          operation: "analyze",
          contract: "portfolio-analysis/v1",
          request: { transform: { kind: "jsonata", expr: "effect.args" } },
          settlement: { transform: { kind: "jsonata", expr: "{'ops':[{'op':'set','path':'work.answer','value':response}]}" } },
          ...operation,
        },
      },
    },
  };
  return new DefaultServiceHost({
    blueprintId: "portfolio",
    blueprintRevision: "1",
    declarations,
    registry,
    state: new InMemoryStateModel(["work"]),
    expression: new JsonataExpressionProvider({ safe: true }),
    idFactory: () => "request-1",
    ...options,
  });
}

const effect = { kind: "invoke" as const, node: "portfolio", tool: "analyzePortfolio", args: { ticker: "MSFT" }, actorId: "author" };

test("QueueFace delegates queued lifecycle to the shared host", async () => {
  const host = createHost(async (request) => ({ output: request.input }), { mode: "queued" });
  const queue = new QueueFace(host);
  const accepted = await queue.submit(effect);
  assert.equal(accepted.status, "accepted");
  assert.deepEqual(accepted.request.input, { ticker: "MSFT" });
  assert.equal((await host.runNext())?.status, "completed");
  assert.equal((await queue.getRequest("request-1"))?.attempts, 1);
});

test("host executes immediate operations and owns declarative settlement", async () => {
  const host = createHost(async (request) => ({ output: request.input }));
  assert.deepEqual(await host.invoke(effect), { ops: [{ op: "set", path: "work.answer", value: { ticker: "MSFT" } }] });
});

test("host validates provider output and retries within its ceiling", async () => {
  let calls = 0;
  const host = createHost(async (): Promise<ServiceExecutionResult> => {
    calls += 1;
    return { output: { weight: calls < 2 ? 1.4 : 0.9 } };
  }, {
    response: { validators: [{ kind: "jsonata", expr: "data.weight <= 1", message: "weight must not exceed 1" }] },
    onViolation: { action: "retry", maxAttempts: 5 },
  }, { maxGuardrailAttempts: 2 });
  await host.invoke(effect);
  assert.equal(calls, 2);
  assert.equal((await host.listRequests())[0]?.guardrailAttempts, 1);
});

test("host dead-letters queued transport failures at the configured limit", async () => {
  const host = createHost(async () => { throw new Error("provider unavailable"); }, { mode: "queued" }, { maxAttempts: 2 });
  const queue = new QueueFace(host);
  await queue.submit(effect);
  assert.equal((await host.runNext())?.status, "accepted");
  const terminal = await host.runNext();
  assert.equal(terminal?.status, "dead-lettered");
  assert.equal(terminal?.attempts, 2);
});

test("QueueFace cancellation prevents accepted work from executing", async () => {
  let executions = 0;
  const host = createHost(async () => { executions += 1; return { output: {} }; }, { mode: "queued" });
  const queue = new QueueFace(host);
  await queue.submit(effect);
  assert.equal((await queue.cancel("request-1")).status, "cancelled");
  assert.equal((await host.runNext())?.status, "cancelled");
  assert.equal(executions, 0);
});
