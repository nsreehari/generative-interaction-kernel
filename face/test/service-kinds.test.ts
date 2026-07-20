import assert from "node:assert/strict";
import { test } from "vitest";

import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  type ServiceDeclaration,
} from "../../kernel/src/index";
import {
  bindDeclarativeServiceUsesSync,
  bindServiceUse,
  bindServiceUseSync,
  QueueFace,
  resolveServiceUse,
  ServiceKindRegistry,
  serviceConfig,
  type ServiceAdapter,
  type ServiceKindFactory,
} from "../src/index";

function deterministicRegistry(output: Record<string, string> = { answer: "done" }): ServiceKindRegistry {
  const registry = new ServiceKindRegistry();
  registry.register({
    manifest: {
      id: "deterministic-agent",
      version: "1",
      configSchema: {},
      executionModes: ["immediate"],
      subjects: ["cell"],
    },
    create: () => ({
      provider: { id: "deterministic:test", version: "1" },
      discover: async () => ({
        provider: { id: "deterministic:test", version: "1" },
        revision: "1",
        discoveredAt: "2026-07-20T00:00:00.000Z",
        capabilities: [],
      }),
      execute: async () => ({ output }),
    }),
  });
  return registry;
}

function copilotFactory(created: string[]): ServiceKindFactory {
  return {
    manifest: {
      id: "copilot-agent",
      version: "1",
      configSchema: {
        type: "object",
        properties: { model: { type: "string" } },
        required: ["model"],
      },
      executionModes: ["immediate", "queued"],
      subjects: ["cell", "substrate-agent", "chat", "task"],
      requiresHostCapabilities: ["process-executor", "workspace-resolver"],
      supports: { probe: true, stream: true, cancel: true },
    },
    validate: (declaration) => {
      const model = serviceConfig(declaration).model;
      return typeof model === "string" && model.trim()
        ? { ok: true }
        : { ok: false, errors: ["copilot-agent requires config.model"] };
    },
    create: (declaration) => {
      const model = String(serviceConfig(declaration).model);
      created.push(model);
      return {
        provider: { id: `copilot:${model}`, version: "1" },
        discover: async () => ({
          provider: { id: `copilot:${model}`, version: "1" },
          revision: "1",
          discoveredAt: "2026-07-20T00:00:00.000Z",
          capabilities: [],
        }),
        execute: async () => ({ output: { model } }),
      } satisfies ServiceAdapter;
    },
  };
}

const declaration = (model: string, scope: ServiceDeclaration["scope"] = "per-cell"): ServiceDeclaration => ({
  kind: "copilot-agent",
  version: "1",
  operations: ["analyze"],
  config: { model },
  scope,
});

test("reports understood service kinds that are unavailable in the current host", () => {
  const registry = new ServiceKindRegistry({ hostCapabilities: ["process-executor"] });
  registry.register(copilotFactory([]));

  assert.deepEqual(registry.describe().map(({ available, missingHostCapabilities }) => ({
    available,
    missingHostCapabilities,
  })), [{ available: false, missingHostCapabilities: ["workspace-resolver"] }]);
});

test("materializes different per-cell models without host service instances", async () => {
  const created: string[] = [];
  const registry = new ServiceKindRegistry({
    hostCapabilities: ["process-executor", "workspace-resolver"],
  });
  registry.register(copilotFactory(created));

  const analysis = await registry.materialize(
    { blueprintId: "portfolio", blueprintRevision: "7", serviceId: "analysis" },
    declaration("gpt-5.4")
  );
  const summary = await registry.materialize(
    { blueprintId: "portfolio", blueprintRevision: "7", serviceId: "summary" },
    declaration("gpt-5.4-mini")
  );
  const analysisAgain = await registry.materialize(
    { blueprintId: "portfolio", blueprintRevision: "7", serviceId: "analysis" },
    declaration("gpt-5.4")
  );

  assert.equal(analysis.provider.id, "copilot:gpt-5.4");
  assert.equal(summary.provider.id, "copilot:gpt-5.4-mini");
  assert.equal(analysisAgain, analysis);
  assert.deepEqual(created, ["gpt-5.4", "gpt-5.4-mini"]);
});

test("does not cache per-invocation declarations", async () => {
  const created: string[] = [];
  const registry = new ServiceKindRegistry({
    hostCapabilities: ["process-executor", "workspace-resolver"],
  });
  registry.register(copilotFactory(created));
  const identity = { blueprintId: "portfolio", blueprintRevision: "7", serviceId: "analysis" };

  const first = await registry.materialize(identity, declaration("gpt-5.4", "per-invocation"));
  const second = await registry.materialize(identity, declaration("gpt-5.4", "per-invocation"));

  assert.notEqual(first, second);
  assert.deepEqual(created, ["gpt-5.4", "gpt-5.4"]);
});

