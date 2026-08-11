import { createMemoryStorageApi, createMemoryStorageRef } from "@gik/durable-runtime/storage/memory";
import type { NativeServiceDeclaration } from "@gik/kernel";
import { describe, expect, it } from "vitest";

import { createSampleServiceKindRegistry } from "../service-kinds";

const settlement = { transform: { kind: "jsonata" as const, expr: "{'outcome':'completed'}" } };

function declaration(): NativeServiceDeclaration {
  return {
    kind: "durable-storage",
    version: "1",
    config: { connection: "incident-assets" },
    operations: {
      readAsset: { operation: "read", contract: "storage-kv/v1", settlement },
      writeAsset: { operation: "write", contract: "storage-kv/v1", settlement },
      listAssets: { operation: "listKeys", contract: "storage-kv/v1", settlement },
      deleteAsset: { operation: "delete", contract: "storage-kv/v1", settlement },
    },
  };
}

describe("durable-storage service kind", () => {
  it("routes logical connections to host-owned StorageApi refs", async () => {
    const registry = createSampleServiceKindRegistry({
      durableStorageConnections: {
        "incident-assets": {
          api: createMemoryStorageApi(),
          ref: createMemoryStorageRef("incident-assets-test"),
        },
      },
    });
    const adapter = await registry.materialize({
      blueprintId: "incident-backend",
      blueprintRevision: "1",
      serviceId: "storage",
    }, declaration());
    const context = {};
    const request = (operation: string, input: Record<string, unknown>) => ({
      id: crypto.randomUUID(),
      providerId: adapter.provider.id,
      capabilityId: "storage-kv/v1",
      createdAt: new Date().toISOString(),
      service: "storage",
      operation,
      input,
    });

    await adapter.execute(request("write", { key: "asset:a", value: { title: "A" } }), context);
    await adapter.execute(request("write", { key: "other:b", value: { title: "B" } }), context);
    expect((await adapter.execute(request("read", { key: "asset:a" }), context)).output).toEqual({ title: "A" });
    expect((await adapter.execute(request("listKeys", { prefix: "asset:" }), context)).output).toEqual(["asset:a"]);
    await adapter.execute(request("delete", { key: "asset:a" }), context);
    expect((await adapter.execute(request("read", { key: "asset:a" }), context)).output).toBeNull();
  });
});