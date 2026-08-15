import assert from "node:assert/strict";
import { test } from "vitest";

import { InMemoryStateModel, JsonataExpressionProvider, type ServiceDeclaration } from "../../kernel/src/index";
import {
  DefaultServiceHost,
  QueueFace,
  ServiceKindRegistry,
  UnsatisfiedServiceDependencyError,
  type ServiceAdapter,
  type ServiceAgentTool,
  type ServiceExecutionResult,
} from "../src/index";

function createHost(
  execute: ServiceAdapter["execute"],
  operation: Partial<ServiceDeclaration["operations"][string]> = {},
  options: {
    maxAttempts?: number;
    maxGuardrailAttempts?: number;
    agentTools?: readonly ServiceAgentTool[];
    dependencyFailurePolicy?: "settle" | "throw";
  } = {}
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
          request: { transform: { kind: "jsonata", expr: "effect.data" } },
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

const effect = {
  kind: "invoke" as const,
  node: "portfolio",
  control: { tool: "analyzePortfolio" },
  data: { ticker: "MSFT" },
  actorId: "author",
};

test("host rejects non-agent tools at the provider boundary", () => {
  assert.throws(() => createHost(async () => ({ output: null }), {}, {
    agentTools: [{
      name: "host_blueprint_apply",
      description: "Apply a proposal.",
      inputSchema: { type: "object" },
      lifecycle: "host",
      handler: () => ({ status: "applied" }),
    }],
  }), /cannot execute with agent authority/);
});

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

test("host returns operation output without service settlement for Cell sources", async () => {
  const host = createHost(async (request) => ({ output: { analysis: request.input ?? null, providerMetadata: "raw" } }));
  assert.deepEqual(await host.invoke({
    ...effect,
    control: { ...effect.control, sourceId: "analysis.source", sourceCellId: "analysis" },
  }), {
    sourceOutput: { analysis: { ticker: "MSFT" }, providerMetadata: "raw" },
  });
});

test("host settles service responses directly to graph output ports", async () => {
  const host = createHost(async (request) => ({ output: request.input }), {
    settlement: { transform: { kind: "jsonata", expr: "{'outputs':{'analysis_envelope':response}}" } },
  });
  assert.deepEqual(await host.invoke(effect), {
    outputs: { analysis_envelope: { ticker: "MSFT" } },
  });
});

test("host resolves Blueprint-backed services outside the native kind registry", async () => {
  const registry = new ServiceKindRegistry();
  const resolved: string[] = [];
  const host = new DefaultServiceHost({
    blueprintId: "portfolio",
    blueprintRevision: "1",
    declarations: {
      analysis: {
        blueprint: { $ref: "blueprint:portfolio-analysis@1.0.0" },
        version: "1",
        operations: {
          analyzePortfolio: {
            operation: "analyze",
            contract: "portfolio-analysis/v1",
            request: { transform: { kind: "jsonata", expr: "effect.data" } },
            settlement: { transform: { kind: "jsonata", expr: "{'ops':[{'op':'set','path':'work.answer','value':response}] }" } },
          },
        },
      },
    },
    registry,
    blueprintServices: {
      materialize(identity, declaration) {
        resolved.push(`${identity.serviceId}:${declaration.blueprint.$ref}`);
        return {
          provider: { id: declaration.blueprint.$ref, version: declaration.version },
          discover: async () => ({ provider: { id: declaration.blueprint.$ref, version: declaration.version }, revision: "1", discoveredAt: "now", capabilities: [] }),
          execute: async (request) => ({ output: request.input }),
        };
      },
    },
    state: new InMemoryStateModel(["work"]),
    expression: new JsonataExpressionProvider({ safe: true }),
    idFactory: () => "blueprint-request-1",
  });

  assert.deepEqual(await host.invoke(effect), {
    ops: [{ op: "set", path: "work.answer", value: { ticker: "MSFT" } }],
  });
  assert.ok(resolved.length > 0);
  assert.deepEqual([...new Set(resolved)], ["analysis:blueprint:portfolio-analysis@1.0.0"]);
});

test("host applies declarative failure settlement with structured error detail", async () => {
  const unavailable = Object.assign(new Error("provider unavailable"), { status: 503 });
  const host = createHost(async () => { throw unavailable; }, {
    failureSettlement: {
      transform: { kind: "jsonata", expr: "{'ops':[{'op':'set','path':'work.error','value':error.message}],'detail':{'status':error.status}}" },
    },
  });
  assert.deepEqual(await host.invoke(effect), {
    ops: [{ op: "set", path: "work.error", value: "provider unavailable" }],
    detail: { status: 503 },
  });
});

test("host settles unsatisfied service dependencies and records structured failure detail", async () => {
  const host = createHost(async () => {
    throw new UnsatisfiedServiceDependencyError(
      "Credential is required",
      { kind: "credential", ref: "provider/access-key" },
    );
  }, {
    failureSettlement: {
      transform: {
        kind: "jsonata",
        expr: "{'outcome':'blocked','detail':{'kind':error.dependency.kind,'ref':error.dependency.ref}}",
      },
    },
  });

  assert.deepEqual(await host.invoke(effect), {
    outcome: "blocked",
    detail: { kind: "credential", ref: "provider/access-key" },
  });
  const [record] = await host.listRequests();
  assert.equal(record?.status, "failed");
  assert.deepEqual(record?.errorDetail?.dependency, {
    kind: "credential",
    ref: "provider/access-key",
  });
});

test("host throws immediate unsatisfied dependencies after recording failure", async () => {
  const unavailable = new UnsatisfiedServiceDependencyError(
    "Credential is required",
    { kind: "credential", ref: "provider/access-key" },
  );
  const host = createHost(async () => { throw unavailable; }, {
    failureSettlement: {
      transform: { kind: "jsonata", expr: "{'outcome':'settled'}" },
    },
  }, { dependencyFailurePolicy: "throw" });

  await assert.rejects(() => host.invoke(effect), (error) => error === unavailable);
  const [record] = await host.listRequests();
  assert.equal(record?.status, "failed");
  assert.equal(record?.errorDetail?.code, "service-dependency-unsatisfied");
});

test("host dead-letters queued unsatisfied dependencies under throw policy", async () => {
  const host = createHost(async () => {
    throw new UnsatisfiedServiceDependencyError(
      "Credential is required",
      { kind: "credential", ref: "provider/access-key" },
    );
  }, { mode: "queued" }, { dependencyFailurePolicy: "throw" });

  const queue = new QueueFace(host);
  await queue.submit(effect);
  const record = await host.runNext();
  assert.equal(record?.status, "dead-lettered");
  assert.equal(record?.errorDetail?.code, "service-dependency-unsatisfied");
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