test("resolves named and inline Blueprint service uses", () => {
  const named = declaration("gpt-5.4");
  assert.deepEqual(resolveServiceUse({
    service: "analysis",
    operation: "analyze",
    contract: "portfolio-analysis-v1",
  }, { analysis: named }), { serviceId: "analysis", declaration: named });

  const inline = declaration("gpt-5.4-mini");
  assert.deepEqual(resolveServiceUse({
    inline,
    operation: "analyze",
    contract: "portfolio-analysis-v1",
  }, {}, "cell-summary"), { serviceId: "cell-summary", declaration: inline });
});

test("materializes and binds a Blueprint service use into QueueFace", async () => {
  const registry = new ServiceKindRegistry({
    hostCapabilities: ["process-executor", "workspace-resolver"],
  });
  registry.register(copilotFactory([]));
  const queueFace = new QueueFace();

  const binding = await bindServiceUse(queueFace, registry, {
    analysis: declaration("gpt-5.4"),
  }, {
    service: "analysis",
    operation: "analyze",
    contract: "portfolio-analysis-v1",
  }, {
    blueprintId: "portfolio",
    blueprintRevision: "7",
    invoke: "requestIntelligence",
  });

  assert.equal(binding.providerId, "copilot:gpt-5.4");
  assert.equal(queueFace.satisfies({
    analysis: { version: "1", operations: ["analyze"] },
  }).ok, true);
});

test("binds synchronous kinds during synchronous bundle loading", () => {
  const registry = new ServiceKindRegistry();
  registry.register({
    manifest: {
      id: "deterministic-agent",
      version: "1",
      configSchema: {},
      executionModes: ["immediate"],
      subjects: ["cell"],
    },
    create: () => ({
      provider: { id: "deterministic:portfolio", version: "1" },
      discover: async () => ({
        provider: { id: "deterministic:portfolio", version: "1" },
        revision: "1",
        discoveredAt: "2026-07-20T00:00:00.000Z",
        capabilities: [],
      }),
      execute: async () => ({ output: {} }),
    }),
  });
  const queueFace = new QueueFace();

  const binding = bindServiceUseSync(queueFace, registry, {
    analysis: {
      kind: "deterministic-agent",
      version: "1",
      operations: ["analyze"],
    },
  }, {
    service: "analysis",
    operation: "analyze",
    contract: "portfolio-analysis-v1",
  }, {
    blueprintId: "portfolio",
    blueprintRevision: "7",
    invoke: "requestIntelligence",
  });

  assert.equal(binding.providerId, "deterministic:portfolio");
});

test("evaluates declarative service request and result mappings", async () => {
  const queueFace = new QueueFace();
  const state = new InMemoryStateModel(["work"]);
  state.apply([{ op: "set", path: "work.prompt", value: "explain" }]);
  bindDeclarativeServiceUsesSync(queueFace, deterministicRegistry(), {
    analysis: { kind: "deterministic-agent", version: "1", operations: ["analyze"] },
  }, [{
    invoke: "requestAnalysis",
    use: { service: "analysis", operation: "analyze", contract: "analysis/v1" },
    request: "{'input': {'prompt': state.work.prompt}, 'actorId': effect.actorId}",
    result: "{'ops': [{'op':'set','path':'work.answer','value':result.output.answer}]}",
  }], {
    blueprintId: "test",
    blueprintRevision: "1",
    state,
    expression: new JsonataExpressionProvider(),
  });

  const settled = await queueFace.createOrchestrator().invoke!({
    kind: "invoke",
    node: "request-button",
    tool: "requestAnalysis",
    args: {},
    actorId: "author",
  });

  assert.deepEqual(settled, {
    ops: [{ op: "set", path: "work.answer", value: "done" }],
  });
  assert.deepEqual((await queueFace.listRequests())[0]?.request.input, { prompt: "explain" });
  assert.equal((await queueFace.listRequests())[0]?.request.actorId, "author");
});

test("rejects malformed declarative service evaluator outputs", async () => {
  const declarations = {
    analysis: { kind: "deterministic-agent", version: "1", operations: ["analyze"] },
  } satisfies Record<string, ServiceDeclaration>;
  const options = {
    blueprintId: "test",
    blueprintRevision: "1",
    state: new InMemoryStateModel(["work"]),
    expression: new JsonataExpressionProvider(),
  };
  const invalidRequest = new QueueFace();
  bindDeclarativeServiceUsesSync(invalidRequest, deterministicRegistry(), declarations, [{
    invoke: "requestAnalysis",
    use: { service: "analysis", operation: "analyze", contract: "analysis/v1" },
    request: "42",
  }], options);
  await assert.rejects(
    invalidRequest.createOrchestrator().invoke!({ kind: "invoke", node: "button", tool: "requestAnalysis", args: {} }),
    /request expression must return an object/
  );

  const invalidResult = new QueueFace();
  bindDeclarativeServiceUsesSync(invalidResult, deterministicRegistry(), declarations, [{
    invoke: "requestAnalysis",
    use: { service: "analysis", operation: "analyze", contract: "analysis/v1" },
    result: "{'ops': [{'op':'explode','path':'work.answer'}]}",
  }], options);
  await assert.rejects(
    invalidResult.createOrchestrator().invoke!({ kind: "invoke", node: "button", tool: "requestAnalysis", args: {} }),
    /result ops must be valid patch operations/
  );
});

