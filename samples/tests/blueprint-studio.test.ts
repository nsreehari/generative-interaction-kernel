import assert from "node:assert/strict";
import {
  analyzeCellComposition,
  materializeBlueprint,
  runMaterializedTransition,
  type BlueprintArtifact,
  type CellDefinition,
  type PresentationDefinition,
} from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import { expect, test } from "vitest";

import studioBlueprintJson from "../blueprints/blueprint-studio/blueprint.json" with { type: "json" };
import {
  createNodeBlueprintServiceHost,
  nodeServiceOrchestrator,
} from "../apps/node-host/service-host";

const blueprint = studioBlueprintJson as BlueprintArtifact;
const payload = blueprint.payload;
const cells = payload.cells as Record<string, CellDefinition>;
const emptyOrchestrator = {} as Parameters<ReturnType<typeof nodeServiceOrchestrator>>[0];

function presentationSlotIds(presentation: PresentationDefinition): Set<string> {
  return new Set(presentation.slots.map((entry) => typeof entry === "string" ? entry : entry.id));
}

function createStudioHarness() {
  const materialized = materializeBlueprint({ blueprint });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  return {
    materialized,
    runtime,
    createOrchestrator: (state: Parameters<typeof createNodeBlueprintServiceHost>[1]) => {
      const host = createNodeBlueprintServiceHost(runtime, state, {});
      return nodeServiceOrchestrator(runtime, host, state)(emptyOrchestrator, state);
    },
  };
}

test("blueprint-studio is a fixed six-cell blueprint with flat presentation slots", () => {
  assert.equal(payload.structureMode, "fixed");
  assert.deepEqual(payload.tiers, [{ id: "runtime-document", kind: "runtime-document" }]);
  assert.deepEqual(payload.recipes, []);
  expect((payload as { projections?: unknown }).projections).toBeUndefined();

  assert.deepEqual(Object.keys(cells), [
    "blueprint-studio",
    "blueprint-list",
    "blueprint-create",
    "blueprint-delete",
    "blueprint-rw",
    "blueprint-preview",
  ]);

  expect(payload.presentation).toEqual({
    slots: [
      "studio",
      { id: "studio-header", region: "studio" },
      { id: "catalog", region: "studio" },
      { id: "catalog-list", region: "catalog" },
      { id: "catalog-actions", region: "catalog" },
      { id: "workspace", region: "studio" },
      { id: "workspace-editor", region: "workspace" },
      { id: "workspace-actions", region: "workspace" },
      { id: "workspace-preview", region: "workspace" },
    ],
    root: "studio",
  });

  const slotIds = presentationSlotIds(payload.presentation!);
  expect(cells["blueprint-studio"].potentialViews?.primary).toMatchObject({
    capability: "fluent:text",
    region: "studio-header",
  });
  expect(cells["blueprint-list"].potentialViews?.primary).toMatchObject({
    capability: "fluent:list",
    region: "catalog-list",
  });
  expect(cells["blueprint-create"].potentialViews?.primary).toMatchObject({
    capability: "primitive:form",
    region: "catalog-actions",
  });
  expect(cells["blueprint-delete"].potentialViews?.primary).toMatchObject({
    capability: "fluent:button",
    region: "workspace-actions",
  });
  expect(cells["blueprint-rw"].potentialViews?.primary).toMatchObject({
    capability: "primitive:form",
    region: "workspace-editor",
  });
  expect(cells["blueprint-preview"].potentialViews?.primary).toMatchObject({
    capability: "fluent:button",
    region: "workspace-preview",
  });

  for (const cell of Object.values(cells)) {
    for (const view of Object.values(cell.potentialViews ?? {})) {
      const region = view.region;
      expect(region).toBeDefined();
      for (const slot of Array.isArray(region) ? region : [region!]) {
        expect(slotIds.has(slot)).toBe(true);
      }
    }
  }

  expect(cells["blueprint-list"].compute).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: "blueprint-records",
      assign: "studio.blueprints",
      expression: expect.stringContaining("sources.`list-blueprints`.blueprints"),
    }),
    expect.objectContaining({
      id: "blueprint-options",
      assign: "studio.blueprintOptions",
    }),
  ]));
  expect(cells["blueprint-create"].potentialViews?.primary.bindings?.fields).toEqual(
    expect.objectContaining({
      expression: expect.stringContaining("inputs.blueprintList[source = 'repo' or published = true].id"),
    }),
  );
  expect(cells["blueprint-create"].behavior?.on?.save).toEqual(expect.arrayContaining([
    expect.objectContaining({ do: "invoke", control: expect.objectContaining({ tool: "createBlueprintDraft" }) }),
    expect.objectContaining({ do: "invoke", control: expect.objectContaining({ tool: "cloneBlueprintDraft" }) }),
  ]));
  expect(cells["blueprint-delete"].behavior?.on?.press).toEqual([
    expect.objectContaining({ do: "invoke", control: expect.objectContaining({ tool: "deleteBlueprint" }) }),
  ]);
  expect(cells["blueprint-rw"].behavior?.on).toMatchObject({
    save: expect.any(Array),
    "delete-draft": [
      expect.objectContaining({ do: "invoke", control: expect.objectContaining({ tool: "deleteDraft" }) }),
    ],
  });
  expect(cells["blueprint-preview"].behavior?.on?.press).toEqual([
    expect.objectContaining({ do: "invoke", control: expect.objectContaining({ tool: "promoteDraft" }) }),
  ]);

  assert.deepEqual(analyzeCellComposition(Object.values(cells)).diagnostics, []);
  expect(() => openBlueprint(materializeBlueprint({ blueprint }).payload.terminalBlueprint)).not.toThrow();
});

