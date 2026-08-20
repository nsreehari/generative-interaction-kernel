import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import { createBlueprint } from "@gik/blueprint";
import {
  getSampleBlueprintCatalog,
  installUserBlueprints,
} from "../../../../catalog/blueprint-catalog";
import { createSampleBlueprintHostRegistry } from "./hosted-blueprint-registry";

const context = {
  parentBlueprintId: "shell",
  parentInstanceId: "shell:case-7",
  cellId: "analysis-slot",
};

function localBlueprint(id: string, version = "1.0.0") {
  return createBlueprint({
    id,
    kind: "runtime-blueprint",
    version,
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { version: "test/1", capabilities: {} },
  });
}

beforeEach(() => installUserBlueprints({}));

test("resolves browser-local JSON-only Blueprints without native authority", async () => {
  installUserBlueprints({ "local-analysis": localBlueprint("local-analysis") });

  const resolved = await createSampleBlueprintHostRegistry().resolve(
    { scheme: "blueprint", id: "local-analysis" },
    context,
  );

  assert.equal(resolved.blueprint.payload.id, "local-analysis");
  assert.equal(resolved.reference.version, "1.0.0");
  assert.equal(resolved.native, undefined);
});

test("rejects unavailable pinned versions", async () => {
  await assert.rejects(
    async () => createSampleBlueprintHostRegistry().resolve(
      { scheme: "blueprint", id: "portfolio-tracker-new", version: "999.0.0" },
      context,
    ),
    /version '999.0.0' is unavailable/,
  );
});

test("repository registrations are authoritative and receive child lifecycle identity", async () => {
  installUserBlueprints({
    "portfolio-tracker-new": localBlueprint("portfolio-tracker-new", "999.0.0"),
  });
  let received: unknown;
  const registry = createSampleBlueprintHostRegistry({
    createProposalStore(blueprintId, childContext) {
      received = { blueprintId, childContext };
      return {} as never;
    },
  });

  const resolved = await registry.resolve({ scheme: "blueprint", id: "portfolio-tracker-new" }, context);
  assert.notEqual(resolved.blueprint.payload.version, "999.0.0");
  assert.ok(resolved.native);
  assert.deepEqual(received, { blueprintId: "portfolio-tracker-new", childContext: context });
});

test("resolves a stored draft reference through the normal hosted Blueprint registry", async () => {
  const draft = localBlueprint("portfolio-tracker-new.draft", "1.1.0");
  const storageIdentities: Array<{ blueprintId: string; instanceId: string }> = [];
  const registry = createSampleBlueprintHostRegistry({
    blueprintStorageRootInstanceId: "blueprint-studio:default",
    blueprintStorage: (identity) => {
      storageIdentities.push(identity);
      return {
      ref: "memory:studio",
      api: {
        async dispatch(request) {
          if (request.operation !== "read" || request.args?.[0] !== "blueprint:portfolio-tracker-new") {
            return null;
          }
          return {
            id: "portfolio-tracker-new",
            ref: "blueprint:portfolio-tracker-new@1.0.0",
            artifact: localBlueprint("portfolio-tracker-new"),
            draft: {
              id: draft.payload.id,
              ref: "blueprint:portfolio-tracker-new.draft@1.1.0",
              artifact: draft,
            },
          };
        },
      },
      };
    },
  });

  const resolved = await registry.resolve(
    { scheme: "blueprint", id: "portfolio-tracker-new.draft", version: "1.1.0" },
    {
      parentBlueprintId: "blueprint-studio",
      parentInstanceId: "blueprint-studio",
      cellId: "blueprint-draft-preview-content",
    },
  );

  assert.equal(resolved.blueprint.payload.id, "portfolio-tracker-new.draft");
  assert.equal(resolved.reference.version, "1.1.0");
  assert.equal(resolved.native, undefined);
  assert.deepEqual(storageIdentities[0], {
    blueprintId: "blueprint-studio-crud",
    instanceId: "blueprint-studio:default/services/blueprint-studio@1.0.0/services/blueprint-studio-crud@1.0.0",
  });

  const unversioned = await registry.resolve(
    { scheme: "blueprint", id: "portfolio-tracker-new.draft" },
    {
      parentBlueprintId: "portfolio-tracker-new.draft",
      parentInstanceId: "blueprint-studio/cells/blueprint-draft-preview-content",
      cellId: "nested-draft-reference",
    },
  );
  assert.equal(unversioned.blueprint.payload.id, "portfolio-tracker-new.draft");
  assert.equal(unversioned.reference.version, "1.1.0");
});

test("retains repository runtime assembly when resolving its bootstrapped storage artifact", async () => {
  const repository = getSampleBlueprintCatalog().seedEntries["portfolio-tracker-new"];
  const registry = createSampleBlueprintHostRegistry({
    blueprintStorage: () => ({
      ref: "memory:studio",
      api: {
        async dispatch() {
          return {
            id: repository.payload.id,
            ref: `blueprint:${repository.payload.id}@${repository.payload.version}`,
            artifact: repository,
            draft: null,
          };
        },
      },
    }),
  });

  const resolved = await registry.resolve(
    { scheme: "blueprint", id: repository.payload.id },
    context,
  );

  assert.ok(resolved.native);
  assert.ok(resolved.native.wrapOrchestrator);
});

test("keeps stored Blueprint resolution isolated by Studio instance ancestry", async () => {
  const registry = createSampleBlueprintHostRegistry({
    blueprintStorage: ({ instanceId }) => {
      const version = instanceId.startsWith("studio-a/") ? "1.1.0" : "2.1.0";
      const draft = localBlueprint("isolated.draft", version);
      return {
        ref: `memory:${instanceId}`,
        api: {
          async dispatch() {
            return {
              id: "isolated",
              draft: {
                id: draft.payload.id,
                ref: `blueprint:isolated.draft@${version}`,
                artifact: draft,
              },
            };
          },
        },
      };
    },
  });

  await registry.resolve(
    { scheme: "blueprint", id: "isolated.draft", version: "1.1.0" },
    { parentBlueprintId: "blueprint-studio", parentInstanceId: "studio-a", cellId: "preview-a" },
  );
  await registry.resolve(
    { scheme: "blueprint", id: "isolated.draft", version: "2.1.0" },
    { parentBlueprintId: "blueprint-studio", parentInstanceId: "studio-b", cellId: "preview-b" },
  );
  const descendantOfA = await registry.resolve(
    { scheme: "blueprint", id: "isolated.draft" },
    {
      parentBlueprintId: "isolated.draft",
      parentInstanceId: "studio-a/cells/preview-a",
      cellId: "nested",
    },
  );

  assert.equal(descendantOfA.blueprint.payload.version, "1.1.0");
  await assert.rejects(
    async () => registry.resolve(
      { scheme: "blueprint", id: "isolated.draft" },
      { parentBlueprintId: "other-shell", parentInstanceId: "other-shell", cellId: "nested" },
    ),
    /Unknown hosted Blueprint 'isolated.draft'/,
  );
});