import { DefaultServiceHost, ServiceKindRegistry } from "@gik/controlface";
import { createMemoryStorageApi, createMemoryStorageRef } from "@gik/durable-runtime/storage/memory";
import { InMemoryStateModel, JsonataExpressionProvider, type Json, type ServiceDeclaration } from "@gik/kernel";
import { describe, expect, it } from "vitest";

import { createSampleCatalogBlueprintRegistry } from "../catalog/blueprint-catalog";
import {
  createSeededStorageConnection,
  storageSeedValues,
  type StorageSeedCatalog,
} from "../catalog/storage-seed";
import { createBlueprintServiceResolver } from "../apps/shared/blueprint-service-resolver";
import { createSampleServiceKindRegistry } from "../service-kinds";
import incidentAssetSeed from "../blueprints/incident-analysis-assets/seed-data/catalog.json" with { type: "json" };

const seed = incidentAssetSeed as StorageSeedCatalog;
const incidentSourceDocuments = storageSeedValues<{ id: string; label: string; content: string }>(seed, "source:");
const incidentCachedAssets = storageSeedValues<Record<string, Json>>(seed, "seed-asset:");

const operationNames = [
  "list-sources",
  "get-source",
  "list-assets",
  "get-asset",
  "put-asset",
  "delete-asset",
  "clear-assets",
] as const;

function createHost() {
  const connection = createSeededStorageConnection(
    createMemoryStorageApi(),
    createMemoryStorageRef(`${seed.namespace}:${crypto.randomUUID()}`),
    seed,
  );
  const nativeOptions = { durableStorageConnections: { "incident-runtime-cache": connection } };
  const declarations: Record<string, ServiceDeclaration> = {
    assets: {
      blueprint: { $ref: "blueprint:incident-analysis-assets@1.0.0" },
      version: "1",
      operations: Object.fromEntries(operationNames.map((operation) => [operation, {
        operation,
        contract: "incident-assets/v1",
        settlement: {
          transform: {
            kind: "jsonata",
            expr: "{'outcome':'completed','detail':{'response':response}}",
          },
        },
      }])),
    },
  };
  return new DefaultServiceHost({
    blueprintId: "incident-consumer",
    blueprintRevision: "1",
    declarations,
    registry: new ServiceKindRegistry(),
    blueprintServices: createBlueprintServiceResolver({
      registry: createSampleCatalogBlueprintRegistry(),
      createNativeRegistry: () => createSampleServiceKindRegistry(nativeOptions),
    }),
    state: new InMemoryStateModel([]),
    expression: new JsonataExpressionProvider({ safe: true }),
  });
}

async function invoke(host: DefaultServiceHost, operation: string, args: Record<string, Json> = {}) {
  const result = await host.invoke({ kind: "invoke", node: "consumer", tool: operation, args });
  return result?.detail?.response;
}

describe("incident asset Blueprint service", () => {
  it("lists and retrieves packaged source documents", async () => {
    const host = createHost();
    expect(await invoke(host, "list-sources")).toEqual({
      sources: incidentSourceDocuments.map(({ id, label }) => ({ id, label })),
    });
    expect(await invoke(host, "get-source", { sourceId: "password-spray-mailbox" }))
      .toEqual(incidentSourceDocuments[0]);
  });

  it("lists and retrieves packaged analysis assets", async () => {
    const host = createHost();
    expect(await invoke(host, "list-assets", {
      sourceId: "password-spray-mailbox",
      analyzerId: "incident-semantic",
    })).toEqual({
      assets: [{ sourceId: "password-spray-mailbox", analyzerId: "incident-semantic", variant: "source-faithful-v1" }],
    });
    expect(await invoke(host, "get-asset", {
      sourceId: "password-spray-mailbox",
      analyzerId: "incident-semantic",
      variant: "source-faithful-v1",
    })).toEqual(incidentCachedAssets[0]);
  });

  it("writes, prefers, deletes, and clears runtime-authored assets", async () => {
    const host = createHost();
    const coordinates = {
      sourceId: "password-spray-mailbox",
      analyzerId: "incident-semantic",
      variant: "runtime-v2",
    };
    await invoke(host, "put-asset", { ...coordinates, value: { summary: "runtime" } });
    expect(await invoke(host, "get-asset", coordinates)).toMatchObject({
      ...coordinates,
      value: { summary: "runtime" },
    });
    expect(await invoke(host, "delete-asset", coordinates)).toEqual({ deleted: true });
    expect(await invoke(host, "get-asset", coordinates)).toBeNull();
    await invoke(host, "put-asset", { ...coordinates, value: { summary: "runtime" } });
    expect(await invoke(host, "clear-assets")).toEqual({ cleared: 1 });
    expect(await invoke(host, "get-asset", coordinates)).toBeNull();
  });
});