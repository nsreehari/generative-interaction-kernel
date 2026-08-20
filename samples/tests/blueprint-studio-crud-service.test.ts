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
  openSampleBlueprint,
  resolveSampleBlueprintSource,
} from "../catalog/blueprint-catalog";
import { createSampleServiceKindRegistry } from "../service-kinds";

const operations = {
  list: "list-blueprints",
  fetch: "fetch-blueprint",
  create: "create-blueprint",
  update: "update-blueprint",
  delete: "delete-blueprint",
  createDraft: "create-draft",
  createBlueprintDraft: "create-blueprint-draft",
  cloneBlueprintDraft: "clone-blueprint-draft",
  saveDraft: "save-draft",
  deleteDraft: "delete-draft",
  promoteDraft: "promote-draft",
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
  it("preserves the nested Blueprint validator input through lowering", () => {
    const runtime = openSampleBlueprint("blueprint-studio-crud");
    expect(runtime.definition.payload.services?.storage?.operations.readBlueprintForSaveDraft?.request)
      .toMatchObject({
        validatorInput: { kind: "jsonata", expr: "effect.data.blueprint" },
        validators: [expect.objectContaining({ kind: "blueprint" })],
      });
  });

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
      .toMatchObject({ deleted: true, id: artifact.payload.id });
    expect(await invoke(host, "fetch", { id: artifact.payload.id })).toBeNull();
  });

  it("clones a repository Blueprint into a new user draft without mutating the source", async () => {
    const host = createHost();

    expect(await invoke(host, "cloneBlueprintDraft", {
      sourceId: "portfolio-tracker-new",
      id: "portfolio-clone",
      kind: "portfolio-blueprint",
      version: "2.0.0",
    })).toMatchObject({
      draftCreated: true,
      blueprint: {
        id: "portfolio-clone",
        artifact: null,
        draft: {
          id: "portfolio-clone.draft",
          artifact: {
            payload: {
              id: "portfolio-clone.draft",
              kind: "portfolio-blueprint",
              version: "2.0.0",
              contextFormSpec: expect.any(Object),
              recipes: expect.any(Array),
            },
          },
        },
      },
    });
    expect(await invoke(host, "fetch", { id: "portfolio-tracker-new" })).toMatchObject({
      readonly: true,
      draft: null,
      artifact: { payload: { id: "portfolio-tracker-new", version: "1.0.0" } },
    });
    expect(await invoke(host, "createDraft", { id: "portfolio-tracker-new" })).toMatchObject({
      draftCreated: false,
      error: "Repository Blueprints are read-only; clone the Blueprint to edit it",
    });
  });

  it("keeps one independently persisted draft alongside each Blueprint entry", async () => {
    const host = createHost();
    await invoke(host, "cloneBlueprintDraft", {
      sourceId: "portfolio-tracker-new",
      id: "portfolio-draftable",
      kind: "portfolio-blueprint",
      version: "1.0.0",
    });
    await invoke(host, "cloneBlueprintDraft", {
      sourceId: "incident-analysis-new-shell",
      id: "incident-draftable",
      kind: "incident-analysis-blueprint",
      version: "1.0.0",
    });

    const portfolio = await invoke(host, "fetch", { id: "portfolio-draftable" }) as {
      draft: { artifact: { payload: { version: string } } };
    };
    const edited = structuredClone(portfolio.draft.artifact);
    edited.payload.version = "1.1.0";
    expect(await invoke(host, "saveDraft", {
      id: "portfolio-draftable",
      blueprint: edited as unknown as Json,
    })).toMatchObject({
      draftSaved: true,
      blueprint: {
        id: "portfolio-draftable",
        draft: {
          version: "1.1.0",
          ref: "blueprint:portfolio-draftable.draft@1.1.0",
          revision: 2,
        },
      },
    });

    expect(await invoke(host, "promoteDraft", { id: "portfolio-draftable" })).toMatchObject({
      promoted: true,
      blueprint: {
        id: "portfolio-draftable",
        version: "1.1.0",
        source: "user",
        readonly: false,
        ref: "blueprint:portfolio-draftable@1.1.0",
        draft: null,
        artifact: { payload: { id: "portfolio-draftable", version: "1.1.0" } },
      },
    });
    expect(await invoke(host, "fetch", { id: "incident-draftable" })).toMatchObject({
      draft: { id: "incident-draftable.draft" },
    });
  });

  it("does not allow an edited draft ID to target another Blueprint entry", async () => {
    const host = createHost();
    await invoke(host, "cloneBlueprintDraft", {
      sourceId: "portfolio-tracker-new",
      id: "portfolio-draftable",
      kind: "portfolio-blueprint",
      version: "1.0.0",
    });
    await invoke(host, "cloneBlueprintDraft", {
      sourceId: "incident-analysis-new-shell",
      id: "incident-draftable",
      kind: "incident-analysis-blueprint",
      version: "1.0.0",
    });
    const portfolio = await invoke(host, "fetch", { id: "portfolio-draftable" }) as {
      draft: { artifact: { payload: { id: string } } };
    };
    const edited = structuredClone(portfolio.draft.artifact);
    edited.payload.id = "incident-draftable.draft";

    expect(await invoke(host, "saveDraft", {
      id: "portfolio-draftable",
      blueprint: edited as unknown as Json,
    })).toMatchObject({
      draftSaved: false,
      error: "Draft Blueprint ID does not match the selected Blueprint",
      id: "portfolio-draftable",
    });
    expect(await invoke(host, "fetch", { id: "incident-draftable" })).toMatchObject({
      draft: {
        revision: 1,
        artifact: { payload: { id: "incident-draftable.draft" } },
      },
    });

    await expect(invoke(host, "saveDraft", {
      id: "portfolio-draftable",
      blueprint: {
        payload: { id: "portfolio-draftable.draft" },
      },
    })).rejects.toThrow(/Service request validation failed.*draft Blueprint is invalid/i);
    expect(await invoke(host, "fetch", { id: "portfolio-draftable" })).toMatchObject({
      draft: {
        revision: 1,
        artifact: { payload: { id: "portfolio-draftable.draft" } },
      },
    });
  });

  it("creates a new logical entry as a draft and can discard it independently", async () => {
    const host = createHost();
    const artifact = structuredClone(resolveSampleBlueprintSource("portfolio-tracker-new"));
    artifact.payload.id = "new-studio-blueprint";

    expect(await invoke(host, "createBlueprintDraft", {
      id: artifact.payload.id,
      blueprint: artifact as unknown as Json,
    })).toMatchObject({
      draftCreated: true,
      blueprint: {
        id: "new-studio-blueprint",
        artifact: null,
        draft: {
          id: "new-studio-blueprint.draft",
          artifact: { payload: { id: "new-studio-blueprint.draft" } },
        },
      },
    });
    expect(await invoke(host, "deleteDraft", { id: artifact.payload.id })).toMatchObject({
      draftDeleted: true,
      deleted: true,
      id: artifact.payload.id,
    });
    expect(await invoke(host, "fetch", { id: artifact.payload.id })).toBeNull();
    expect((await invoke(host, "list") as { blueprints: Array<{ id: string }> }).blueprints)
      .not.toContainEqual(expect.objectContaining({ id: artifact.payload.id }));
  });
});
