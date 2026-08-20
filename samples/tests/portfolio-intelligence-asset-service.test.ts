import { DefaultServiceHost, ServiceKindRegistry } from "@gik/controlface";
import { createMemoryStorageApi, createMemoryStorageRef } from "@gik/durable-runtime/storage/memory";
import { InMemoryStateModel, JsonataExpressionProvider, type Json, type ServiceDeclaration } from "@gik/kernel";
import { expect, test } from "vitest";

import { createBlueprintServiceResolver } from "../apps/shared/blueprint-service-resolver";
import { createSampleCatalogBlueprintRegistry } from "../catalog/blueprint-catalog";
import { createSampleServiceKindRegistry } from "../service-kinds";

function createHost() {
  const serviceOptions = {
    durableStorageConnections: {
      "blueprint-state": {
        api: createMemoryStorageApi(),
        ref: createMemoryStorageRef(`portfolio-assets-test:${crypto.randomUUID()}`),
      },
    },
  };
  const declarations: Record<string, ServiceDeclaration> = {
    assets: {
      blueprint: { $ref: "blueprint:portfolio-intelligence-assets@1.0.0" },
      version: "1",
      operations: Object.fromEntries(["get-report", "put-report"].map((operation) => [operation, {
        operation,
        contract: "saved-portfolio-report-envelope/v1",
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
    blueprintId: "portfolio-consumer",
    blueprintRevision: "1",
    declarations,
    registry: new ServiceKindRegistry(),
    blueprintServices: createBlueprintServiceResolver({
      registry: createSampleCatalogBlueprintRegistry(),
      instanceId: "portfolio-consumer:test",
      createServiceRegistry: () => createSampleServiceKindRegistry(serviceOptions),
    }),
    state: new InMemoryStateModel([]),
    expression: new JsonataExpressionProvider({ safe: true }),
  });
}

async function invoke(host: DefaultServiceHost, operation: string, data: Record<string, Json>) {
  const result = await host.invoke({
    kind: "invoke",
    node: "consumer",
    control: { tool: operation },
    data,
  });
  return result?.detail?.response;
}

test("portfolio intelligence assets persist and retrieve a report envelope", async () => {
  const host = createHost();
  const identity = {
    portfolio_key: "portfolio-1",
    analysis_key: "copilot/simple-markdown",
  };
  const savedReport = {
    asOf: "2026-08-20T00:00:00.000Z",
    report: {
      gik: "0.1",
      type: "blueprint",
      payload: { id: "report" },
    },
  };

  expect(await invoke(host, "put-report", {
    ...identity,
    saved_report_envelope: savedReport,
  })).toEqual(savedReport);
  expect(await invoke(host, "get-report", identity)).toEqual(savedReport);
});
