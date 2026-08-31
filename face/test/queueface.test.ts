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
  type ServiceAgentToolExecutionContext,
  type ServiceAgentToolProjection,
  type ServiceExecutionResult,
  type ServiceInvocation,
  type ServiceInvocationAuthorizer,
  type ServiceRequest,
} from "../src/index";

function createHost(
  execute: ServiceAdapter["execute"],
  operation: Partial<ServiceDeclaration["operations"][string]> = {},
  options: {
    maxAttempts?: number;
    maxGuardrailAttempts?: number;
    agentTools?: readonly ServiceAgentTool[] | ServiceAgentToolProjection;
    authorizeInvocation?: ServiceInvocationAuthorizer;
    dependencyFailurePolicy?: "settle" | "throw";
    now?: () => Date;
    onMaterialize?: () => void;
    serviceScope?: "per-invocation";
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
    create: () => {
      options.onMaterialize?.();
      return {
        provider: { id: "deterministic:test", version: "1" },
        discover: async () => ({ provider: { id: "deterministic:test", version: "1" }, revision: "1", discoveredAt: "now", capabilities: [] }),
        validate: async (request) => ({ ok: request.input !== undefined }),
        simulate: async () => ({ output: { recommendation: "hold" } }),
        probe: async () => ({ ok: true }),
        execute,
      };
    },
  });
  const declarations: Record<string, ServiceDeclaration> = {
    analysis: {
      kind: "deterministic-agent",
      version: "1",
      ...(options.serviceScope ? { scope: options.serviceScope } : {}),
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

test("host projects agent tools per request and supplies trusted request context", async () => {
  let projectedContext: ServiceAgentToolExecutionContext | undefined;
  let handlerContext: ServiceAgentToolExecutionContext | undefined;
  let adapterRequest: Parameters<ServiceAdapter["execute"]>[0] | undefined;
  const invocations: ServiceInvocation[] = [];
  const host = createHost(async (request, context) => {
    adapterRequest = request;
    const result = await context.agentTools?.[0]?.handler({ accountId: "portfolio-1" });
    return { output: result as never };
  }, {}, {
    agentTools: (context) => {
      projectedContext = context;
      return [{
        name: "read_portfolio",
        description: "Read one portfolio.",
        inputSchema: { type: "object" },
        lifecycle: "agent",
        handler: (_args, trustedContext) => {
          handlerContext = trustedContext;
          return { positions: 3 };
        },
      }];
    },
    authorizeInvocation: (invocation) => {
      invocations.push(invocation);
      return { outcome: "authorized" };
    },
  });

  await host.invoke(effect, {
    actorId: "portfolio-owner",
    correlationId: "correlation-1",
    idempotencyKey: "idempotency-1",
    deadline: "2030-01-01T00:00:00.000Z",
  });

  assert.equal(adapterRequest?.actorId, "portfolio-owner");
  assert.equal(adapterRequest?.correlationId, "correlation-1");
  assert.equal(adapterRequest?.idempotencyKey, "idempotency-1");
  assert.equal(adapterRequest?.deadline, "2030-01-01T00:00:00.000Z");
  assert.equal(projectedContext?.requestId, "request-1");
  assert.equal(handlerContext, projectedContext);
  assert.equal(handlerContext?.actorId, "portfolio-owner");
  assert.deepEqual(invocations.map(({ kind }) => kind), ["service-request", "agent-tool"]);
  assert.deepEqual(invocations[1], {
    kind: "agent-tool",
    request: adapterRequest,
    tool: "read_portfolio",
    args: { accountId: "portfolio-1" },
  });
});

test("visible agent tools authorize concrete arguments before execution", async () => {
  let executions = 0;
  const host = createHost(async (_request, context) => ({
    output: await context.agentTools?.[0]?.handler({ accountId: "other-portfolio" }) as never,
  }), {}, {
    agentTools: [{
      name: "read_portfolio",
      description: "Read one portfolio.",
      inputSchema: { type: "object" },
      lifecycle: "agent",
      handler: () => {
        executions += 1;
        return { positions: 3 };
      },
    }],
    authorizeInvocation: (invocation) => invocation.kind === "agent-tool"
      ? { outcome: "rejected", reason: "protected-target", detail: { target: "other-portfolio" } }
      : { outcome: "authorized" },
  });

  assert.deepEqual(await host.invoke(effect), {
    ops: [{
      op: "set",
      path: "work.answer",
      value: {
        outcome: "rejected",
        detail: { reason: "protected-target", target: "other-portfolio" },
      },
    }],
  });
  assert.equal(executions, 0);
});

test("adapter request mutation cannot forge trusted tool authorization context", async () => {
  let toolExecutions = 0;
  let authorizedRequest: Readonly<Parameters<ServiceAdapter["execute"]>[0]> | undefined;
  const host = createHost(async (request, context) => {
    (request as { actorId?: string }).actorId = "forged-actor";
    const input = request.input as { target: { accountId: string } };
    input.target.accountId = "forged-portfolio";
    return {
      output: await context.agentTools?.[0]?.handler({ accountId: "portfolio-1" }) as never,
    };
  }, {}, {
    agentTools: [{
      name: "read_portfolio",
      description: "Read one portfolio.",
      inputSchema: { type: "object" },
      lifecycle: "agent",
      handler: () => {
        toolExecutions += 1;
        return { positions: 3 };
      },
    }],
    authorizeInvocation: (invocation) => {
      if (invocation.kind === "service-request") return { outcome: "authorized" };
      authorizedRequest = invocation.request;
      const input = invocation.request.input as { target: { accountId: string } };
      return invocation.request.actorId === "author" && input.target.accountId === "portfolio-1"
        ? { outcome: "authorized" }
        : { outcome: "rejected", reason: "untrusted-target" };
    },
  });

  await host.invoke({
    ...effect,
    data: { target: { accountId: "portfolio-1" } },
  });

  assert.equal(toolExecutions, 1);
  assert.equal(authorizedRequest?.actorId, "author");
  assert.deepEqual(authorizedRequest?.input, { target: { accountId: "portfolio-1" } });
  assert.equal(Object.isFrozen(authorizedRequest), true);
  assert.equal(Object.isFrozen(authorizedRequest?.input), true);
  assert.equal(Object.isFrozen((authorizedRequest?.input as { target: object }).target), true);
});

test("service authorization returns structured rejected and confirmation-required outcomes", async () => {
  let executions = 0;
  const rejected = createHost(async () => {
    executions += 1;
    return { output: null };
  }, {}, {
    authorizeInvocation: () => ({
      outcome: "rejected",
      reason: "actor-not-authorized",
      detail: { policy: "portfolio-owner" },
    }),
  });
  assert.deepEqual(await rejected.invoke(effect), {
    outcome: "rejected",
    detail: {
      requestId: "request-1",
      reason: "actor-not-authorized",
      policy: "portfolio-owner",
    },
  });
  assert.equal((await rejected.getRequest("request-1"))?.status, "rejected");

  const confirmation = createHost(async () => {
    executions += 1;
    return { output: null };
  }, { mode: "queued" }, {
    authorizeInvocation: () => ({
      outcome: "confirmation-required",
      reason: "human-approval-required",
    }),
  });
  const record = await new QueueFace(confirmation).submit(effect);
  assert.equal(record.status, "confirmation-required");
  assert.equal(await confirmation.runNext(), undefined);
  assert.equal(executions, 0);
});

test("queued execution rejects authorization that expired after enqueue", async () => {
  let now = Date.parse("2026-08-31T10:00:00.000Z");
  let executions = 0;
  const host = createHost(async () => {
    executions += 1;
    return { output: null };
  }, { mode: "queued" }, {
    now: () => new Date(now),
    authorizeInvocation: () => ({
      outcome: "authorized",
      validUntil: "2026-08-31T10:01:00.000Z",
    }),
  });
  const queue = new QueueFace(host);
  assert.equal((await queue.submit(effect)).status, "accepted");

  now = Date.parse("2026-08-31T10:02:00.000Z");
  const rejected = await host.runNext();
  assert.equal(rejected?.status, "rejected");
  assert.deepEqual(rejected?.authorization, {
    outcome: "rejected",
    reason: "authorization-stale",
  });
  assert.equal(rejected?.attempts, 0);
  assert.equal(executions, 0);
});

test("queued execution revalidates authorization after awaited adapter materialization", async () => {
  let now = Date.parse("2026-08-31T10:00:00.000Z");
  let materializations = 0;
  let executions = 0;
  const host = createHost(async () => {
    executions += 1;
    return { output: null };
  }, { mode: "queued" }, {
    now: () => new Date(now),
    serviceScope: "per-invocation",
    onMaterialize: () => {
      materializations += 1;
      if (materializations === 2) now = Date.parse("2026-08-31T10:02:00.000Z");
    },
    authorizeInvocation: () => ({
      outcome: "authorized",
      validUntil: "2026-08-31T10:01:00.000Z",
    }),
  });
  const queue = new QueueFace(host);
  assert.equal((await queue.submit(effect)).status, "accepted");

  const rejected = await host.runNext();
  assert.equal(materializations, 2);
  assert.equal(rejected?.status, "rejected");
  assert.deepEqual(rejected?.authorization, {
    outcome: "rejected",
    reason: "authorization-stale",
  });
  assert.equal(rejected?.attempts, 0);
  assert.equal(executions, 0);
});

test("configured authorization fails closed on unavailable and stale decisions", async () => {
  const unavailable = createHost(async () => ({ output: null }), {}, {
    authorizeInvocation: (() => undefined) as unknown as ServiceInvocationAuthorizer,
  });
  assert.deepEqual(await unavailable.invoke(effect), {
    outcome: "rejected",
    detail: { requestId: "request-1", reason: "authorization-unavailable" },
  });

  const stale = createHost(async () => ({ output: null }), {}, {
    authorizeInvocation: () => ({
      outcome: "authorized",
      validUntil: "2000-01-01T00:00:00.000Z",
    }),
  });
  assert.deepEqual(await stale.invoke(effect), {
    outcome: "rejected",
    detail: { requestId: "request-1", reason: "authorization-stale" },
  });
});

test("QueueFace delegates queued lifecycle to the shared host", async () => {
  const host = createHost(async (request) => ({ output: request.input }), { mode: "queued" });
  const queue = new QueueFace(host);
  const accepted = await queue.submit(effect, {
    correlationId: "queue-correlation-1",
    idempotencyKey: "queue-idempotency-1",
    deadline: "2030-01-01T00:00:00.000Z",
  });
  assert.equal(accepted.status, "accepted");
  assert.deepEqual(accepted.request.input, { ticker: "MSFT" });
  assert.equal(accepted.request.correlationId, "queue-correlation-1");
  assert.equal(accepted.request.idempotencyKey, "queue-idempotency-1");
  assert.equal(accepted.request.deadline, "2030-01-01T00:00:00.000Z");
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

test("host resolves a Cell source against its declared service", async () => {
  const registry = new ServiceKindRegistry();
  registry.register({
    manifest: {
      id: "deterministic-agent",
      version: "1",
      configSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
      executionModes: ["immediate"],
      subjects: ["cell"],
      supports: { probe: false, simulate: false, cancel: false },
    },
    create: (declaration) => {
      const config = declaration.config;
      if (!config || typeof config !== "object" || Array.isArray(config) || typeof config.name !== "string") {
        throw new Error("Expected a named deterministic test service");
      }
      return {
        provider: { id: "deterministic:test", version: "1" },
        discover: async () => ({ provider: { id: "deterministic:test", version: "1" }, revision: "1", discoveredAt: "now", capabilities: [] }),
        validate: async () => ({ ok: true }),
        execute: async () => ({ output: { selected: config.name } }),
      };
    },
  });
  const operation = {
    operation: "analyze",
    contract: "portfolio-analysis/v1",
    settlement: { transform: { kind: "jsonata" as const, expr: "response" } },
  };
  const host = new DefaultServiceHost({
      blueprintId: "portfolio",
      blueprintRevision: "1",
      declarations: {
        first: { kind: "deterministic-agent", version: "1", operations: { analyzePortfolio: operation }, config: { name: "first" } },
        second: { kind: "deterministic-agent", version: "1", operations: { analyzePortfolio: operation }, config: { name: "second" } },
      },
      registry,
      state: new InMemoryStateModel(["work"]),
      expression: new JsonataExpressionProvider({ safe: true }),
  });

  assert.deepEqual(await host.invoke({
  ...effect,
  control: {
    tool: "analyzePortfolio",
    serviceRef: "second",
    sourceId: "analysis.source",
    sourceCellId: "analysis",
  },
  }), {
  sourceOutput: { selected: "second" },
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

test("guardrail retry fails closed when authorization expires after the first execution", async () => {
  let now = Date.parse("2026-08-31T10:00:00.000Z");
  let executions = 0;
  const host = createHost(async (): Promise<ServiceExecutionResult> => {
    executions += 1;
    now = Date.parse("2026-08-31T10:02:00.000Z");
    return { output: { weight: 1.4 } };
  }, {
    response: {
      validators: [{ kind: "jsonata", expr: "data.weight <= 1", message: "weight must not exceed 1" }],
    },
    onViolation: { action: "retry", maxAttempts: 3 },
  }, {
    now: () => new Date(now),
    maxGuardrailAttempts: 3,
    authorizeInvocation: () => ({
      outcome: "authorized",
      validUntil: "2026-08-31T10:01:00.000Z",
    }),
  });

  assert.deepEqual(await host.invoke(effect), {
    outcome: "rejected",
    detail: { requestId: "request-1", reason: "authorization-stale" },
  });
  const [record] = await host.listRequests();
  assert.equal(record?.status, "rejected");
  assert.equal(record?.attempts, 1);
  assert.equal(record?.guardrailAttempts, 1);
  assert.equal(executions, 1);
});

test("correction-prompt retry authorizes the exact immutable correction request", async () => {
  const authorizedRequests: Readonly<ServiceRequest>[] = [];
  let executions = 0;
  const host = createHost(async (): Promise<ServiceExecutionResult> => {
    executions += 1;
    return { output: { weight: 1.4 } };
  }, {
    response: {
      validators: [{ kind: "jsonata", expr: "data.weight <= 1", message: "weight must not exceed 1" }],
    },
    onViolation: { action: "correction-prompt", maxAttempts: 3 },
  }, {
    maxGuardrailAttempts: 3,
    authorizeInvocation: (invocation) => {
      if (invocation.kind !== "service-request") return { outcome: "authorized" };
      authorizedRequests.push(invocation.request);
      return invocation.request.eventPayload?.guardrailCorrection
        ? { outcome: "confirmation-required", reason: "review-correction" }
        : { outcome: "authorized" };
    },
  });

  assert.deepEqual(await host.invoke(effect), {
    outcome: "confirmation-required",
    detail: { requestId: "request-1", reason: "review-correction" },
  });
  assert.equal(executions, 1);
  assert.equal(authorizedRequests.length, 2);
  const correction = authorizedRequests[1]?.eventPayload?.guardrailCorrection as {
    issues: Array<{ detail: string }>;
  };
  assert.equal(correction.issues[0]?.detail, "weight must not exceed 1");
  assert.equal(Object.isFrozen(authorizedRequests[1]), true);
  assert.equal(Object.isFrozen(authorizedRequests[1]?.eventPayload), true);
  assert.equal(Object.isFrozen(correction), true);
});

test("retry failure preserves the active correction and authorization record", async () => {
  let executions = 0;
  const host = createHost(async (): Promise<ServiceExecutionResult> => {
    executions += 1;
    if (executions === 1) return { output: { weight: 1.4 } };
    throw new Error("correction provider unavailable");
  }, {
    mode: "queued",
    response: {
      validators: [{ kind: "jsonata", expr: "data.weight <= 1", message: "weight must not exceed 1" }],
    },
    onViolation: { action: "correction-prompt", maxAttempts: 3 },
  }, {
    maxAttempts: 2,
    maxGuardrailAttempts: 3,
    authorizeInvocation: (invocation) => invocation.kind === "service-request"
      && invocation.request.eventPayload?.guardrailCorrection
      ? { outcome: "authorized", detail: { phase: "correction" } }
      : { outcome: "authorized", detail: { phase: "initial" } },
  });
  await new QueueFace(host).submit(effect);

  const retryable = await host.runNext();
  assert.equal(executions, 2);
  assert.equal(retryable?.status, "accepted");
  assert.equal(retryable?.attempts, 1);
  assert.equal(retryable?.guardrailAttempts, 1);
  assert.equal(retryable?.guardrailViolations?.[0]?.detail, "weight must not exceed 1");
  assert.equal(retryable?.error, "correction provider unavailable");
  assert.deepEqual(retryable?.authorization, {
    outcome: "authorized",
    detail: { phase: "correction" },
  });
  const correction = retryable?.request.eventPayload?.guardrailCorrection as {
    issues: Array<{ detail: string }>;
  };
  assert.equal(correction.issues[0]?.detail, "weight must not exceed 1");
  assert.deepEqual(await host.getRequest("request-1"), retryable);
});

test("host response validators can enforce trusted request constraints", async () => {
  const host = createHost(async () => ({ output: { ticker: "AAPL" } }), {
    response: {
      validators: [{
        kind: "jsonata",
        expr: "data.ticker = $request.ticker",
        message: "response ticker must match the request",
      }],
    },
  });

  await assert.rejects(
    () => host.invoke(effect),
    /response ticker must match the request/,
  );
  const [record] = await host.listRequests();
  assert.equal(record?.status, "failed");
  assert.match(record?.error ?? "", /response ticker must match the request/);
});

test("host merges a Cell source's acceptanceCriteria with the operation's own response validators", async () => {
  const host = createHost(async () => ({ output: { ticker: "AAPL" } }), {
    response: {
      validators: [{ kind: "jsonata", expr: "data.ticker != null", message: "response must include a ticker" }],
    },
  });
  const sourceEffect = {
    ...effect,
    control: {
      ...effect.control,
      sourceAcceptanceCriteria: [{
        kind: "jsonata" as const,
        expr: "data.ticker = 'MSFT'",
        message: "ticker must match the accepted source",
      }],
    },
  };

  await assert.rejects(() => host.invoke(sourceEffect), /ticker must match the accepted source/);
});

test("a Cell source's acceptanceCriteria retries under the operation's own onViolation policy", async () => {
  let calls = 0;
  const host = createHost(async (): Promise<ServiceExecutionResult> => {
    calls += 1;
    return { output: { capabilities: calls < 2 ? ["extra:capability"] : ["primitive:markdown"] } };
  }, {
    onViolation: { action: "retry", maxAttempts: 5 },
  }, { maxGuardrailAttempts: 2 });
  const sourceEffect = {
    ...effect,
    control: {
      ...effect.control,
      sourceAcceptanceCriteria: [{
        kind: "jsonata" as const,
        expr: "$count(data.capabilities[$not($ in ['primitive:markdown'])]) = 0",
        message: "capability not accepted",
      }],
    },
  };

  await host.invoke(sourceEffect);
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
