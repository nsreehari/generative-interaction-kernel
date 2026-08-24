import assert from "node:assert/strict";
import {
  analyzeCellComposition,
  materializeBlueprint,
  runMaterializedTransition,
  type BlueprintArtifact,
  type CellDefinition,
} from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import {
  createMemoryStorageApi,
  createMemoryStorageRef,
} from "@gik/durable-runtime/storage/memory";
import { expect, test } from "vitest";

import studioBlueprintJson from "../blueprints/blueprint-studio/blueprint.json" with { type: "json" };
import {
  createBlueprintStorageConnectionFactory,
  type BlueprintStorageConnectionFactory,
} from "../apps/shared/blueprint-storage";
import {
  createNodeBlueprintServiceHost,
  nodeServiceOrchestrator,
} from "../apps/node-host/service-host";

const blueprint = studioBlueprintJson as BlueprintArtifact;
const payload = blueprint.payload;
const cells = payload.cells as Record<string, CellDefinition>;
const emptyOrchestrator = {} as Parameters<ReturnType<typeof nodeServiceOrchestrator>>[0];

function createStudioHarness(blueprintStorage?: BlueprintStorageConnectionFactory) {
  const materialized = materializeBlueprint({ blueprint });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  return {
    materialized,
    runtime,
    createOrchestrator: (state: Parameters<typeof createNodeBlueprintServiceHost>[1]) => {
      const host = createNodeBlueprintServiceHost(runtime, state, {}, {}, undefined, blueprintStorage);
      return nodeServiceOrchestrator(runtime, host, state)(emptyOrchestrator, state);
    },
  };
}

function studioState(state: Record<string, unknown>) {
  return state.studio as {
    selectedBlueprintId: string | null;
    selected: unknown;
    blueprintCreateSaving: boolean;
    blueprintCreateError: string;
  };
}

function saveEvent(node: string, values: Record<string, unknown>) {
  return { node, name: "save", payload: { values } };
}

function blueprintCreateEventNode(materialized: ReturnType<typeof materializeBlueprint>): string {
  const owners = materialized.payload.eventNodeOwners ?? {};
  const node = Object.entries(owners).find(([, owner]) => owner === "blueprint-create")?.[0];
  if (!node) throw new Error("blueprint-create has no compiled event node in this materialization");
  return node;
}


// Blueprint-studio's own authored structure (Cell ids, presentation tree, capability/region
// mappings, compute-assign names, behavior.on/tool names, event schemas) is intentionally NOT
// restated here as hardcoded TypeScript expectations -- doing so would duplicate the one real,
// governed authority (this Blueprint's own JSON) into a second, hand-maintained shape that must be
// kept in sync by hand and can silently drift, exactly the "hidden parallel product specification"
// the platform's own architectural invariants forbid. `validateBlueprintArtifact`/
// `analyzeCellComposition`/`materializeBlueprint` are themselves the real, single source of
// structural truth; this file only smoke-checks that the artifact is valid and materializes, and
// exercises real Studio *behavior* by driving the real Blueprint through the real Kernel (below).
test("blueprint-studio validates and materializes without restating its authored structure", () => {
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

// blueprint-create's save feedback (primitive:form's saving/saveError props) is wired entirely
// through ordinary Blueprint state: behavior.on.save assigns studio.blueprintCreateSaving=true
// before invoking, and the operation's own settlement (success or the CRUD service's own
// business-level "already exists"/"not found" failure, which settles normally with no
// response.blueprint) or failureSettlement (a genuine service exception) resets it to false and
// records studio.blueprintCreateError. These two tests drive the real Blueprint/Kernel/service
// stack end to end rather than asserting against the authored JSON, per this file's own
// no-restating-authored-structure rule above.
test("creating a new Blueprint through blueprint-create clears saving with no error and selects the draft", async () => {
  const { materialized, createOrchestrator } = createStudioHarness();
  const eventNode = blueprintCreateEventNode(materialized);
  const ready = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    events: [saveEvent(eventNode, { id: "studio-create-ok", kind: "runtime-blueprint", version: "1.0.0", cloneFrom: "" })],
    createOrchestrator,
  });

  const studio = studioState(ready.state);
  expect(studio.blueprintCreateSaving).toBe(false);
  expect(studio.blueprintCreateError).toBe("");
  expect(studio.selectedBlueprintId).toBe("studio-create-ok");
  expect(studio.selected).not.toBeNull();
});

test("creating a Blueprint with a duplicate id clears saving and surfaces the CRUD service's own error", async () => {
  const blueprintStorage = createBlueprintStorageConnectionFactory(createMemoryStorageApi(), createMemoryStorageRef);
  const { materialized, createOrchestrator } = createStudioHarness(blueprintStorage);
  const eventNode = blueprintCreateEventNode(materialized);
  const values = { id: "studio-create-dup", kind: "runtime-blueprint", version: "1.0.0", cloneFrom: "" };

  const first = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    events: [saveEvent(eventNode, values)],
    createOrchestrator,
  });
  expect(studioState(first.state).blueprintCreateError).toBe("");

  // Re-dispatch the identical id against the same (persisted) storage -- a real, deterministic
  // business-level failure the CRUD service already models as a normal settlement (no
  // response.blueprint), not a thrown exception, so failureSettlement never fires for it.
  const second = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: first.state,
    events: [saveEvent(eventNode, values)],
    createOrchestrator,
  });

  const studio = studioState(second.state);
  expect(studio.blueprintCreateSaving).toBe(false);
  expect(studio.blueprintCreateError).toBe("Blueprint already exists");
  // The failed re-create must not clobber the Blueprint the first, successful create selected.
  expect(studio.selectedBlueprintId).toBe("studio-create-dup");
});
