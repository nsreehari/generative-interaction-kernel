import assert from "node:assert/strict";
import { test } from "vitest";

import type { NativeServiceDeclaration } from "../../kernel/src/index";
import {
  DefaultServiceHost, ServiceKindRegistry, UnsatisfiedServiceDependencyError,
  requireServiceDependency, serviceConfig,
  type BlueprintServiceIdentity, type ServiceAdapter, type ServiceDependencyRequirement,
  type ServiceDependencyStatus, type ServiceKindContext, type ServiceKindFactory, type ServiceRequest,
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
        async execute(request) {
          requireServiceDependency(context, mailRequirement(service), request.service);
          return { output: { ready: true } };
        },
      };
    },
  };
}

function mailRequest(service: string): ServiceRequest {
  return {
    id: `request-${service}`, providerId: "mail", service, operation: "search",
    capabilityId: "mail.search/v1", createdAt: "now",
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

test.each(["sync", "async"])("shared adapters recheck the calling service without changing continuity: %s", async (mode) => {
  const created: string[] = [];
  const statuses: Record<string, ServiceDependencyStatus> = {
    "personal-mail": { state: "ready" }, "other-mail": { state: "ready" },
  };
  const inspected: BlueprintServiceIdentity[] = [];
  const registry = new ServiceKindRegistry({
    inspectDependency(_, identity) {
      inspected.push(identity);
      return statuses[identity.serviceId];
    },
  });
  registry.register(mailFactory(created));
  const materialize = async (serviceId: string) => {
    const identity = { ...mailIdentity, serviceId };
    return mode === "sync" ? registry.materializeSync(identity, mailDeclaration) : registry.materialize(identity, mailDeclaration);
  };
  const first = await materialize("personal-mail");
  const second = await materialize("other-mail");
  assert.equal(first, second);
  assert.deepEqual(created, ["mail"]);
  statuses["personal-mail"] = { state: "authorization-required", message: "First account revoked" };
  const ready = await second.execute(mailRequest("other-mail"), {});
  assert.deepEqual(ready.output, { ready: true });
  assert.deepEqual(inspected.at(-1), { ...mailIdentity, serviceId: "other-mail" });
  await assert.rejects(async () => first.execute(mailRequest("personal-mail"), {}), /First account revoked/);
  statuses["personal-mail"] = { state: "ready" };
  statuses["other-mail"] = { state: "authorization-required", message: "Second account revoked" };
  await assert.rejects(async () => second.execute(mailRequest("other-mail"), {}), /Second account revoked/);
  assert.deepEqual(inspected.at(-1), { ...mailIdentity, serviceId: "other-mail" });
});

test("shared observation adapters retain the correct service identity for each live delivery", async () => {
  const statuses: Record<string, ServiceDependencyStatus> = {
    "personal-mail": { state: "ready" }, "other-mail": { state: "ready" },
  };
  const deliveries = new Map<string, () => Promise<void>>();
  const delivered: string[] = [];
  const created: string[] = [];
  const registry = new ServiceKindRegistry({ inspectDependency: (_, identity) => statuses[identity.serviceId] });
  const factory = mailFactory(created);
  registry.register({
    ...factory,
    manifest: { ...factory.manifest, supports: { observe: true } },
    async create(service, context): Promise<ServiceAdapter> {
      return {
        ...await factory.create(service, context),
        async observe(request, observation) {
          deliveries.set(request.service, async () => {
            requireServiceDependency(context, mailRequirement(service), request.service);
            await observation.emit({ name: "changed", id: request.service, payload: {} });
          });
          return { close() { deliveries.delete(request.service); } };
        },
      };
    },
  });
  const declaration: NativeServiceDeclaration = {
    ...mailDeclaration,
    operations: { monitor: {
      operation: "watch", contract: "mail.feed/v1", settlement,
      sense: { kind: "feed", signals: { changed: { payloadSchema: { type: "object" } } } },
    } },
  };
  const host = new DefaultServiceHost({
    blueprintId: mailIdentity.blueprintId, blueprintRevision: mailIdentity.blueprintRevision,
    declarations: { "personal-mail": declaration, "other-mail": declaration }, registry,
    state: new InMemoryStateModel(["work"]), expression: new JsonataExpressionProvider(),
  });
  const handles: Array<{ close(): Promise<void> }> = [];
  try {
    for (const serviceId of ["personal-mail", "other-mail"]) {
      handles.push(await host.observe({
        kind: "invoke", node: "mail", control: { tool: "monitor", serviceRef: serviceId }, data: {},
      }, {
        kind: "feed", emit: async () => { delivered.push(serviceId); },
        onError: (error) => assert.fail(String(error)),
      }));
    }
    assert.deepEqual(created, ["mail"]);
    const first = deliveries.get("personal-mail");
    const second = deliveries.get("other-mail");
    assert.ok(first);
    assert.ok(second);
    statuses["other-mail"] = { state: "authorization-required", message: "Second account revoked" };
    await assert.rejects(second, /Second account revoked/);
    await first();
    assert.deepEqual(delivered, ["personal-mail"]);
  } finally {
    for (const handle of handles) await handle.close();
  }
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

test.each(["host", "provider"])("rejecting async %s setup hooks report their cause without unhandled rejections", async (hook) => {
  const failure = new Error("Asynchronous hook failed");
  const context: ServiceKindContext = { hostCapabilities: new Set() };
  const factory = mailFactory([]);
  Object.defineProperty(hook === "host" ? context : factory, hook === "host" ? "inspectDependency" : "describeDependencies", {
    enumerable: true, value: async () => { throw failure; },
  });
  const registry = new ServiceKindRegistry(context);
  registry.register(factory);
  let reported: Error | undefined;
  await assert.rejects(() => registry.describeSetup(mailIdentity, mailDeclaration), (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, hook === "host" ? /valid synchronous readiness snapshot/ : /synchronous array/);
    reported = error;
    return true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reported?.cause, failure);
});
