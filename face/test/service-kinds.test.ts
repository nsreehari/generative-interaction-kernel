import assert from "node:assert/strict";
import { test } from "vitest";

import type { NativeServiceDeclaration } from "../../kernel/src/index";
import {
  DefaultServiceHost, ServiceKindRegistry, UnsatisfiedServiceDependencyError,
  requireServiceDependency, serviceConfig,
  type BlueprintServiceIdentity, type ServiceAdapter, type ServiceDependencyRequirement,
  type ServiceDependencyStatus, type ServiceKindContext, type ServiceKindFactory,
} from "../src/index";
import { InMemoryStateModel, JsonataExpressionProvider } from "../../kernel/src/index";

const settlement = { transform: { kind: "jsonata" as const, expr: "{'outcome':'completed'}" } };

function declaration(model: string, scope: NativeServiceDeclaration["scope"] = "per-cell"): NativeServiceDeclaration {
  return {
    kind: "copilot-agent",
    version: "1",
    operations: { analyze: { operation: "analyze", contract: "analysis/v1", settlement } },
    config: { model },
    scope,
  };
}

function copilotFactory(created: string[]): ServiceKindFactory {
  return {
    manifest: {
      id: "copilot-agent",
      version: "1",
      configSchema: { type: "object", properties: { model: { type: "string" } }, required: ["model"] },
      executionModes: ["immediate", "queued"],
      subjects: ["cell", "substrate-agent", "chat", "task"],
      requiresHostCapabilities: ["process-executor", "workspace-resolver"],
    },
    create: (service) => {
      const model = String(serviceConfig(service).model);
      created.push(model);
      return {
        provider: { id: `copilot:${model}`, version: "1" },
        discover: async () => ({ provider: { id: `copilot:${model}`, version: "1" }, revision: "1", discoveredAt: "now", capabilities: [] }),
        execute: async () => ({ output: { model } }),
      } satisfies ServiceAdapter;
    },
  };
}

test("reports service kinds unavailable in the current host", () => {
  const registry = new ServiceKindRegistry({ hostCapabilities: ["process-executor"] });
  registry.register(copilotFactory([]));
  assert.deepEqual(registry.describe().map(({ available, missingHostCapabilities }) => ({ available, missingHostCapabilities })), [
    { available: false, missingHostCapabilities: ["workspace-resolver"] },
  ]);
});

test("materializes and caches configured services by declared scope", async () => {
  const created: string[] = [];
  const registry = new ServiceKindRegistry({ hostCapabilities: ["process-executor", "workspace-resolver"] });
  registry.register(copilotFactory(created));
  const identity = { blueprintId: "portfolio", blueprintRevision: "7", serviceId: "analysis" };
  const first = await registry.materialize(identity, declaration("gpt-5.4"));
  const second = await registry.materialize(identity, declaration("gpt-5.4"));
  assert.equal(first, second);
  await registry.materialize(identity, declaration("gpt-5.4", "per-invocation"));
  await registry.materialize(identity, declaration("gpt-5.4", "per-invocation"));
  assert.deepEqual(created, ["gpt-5.4", "gpt-5.4", "gpt-5.4"]);
});

test("validates operation declarations and kind config schemas", async () => {
  const registry = new ServiceKindRegistry({ hostCapabilities: ["process-executor", "workspace-resolver"] });
  registry.register(copilotFactory([]));
  assert.equal((await registry.validate({ ...declaration("gpt-5.4"), operations: {} })).ok, false);
  const invalid = await registry.validate({ ...declaration("gpt-5.4"), config: {} });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors?.join(" ") ?? "", /model/);
});

test("rejects literal credentials while allowing credential references", async () => {
  const registry = new ServiceKindRegistry();
  registry.register({
    manifest: { id: "foundry-agent", version: "1", configSchema: { type: "object" }, executionModes: ["immediate"], subjects: ["chat"] },
    create: () => ({
      provider: { id: "foundry", version: "1" },
      discover: async () => ({ provider: { id: "foundry", version: "1" }, revision: "1", discoveredAt: "now", capabilities: [] }),
      execute: async () => ({ output: {} }),
    }),
  });
  const foundry = {
    kind: "foundry-agent",
    version: "1",
    operations: { chat: { operation: "chat", contract: "chat/v1", settlement } },
  } satisfies NativeServiceDeclaration;
  assert.equal((await registry.validate({ ...foundry, config: { credentialRef: "host/foundry" } })).ok, true);
  const rejected = await registry.validate({ ...foundry, config: { secret: "literal" } });
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors?.join(" ") ?? "", /Literal credentials/);
});

