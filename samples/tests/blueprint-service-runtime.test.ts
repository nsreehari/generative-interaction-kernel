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
    tiers: [{ id: "runtime-document", kind: "runtime-document" }],
    recipes: [],
    runtime: {
      expression: "jsonata",
      namespaces: ["backend"],
      actions: ["invoke"],
      state: { backend: { result: null } },
    },
    cells: {
      controller: {
        id: "controller",
        kind: "backend-controller",
        behavior: {
          events: {
            put: [{ do: "invoke", args: { tool: "storageWrite" } }],
            get: [{ do: "invoke", args: { tool: "storageRead" } }],
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
            request: { transform: { kind: "jsonata", expr: "{'key':effect.payload.key,'value':effect.payload.value}" } },
            settlement: { transform: { kind: "jsonata", expr: "{'outcome':'completed'}" } },
          },
          storageRead: {
            operation: "read",
            contract: "storage-kv/v1",
            request: { transform: { kind: "jsonata", expr: "{'key':effect.payload.key}" } },
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
      createNativeRegistry: () => createSampleServiceKindRegistry({
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

    await host.invoke({ kind: "invoke", node: "consumer", tool: "putAsset", args: { key: "asset:a", value: { title: "A" } } });
    expect(await host.invoke({ kind: "invoke", node: "consumer", tool: "getAsset", args: { key: "asset:a" } })).toEqual({
      ops: [{ op: "set", path: "consumer.result", value: { title: "A" } }],
    });
    expect(await host.validateService("assets")).toEqual({ ok: true });
  });

  it("persists a real analyzer result through the incident backend Blueprint", async () => {
    const api = createMemoryStorageApi();
    const ref = createMemoryStorageRef("incident-analyzer-blueprint-service-test");
    const runtime = openSampleBlueprint("incident-report-explorer-2", {
      sourceId: "source-a",
      analyzerId: "incident-semantic",
      variant: "source-faithful-v1",
    });
    const state = new InMemoryStateModel(["incident2", "externalContext"]);
    state.apply([
      { op: "set", path: "incident2", value: runtime.state.incident2 },
      {
        op: "set",
        path: "externalContext",
        value: {
          sourceId: "source-a",
          analyzerId: "incident-semantic",
          variant: "source-faithful-v1",
        },
      },
      {
        op: "set",
        path: "incident2.model",
        value: { summary: "Persisted by the backend Blueprint" },
      },
    ]);
    const host = createBlueprintServiceHost(runtime, state, {
      durableStorageConnections: {
        "incident-runtime-cache": { api, ref },
      },
    });

    await host.invoke({
      kind: "invoke",
      node: "incident-cache",
      tool: "persistIncidentAnalysis",
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
    })).toMatchObject({
      sourceId: "source-a",
      analyzerId: "incident-semantic",
      variant: "source-faithful-v1",
      value: { summary: "Persisted by the backend Blueprint" },
    });
  });
});