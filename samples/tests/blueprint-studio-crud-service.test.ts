import { DefaultServiceHost, ServiceKindRegistry } from "@gik/controlface";
import {
  createMemoryStorageApi,
  createMemoryStorageRef,
} from "@gik/durable-runtime/storage/memory";
import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  type Json,
  type ServiceDeclaration,
} from "@gik/kernel";
import { describe, expect, it } from "vitest";

import { createBlueprintServiceResolver } from "../apps/shared/blueprint-service-resolver";
import {
  bindBlueprintStorage,
  createBlueprintStorageConnectionFactory,
} from "../apps/shared/blueprint-storage";
import {
  createSampleCatalogBlueprintRegistry,
  getSampleBlueprintCatalog,
  resolveSampleBlueprintSource,
} from "../catalog/blueprint-catalog";
import { createSampleServiceKindRegistry } from "../service-kinds";

const operations = {
  list: "list-blueprints",
  fetch: "fetch-blueprint",
  create: "create-blueprint",
  update: "update-blueprint",
  delete: "delete-blueprint",
} as const;

function createHost(): DefaultServiceHost {
  const blueprintStorage = createBlueprintStorageConnectionFactory(
    createMemoryStorageApi(),
    createMemoryStorageRef,
  );
  const declarations: Record<string, ServiceDeclaration> = {
    studio: {
      blueprint: { $ref: "blueprint:blueprint-studio-crud@1.0.0" },
      version: "1",
      operations: Object.fromEntries(Object.entries(operations).map(([name, operation]) => [
        name,
        {
          operation,
          contract: `blueprint-studio-${name}/v1`,
          request: {
            transform: {
              kind: "jsonata",
              expr: "input",
            },
          },
          settlement: {
            transform: {
              kind: "jsonata",
              expr: "{'detail':{'response':response}}",
            },
          },
        },
      ])),
    },
  };
  return new DefaultServiceHost({
    blueprintId: "blueprint-studio-test",
    blueprintRevision: "1",
    declarations,
    registry: new ServiceKindRegistry(),
    blueprintServices: createBlueprintServiceResolver({
      registry: createSampleCatalogBlueprintRegistry(),
      instanceId: `blueprint-studio-test:${crypto.randomUUID()}`,
      createServiceRegistry: (context) => createSampleServiceKindRegistry(
        bindBlueprintStorage({}, blueprintStorage, context),
      ),
    }),
    state: new InMemoryStateModel([]),
    expression: new JsonataExpressionProvider({ safe: true }),
  });
}

async function invoke(
  host: DefaultServiceHost,
  operation: keyof typeof operations,
  input: Record<string, Json> = {},
) {
  const result = await host.invoke({
    kind: "invoke",
    node: "studio-test",
    control: { tool: operation },
    data: input,
  });
  return result?.detail?.response;
}

describe("Blueprint Studio CRUD service", () => {
  it("lists and fetches repository Blueprints from bootstrap assets", async () => {
    const host = createHost();
    const listed = await invoke(host, "list") as { blueprints: Array<{ id: string }> };

    expect(listed.blueprints.map(({ id }) => id)).toEqual(getSampleBlueprintCatalog().blueprints);
    expect(listed.blueprints.map(({ id }) => id)).not.toContain("manage-blueprints");
    const fetched = await invoke(host, "fetch", { id: "portfolio-tracker-new" }) as Record<string, unknown>;
    expect(fetched).toMatchObject({
      id: "portfolio-tracker-new",
      source: "repo",
      readonly: true,
      artifact: {
        payload: {
          id: "portfolio-tracker-new",
        },
      },
    });
    expect(fetched).not.toHaveProperty("contextFormSpec");
    expect(fetched).not.toHaveProperty("initialExternalContext");
  });

  it("creates, updates, and deletes user Blueprints without mutating repository entries", async () => {
    const host = createHost();
    const artifact = structuredClone(resolveSampleBlueprintSource("portfolio-tracker-new"));
    artifact.payload.id = "studio-user-blueprint";

    expect(await invoke(host, "create", {
      id: artifact.payload.id,
      blueprint: artifact as unknown as Json,
    })).toMatchObject({ created: true });
    expect(await invoke(host, "fetch", { id: artifact.payload.id })).toMatchObject({
      id: artifact.payload.id,
      source: "user",
      readonly: false,
    });

    artifact.payload.version = "2.0.0";
    expect(await invoke(host, "update", {
      id: artifact.payload.id,
      blueprint: artifact as unknown as Json,
    })).toMatchObject({ updated: true });
    expect(await invoke(host, "fetch", { id: artifact.payload.id })).toMatchObject({
      version: "2.0.0",
      artifact: { payload: { version: "2.0.0" } },
    });

    expect(await invoke(host, "delete", { id: "portfolio-tracker-new" }))
      .toMatchObject({ deleted: false, error: "Repository Blueprints are read-only" });
    expect(await invoke(host, "delete", { id: artifact.payload.id }))
      .toEqual({ deleted: true, id: artifact.payload.id });
    expect(await invoke(host, "fetch", { id: artifact.payload.id })).toBeNull();
  });
});