const mailIdentity: BlueprintServiceIdentity = {
  blueprintId: "mail", blueprintRevision: "1", serviceId: "personal-mail",
};
const mailDeclaration: NativeServiceDeclaration = {
  kind: "mail", version: "1", config: { credentialRef: "personal-google" },
  operations: { search: { operation: "search", contract: "mail.search/v1", settlement } },
};

function mailRequirement(service = mailDeclaration): ServiceDependencyRequirement {
  return {
    id: "connection", kind: "credential", ref: String(serviceConfig(service).credentialRef),
    title: "Google connection", scheme: "google-oauth2",
    permissions: Object.values(service.operations).some(({ operation }) => operation === "send")
      ? ["gmail.readonly", "gmail.send"] : ["gmail.readonly"],
  };
}

function mailFactory(created: string[]): ServiceKindFactory {
  return {
    manifest: {
      id: "mail", version: "1", subjects: ["cell"], executionModes: ["immediate"],
      configSchema: {
        type: "object", properties: { credentialRef: { type: "string", minLength: 1 } },
        required: ["credentialRef"], additionalProperties: false,
      },
    },
    describeDependencies: (service) => [mailRequirement(service)],
    create(service, context) {
      created.push("mail");
      return {
        provider: { id: "mail", version: "1" },
        discover: async () => ({
          provider: { id: "mail", version: "1" }, revision: "1", discoveredAt: "now", capabilities: [],
        }),
        async execute() {
          requireServiceDependency(context, mailRequirement(service));
          return { output: { ready: true } };
        },
      };
    },
  };
}

test.each(["browser", "headless"])("describes non-secret setup without materializing or resolving credentials: %s", async (host) => {
  const created: string[] = [];
  const calls: BlueprintServiceIdentity[] = [];
  const status: ServiceDependencyStatus = {
    state: "authorization-required", message: "Connect a Google account",
    actions: [{
      id: "connect", title: host === "browser" ? "Connect Google" : "Authorize with setup CLI",
      requiresUserInteraction: true,
    }],
  };
  const registry = new ServiceKindRegistry({
    resolveCredential: async () => assert.fail("Setup discovery must not resolve secrets"),
    inspectDependency(requirement, identity) {
      assert.deepEqual(requirement.permissions, ["gmail.readonly"]);
      calls.push(identity);
      return status;
    },
  });
  registry.register(mailFactory(created));
  const serviceHost = new DefaultServiceHost({
    blueprintId: mailIdentity.blueprintId, blueprintRevision: mailIdentity.blueprintRevision,
    declarations: { [mailIdentity.serviceId]: mailDeclaration }, registry,
    state: new InMemoryStateModel(["work"]), expression: new JsonataExpressionProvider(),
  });
  const report = await serviceHost.describeServiceSetup(mailIdentity.serviceId);
  assert.equal(report.validation.ok, true);
  assert.equal(report.ready, false);
  assert.deepEqual(report.dependencies, [{ requirement: mailRequirement(), status }]);
  assert.deepEqual(calls, [mailIdentity]);
  assert.deepEqual(created, []);
  report.dependencies[0].requirement.ref = "other-account";
  assert.equal((await registry.describeSetup(mailIdentity, mailDeclaration)).dependencies[0].requirement.ref, "personal-google");
});

test.each(["sync", "async"])("blocks unsatisfied dependencies before adapter creation or cached reuse: %s", async (mode) => {
  let status: ServiceDependencyStatus = { state: "missing", message: "Configure the connection" };
  const created: string[] = [];
  const registry = new ServiceKindRegistry({ inspectDependency: () => status });
  registry.register(mailFactory(created));
  const materialize = async () => mode === "sync"
    ? registry.materializeSync(mailIdentity, mailDeclaration)
    : registry.materialize(mailIdentity, mailDeclaration);
  await assert.rejects(materialize, (error) => {
    assert.ok(error instanceof UnsatisfiedServiceDependencyError);
    assert.deepEqual(error.dependency, mailRequirement());
    assert.deepEqual(error.dependencyStatus, status);
    return true;
  });
  assert.deepEqual(created, []);
  status = { state: "ready" };
  const adapter = await materialize();
  assert.equal(await materialize(), adapter);
  status = { state: "authorization-required", message: "Session expired; reconnect" };
  await assert.rejects(materialize, /Session expired/);
  assert.deepEqual(created, ["mail"]);
});

