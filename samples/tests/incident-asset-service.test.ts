import { DefaultServiceHost, ServiceKindRegistry } from "@gik/controlface";
import { createMemoryStorageApi, createMemoryStorageRef } from "@gik/durable-runtime/storage/memory";
import { InMemoryStateModel, JsonataExpressionProvider, type Json, type ServiceDeclaration } from "@gik/kernel";
import { describe, expect, it } from "vitest";

import { createSampleCatalogBlueprintRegistry } from "../catalog/blueprint-catalog";
import {
  bootstrapAssetValue,
  bootstrapAssetValues,
  createBootstrapStorageConnection,
  type BlueprintBootstrapAssets,
} from "../catalog/blueprint-bootstrap-assets";
import { createBlueprintServiceResolver } from "../apps/shared/blueprint-service-resolver";
import { createSampleServiceKindRegistry } from "../service-kinds";
import incidentAssetSeed from "../blueprints/incident-analysis-assets/bootstrap-assets/catalog.json" with { type: "json" };

const seed = incidentAssetSeed as BlueprintBootstrapAssets;
const incidentSourceDocuments = bootstrapAssetValues<{
  id: string;
  label: string;
  content: string;
}>(seed, "source:");

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
  const connection = createBootstrapStorageConnection(
    createMemoryStorageApi(),
    createMemoryStorageRef(`incident-assets-test:${crypto.randomUUID()}`),
    seed,
  );
  const serviceOptions = { durableStorageConnections: { "blueprint-state": connection } };
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
      instanceId: "incident-consumer:test",
      createServiceRegistry: () => createSampleServiceKindRegistry(serviceOptions),
    }),
    state: new InMemoryStateModel([]),
    expression: new JsonataExpressionProvider({ safe: true }),
  });
}

async function invoke(host: DefaultServiceHost, operation: string, args: Record<string, Json> = {}) {
  const result = await host.invoke({
    kind: "invoke",
    node: "consumer",
    control: { tool: operation },
    data: args,
  });
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
      source_report_key: "password-spray-mailbox",
    })).toEqual({
      assets: [{
        source_report_key: "password-spray-mailbox",
        analysis_key: "incident-intelligence/glance-focused-v1",
      }, {
        source_report_key: "password-spray-mailbox",
        analysis_key: "semantic",
      }],
    });
    expect(await invoke(host, "get-asset", {
      source_report_key: "password-spray-mailbox",
      analysis_key: "semantic",
    })).toEqual(bootstrapAssetValue(seed, "seed-asset:password-spray-mailbox/semantic"));
  });

  it("writes, prefers, deletes, and clears runtime-authored assets", async () => {
    const host = createHost();
    const coordinates = {
      source_report_key: "password-spray-mailbox",
      analysis_key: "blueprint:test-analyzer@1.0.0",
    };
    const saved_report_envelope = {
      arbitrary: { nested: ["analyzer", "owned", "content"] },
      version: 17,
    };
    expect(await invoke(host, "put-asset", { ...coordinates, saved_report_envelope }))
      .toEqual(saved_report_envelope);
    expect(await invoke(host, "get-asset", coordinates)).toEqual(saved_report_envelope);
    expect(await invoke(host, "delete-asset", coordinates)).toEqual({ deleted: true });
    expect(await invoke(host, "get-asset", coordinates)).toBeNull();
    await invoke(host, "put-asset", { ...coordinates, saved_report_envelope });
    expect(await invoke(host, "clear-assets")).toEqual({ cleared: 1 });
    expect(await invoke(host, "get-asset", coordinates)).toBeNull();
  });
});