test("records Blueprint revision and execution subject without provider config", async () => {
  const registry = new ServiceKindRegistry({
    hostCapabilities: ["process-executor", "workspace-resolver"],
  });
  registry.register(copilotFactory([]));
  const queueFace = new QueueFace({ idFactory: () => "request-1" });
  bindServiceUseSync(queueFace, registry, { analysis: declaration("gpt-5.4") }, {
    service: "analysis",
    operation: "analyze",
    contract: "portfolio-analysis-v1",
  }, {
    blueprintId: "portfolio",
    blueprintRevision: "7",
    invoke: "requestIntelligence",
    subject: { kind: "cell", blueprintId: "portfolio", cellId: "portfolio-intelligence" },
  });

  const record = await queueFace.submit({ service: "analysis", operation: "analyze", input: {} });
  assert.equal(record.request.blueprintId, "portfolio");
  assert.equal(record.request.blueprintRevision, "7");
  assert.equal(record.request.serviceRef, "analysis");
  assert.deepEqual(record.request.subject, {
    kind: "cell",
    blueprintId: "portfolio",
    cellId: "portfolio-intelligence",
  });
  assert.equal("config" in record.request, false);
});

test("enforces kind config schemas before factory validation", async () => {
  const registry = new ServiceKindRegistry({
    hostCapabilities: ["process-executor", "workspace-resolver"],
  });
  registry.register(copilotFactory([]));

  const report = await registry.validate({
    kind: "copilot-agent",
    version: "1",
    operations: ["analyze"],
    config: {},
  });

  assert.equal(report.ok, false);
  assert.match(report.errors?.join(" ") ?? "", /model/);
});

test("rejects literal credentials while allowing credential references", async () => {
  const registry = new ServiceKindRegistry();
  registry.register({
    manifest: {
      id: "foundry-agent",
      version: "1",
      configSchema: {
        type: "object",
        properties: { credentialRef: { type: "string" }, secret: { type: "string" } },
      },
      executionModes: ["immediate"],
      subjects: ["cell"],
    },
    create: () => ({
      provider: { id: "foundry", version: "1" },
      discover: async () => ({ provider: { id: "foundry", version: "1" }, revision: "1", discoveredAt: "now", capabilities: [] }),
      execute: async () => ({ output: {} }),
    }),
  });

  assert.equal((await registry.validate({
    kind: "foundry-agent",
    version: "1",
    operations: ["chat"],
    config: { credentialRef: "host/foundry" },
  })).ok, true);
  const rejected = await registry.validate({
    kind: "foundry-agent",
    version: "1",
    operations: ["chat"],
    config: { secret: "literal" },
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors?.join(" ") ?? "", /Literal credentials/);
});

test("resolves output policy most-specific-wins: use override beats declaration beats kind default", async () => {
  const kindDefault = { onViolation: { action: "retry" as const, maxAttempts: 1 } };
  const registry = new ServiceKindRegistry({
    hostCapabilities: ["process-executor", "workspace-resolver"],
  });
  registry.register({
    ...copilotFactory([]),
    defaultOutputPolicy: (operation) => (operation === "analyze" ? kindDefault : undefined),
  });
  const queueFace = new QueueFace();

  const declaredPolicy = { guardrails: [{ kind: "jsonata" as const, expr: "data.ok = true", message: "must be ok" }] };
  const bindingFromDeclaration = await bindServiceUse(queueFace, registry, {
    analysis: { ...declaration("gpt-5.4"), operationPolicies: { analyze: declaredPolicy } },
  }, {
    service: "analysis",
    operation: "analyze",
    contract: "portfolio-analysis-v1",
  }, {
    blueprintId: "portfolio",
    blueprintRevision: "7",
    invoke: "requestIntelligence",
  });
  // Declaration supplies guardrails (kind default has none); kind default's onViolation carries
  // through because the declaration didn't specify its own.
  assert.deepEqual(bindingFromDeclaration.outputPolicy, {
    guardrails: declaredPolicy.guardrails,
    onViolation: kindDefault.onViolation,
  });

  const registry2 = new ServiceKindRegistry({
    hostCapabilities: ["process-executor", "workspace-resolver"],
  });
  registry2.register({
    ...copilotFactory([]),
    defaultOutputPolicy: () => kindDefault,
  });
  const queueFace2 = new QueueFace();
  const overrideOnViolation = { action: "fail" as const };
  const bindingWithOverride = await bindServiceUse(queueFace2, registry2, {
    analysis: declaration("gpt-5.4"),
  }, {
    service: "analysis",
    operation: "analyze",
    contract: "portfolio-analysis-v1",
    policyOverride: { onViolation: overrideOnViolation },
  }, {
    blueprintId: "portfolio",
    blueprintRevision: "7",
    invoke: "requestIntelligence",
  });
  assert.deepEqual(bindingWithOverride.outputPolicy?.onViolation, overrideOnViolation);
});