test("cached adapters can recheck live readiness and changed operations require additional permissions", async () => {
  let available = true;
  const context: ServiceKindContext = {
    hostCapabilities: new Set(),
    inspectDependency: (requirement) => available && !requirement.permissions?.includes("gmail.send")
      ? { state: "ready" } : { state: "insufficient-permissions", message: "Grant the required permissions" },
  };
  const registry = new ServiceKindRegistry(context);
  registry.register(mailFactory([]));
  const adapter = await registry.materialize(mailIdentity, mailDeclaration);
  available = false;
  await assert.rejects(async () => adapter.execute({
    id: "request", providerId: "mail", service: "personal-mail", operation: "search",
    capabilityId: "mail.search/v1", createdAt: "now",
  }, { signal: new AbortController().signal }), /Grant the required permissions/);
  available = true;
  const send = { ...mailDeclaration, operations: {
    ...mailDeclaration.operations, send: { operation: "send", contract: "mail.send/v1", settlement },
  } };
  assert.equal((await registry.describeSetup(mailIdentity, send)).dependencies[0].status.state, "insufficient-permissions");
});

test("missing inspection fails closed, invalid config avoids inspection, and duplicate requirements are rejected", async () => {
  const registry = new ServiceKindRegistry();
  registry.register(mailFactory([]));
  const setup = await registry.describeSetup(mailIdentity, mailDeclaration);
  assert.equal(setup.dependencies[0].status.state, "unavailable");
  await assert.rejects(() => registry.materialize(mailIdentity, mailDeclaration), /not configured dependency inspection/);
  const noInspection = new ServiceKindRegistry({
    inspectDependency: () => assert.fail("Invalid config must be reported before inspecting dependencies"),
  });
  noInspection.register(mailFactory([]));
  const invalid = await noInspection.describeSetup(mailIdentity, { ...mailDeclaration, config: {} });
  assert.equal(invalid.validation.ok, false);
  assert.equal(invalid.ready, false);
  assert.deepEqual(invalid.dependencies, []);
  const duplicates = new ServiceKindRegistry();
  duplicates.register({ ...mailFactory([]), describeDependencies: () => [mailRequirement(), mailRequirement()] });
  await assert.rejects(() => duplicates.describeSetup(mailIdentity, mailDeclaration), /duplicate dependency/);
});

test("malformed readiness and setup actions are errors rather than usable setup reports", async () => {
  for (const status of [
    { state: "missing", message: "" },
    { state: "ready", actions: [{ id: "connect", title: "Connect" }, { id: "connect", title: "Reconnect" }] },
  ] satisfies ServiceDependencyStatus[]) {
    const registry = new ServiceKindRegistry({ inspectDependency: () => status });
    registry.register(mailFactory([]));
    await assert.rejects(() => registry.describeSetup(mailIdentity, mailDeclaration), /snapshot|unique/);
  }
  const registry = new ServiceKindRegistry({ inspectDependency: () => { throw new Error("Host status store unavailable"); } });
  registry.register(mailFactory([]));
  await assert.rejects(() => registry.describeSetup(mailIdentity, mailDeclaration), /Host status store unavailable/);
});

test("untyped host and provider hooks cannot silently omit or asynchronously supply setup snapshots", async () => {
  for (const snapshot of [undefined, Promise.resolve({ state: "ready" })]) {
    const context: ServiceKindContext = { hostCapabilities: new Set() };
    Object.defineProperty(context, "inspectDependency", { value: () => snapshot, enumerable: true });
    const registry = new ServiceKindRegistry(context);
    registry.register(mailFactory([]));
    await assert.rejects(() => registry.describeSetup(mailIdentity, mailDeclaration), /valid synchronous readiness snapshot/);
  }
  const factory = mailFactory([]);
  Object.defineProperty(factory, "describeDependencies", { value: () => Promise.resolve([]) });
  const registry = new ServiceKindRegistry();
  registry.register(factory);
  await assert.rejects(() => registry.describeSetup(mailIdentity, mailDeclaration), /synchronous array/);
});
