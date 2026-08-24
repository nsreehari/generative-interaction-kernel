import type { BlueprintArtifact, BlueprintHostRegistry } from "@gik/blueprint";
import { DefaultServiceHost, ServiceKindRegistry } from "@gik/controlface";
import { createMemoryStorageApi, createMemoryStorageRef } from "@gik/durable-runtime/storage/memory";
import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  type ServiceDeclaration,
} from "@gik/kernel";
import { describe, expect, it } from "vitest";

import { createBlueprintServiceResolver } from "../apps/shared/blueprint-service-resolver";
import { createSampleServiceKindRegistry } from "../service-kinds";
import { openSampleBlueprint } from "../catalog/blueprint-catalog";
import { createBlueprintServiceHost } from "../apps/browser-host/src/runtime/service-host";

const backend = {
  gik: "0.1",
  type: "blueprint",
  payload: {
    id: "test-assets-backend",
    kind: "runtime-blueprint",
    version: "1.0.0",
    interface: {
      events: ["put", "get"],
      outputs: { result: { from: "backend.result" } },
    },
    serviceTiers: [{ id: "runtime-document", kind: "runtime-document" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime-document", kind: "runtime-document" , capabilities: []}],
    projectionRecipes: [],
    runtime: {
      state: { backend: { result: null } },
    },
    cells: {
      controller: {
        id: "controller",
        events: {
          put: { payloadSchema: { type: "object" } },
          get: { payloadSchema: { type: "object" } },
        },
        behavior: {
          on: {
            put: [{ do: "invoke", control: { tool: "storageWrite" } }],
            get: [{ do: "invoke", control: { tool: "storageRead" } }],
          },
        },
      },
    },
    services: {
      storage: {
        kind: "durable-storage",
        version: "1",
        config: { connection: "incident-assets" },
        operations: {
          storageWrite: {
            operation: "write",
            contract: "storage-kv/v1",
            request: { transform: { kind: "jsonata", expr: "{'key':effect.data.key,'value':effect.data.value}" } },
            settlement: { transform: { kind: "jsonata", expr: "{'outcome':'completed'}" } },
          },
          storageRead: {
            operation: "read",
            contract: "storage-kv/v1",
            request: { transform: { kind: "jsonata", expr: "{'key':effect.data.key}" } },
            settlement: { transform: { kind: "jsonata", expr: "{'ops':[{'op':'set','path':'backend.result','value':response}] }" } },
          },
        },
      },
    },
    metadata: { scope: "backend", executionMedium: "headless" },
  },
} satisfies BlueprintArtifact;

const outerSettlement = {
  transform: { kind: "jsonata" as const, expr: "{'ops':[{'op':'set','path':'consumer.result','value':response}] }" },
};

describe("Blueprint-backed services", () => {
  it("uses the host registry key and host-provided durable storage", async () => {
    const storageApi = createMemoryStorageApi();
    const registry: BlueprintHostRegistry = {
      resolveArtifact(reference) {
        if (reference.id !== backend.payload.id) throw new Error(`Unknown Blueprint '${reference.id}'`);
        return backend;
      },
      resolve(reference) {
        const blueprint = this.resolveArtifact(reference, {
          parentBlueprintId: "consumer",
          parentInstanceId: "consumer",
          cellId: "services/assets",
        });
        return { reference: { ...reference, version: blueprint.payload.version }, blueprint };
      },
    };
    const blueprintServices = createBlueprintServiceResolver({
      registry,
      instanceId: "consumer:test",
      createServiceRegistry: () => createSampleServiceKindRegistry({
        durableStorageConnections: {
          "incident-assets": {
            api: storageApi,
            ref: createMemoryStorageRef("blueprint-service-test"),
          },
        },
      }),
    });
    const declarations: Record<string, ServiceDeclaration> = {
      assets: {
        blueprint: { $ref: "blueprint:test-assets-backend@1.0.0" },
        version: "1",
        operations: {
          putAsset: { operation: "put", contract: "assets/v1", settlement: outerSettlement },
          getAsset: { operation: "get", contract: "assets/v1", settlement: outerSettlement },
        },
      },
    };
    const state = new InMemoryStateModel(["consumer"]);
    state.apply([{ op: "set", path: "consumer", value: { result: null } }]);
    const host = new DefaultServiceHost({
      blueprintId: "consumer",
      blueprintRevision: "1",
      declarations,
      registry: new ServiceKindRegistry(),
      blueprintServices,
      state,
      expression: new JsonataExpressionProvider({ safe: true }),
    });

    await host.invoke({ kind: "invoke", node: "consumer", control: { tool: "putAsset" }, data: { key: "asset:a", value: { title: "A" } } });
    expect(await host.invoke({ kind: "invoke", node: "consumer", control: { tool: "getAsset" }, data: { key: "asset:a" } })).toEqual({
      ops: [{ op: "set", path: "consumer.result", value: { title: "A" } }],
    });
    expect(await host.validateService("assets")).toEqual({ ok: true });
  });

  it("persists a real analyzer result through the incident asset Blueprint", async () => {
    const api = createMemoryStorageApi();
    const ref = createMemoryStorageRef("incident-analyzer-blueprint-service-test");
    const runtime = openSampleBlueprint("incident-analysis-assets");
    const state = new InMemoryStateModel(Object.keys(runtime.state));
    state.apply(Object.entries(runtime.state).map(([path, value]) => ({ op: "set" as const, path, value })));
    const host = createBlueprintServiceHost(runtime, state, {
      durableStorageConnections: {
        "blueprint-state": { api, ref },
      },
    });

    await host.invoke({
      kind: "invoke",
      node: "incident-saved-reports",
      control: { tool: "writeIncidentAsset" },
      data: {
        source_report_key: "source-a",
        analysis_key: "incident-semantic/source-faithful-v1",
        saved_report_envelope: { summary: "Persisted by the backend Blueprint" },
      },
    });

    expect(await api.dispatch({
      ref,
      capability: "kv",
      operation: "listKeys",
    })).toEqual(["asset:source-a/incident-semantic/source-faithful-v1"]);
    expect(await api.dispatch({
      ref,
      capability: "kv",
      operation: "read",
      args: ["asset:source-a/incident-semantic/source-faithful-v1"],
    })).toEqual({ summary: "Persisted by the backend Blueprint" });
  });
});