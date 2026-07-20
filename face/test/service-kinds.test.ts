import assert from "node:assert/strict";
import { test } from "vitest";

import type { ServiceDeclaration } from "../../kernel/src/index";
import { ServiceKindRegistry, serviceConfig, type ServiceAdapter, type ServiceKindFactory } from "../src/index";

const settlement = { transform: { kind: "jsonata" as const, expr: "{'outcome':'completed'}" } };

function declaration(model: string, scope: ServiceDeclaration["scope"] = "per-cell"): ServiceDeclaration {
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
  } satisfies ServiceDeclaration;
  assert.equal((await registry.validate({ ...foundry, config: { credentialRef: "host/foundry" } })).ok, true);
  const rejected = await registry.validate({ ...foundry, config: { secret: "literal" } });
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors?.join(" ") ?? "", /Literal credentials/);
});