test("blueprint-studio loads catalog records through the blueprint-list compute/output chain", async () => {
  const { materialized, runtime, createOrchestrator } = createStudioHarness();
  const ready = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    syncExternal: true,
    events: [],
    createOrchestrator,
  });
  const studio = ready.state.studio as {
    blueprints: Array<{ id: string }>;
    blueprintOptions: Array<{ value: string; label: string }>;
  };

  expect(studio.blueprints.map(({ id }) => id)).toContain("portfolio-tracker-new");
  expect(studio.blueprintOptions).toContainEqual(expect.objectContaining({
    value: "portfolio-tracker-new",
    label: expect.stringContaining("portfolio-tracker-new"),
  }));
  expect(runtime.definition.payload.cells?.["blueprint-list"]?.outputs?.[0]).toEqual(
    expect.objectContaining({ token: "blueprintList", from: "computed.studio.blueprints" }),
  );
});

test("blueprint-studio preserves the real cell event contracts and named effects", () => {
  expect(cells["blueprint-list"].events).toEqual({
    select: { payloadSchema: { type: "object" } },
  });
  expect(cells["blueprint-create"].metadata?.namedEffects).toEqual([
    "create-blueprint-draft",
    "clone-blueprint-draft",
  ]);
  expect(cells["blueprint-create"].events).toEqual({
    save: { payloadSchema: { type: "object" } },
  });
  expect(cells["blueprint-delete"].metadata?.namedEffects).toEqual(["delete-blueprint"]);
  expect(cells["blueprint-delete"].events).toEqual({
    press: { payloadSchema: { type: "object" } },
  });
  expect(cells["blueprint-rw"].metadata?.namedEffects).toEqual([
    "create-draft",
    "save-draft",
    "delete-draft",
  ]);
  expect(cells["blueprint-rw"].events).toEqual({
    save: { payloadSchema: { type: "object" } },
    "delete-draft": { payloadSchema: { type: "object" } },
  });
  expect(cells["blueprint-preview"].metadata?.namedEffects).toEqual(["promote-draft"]);
  expect(cells["blueprint-preview"].events).toEqual({
    press: { payloadSchema: { type: "object" } },
  });
});
