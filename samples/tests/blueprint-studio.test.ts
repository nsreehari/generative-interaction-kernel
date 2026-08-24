import assert from "node:assert/strict";
import {
  analyzeCellComposition,
  listExportedPresentationRegions,
  materializeBlueprint,
  runMaterializedTransition,
  type BlueprintArtifact,
  type CellDefinition,
  type CellPotentialView,
  type ExternalContext,
} from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import { resolveDeclarativeFormInitialValue } from "@gik/evaluators";
import {
  createMemoryStorageApi,
  createMemoryStorageRef,
} from "@gik/durable-runtime/storage/memory";
import { JsonataExpressionProvider } from "@gik/kernel";
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

function createStudioHarness(
  options: {
    externalContext?: ExternalContext;
    blueprintStorage?: BlueprintStorageConnectionFactory;
  } = {},
) {
  const materialized = materializeBlueprint({ blueprint, externalContext: options.externalContext });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  return {
    materialized,
    runtime,
    createOrchestrator: (state: Parameters<typeof createNodeBlueprintServiceHost>[1]) => {
      const host = createNodeBlueprintServiceHost(runtime, state, {}, {}, undefined, options.blueprintStorage);
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
  return eventNodeFor(materialized, "blueprint-create");
}

function eventNodeFor(materialized: ReturnType<typeof materializeBlueprint>, cellId: string): string {
  const owners = materialized.payload.eventNodeOwners ?? {};
  const node = Object.entries(owners).find(([, owner]) => owner === cellId)?.[0];
  if (!node) throw new Error(`${cellId} has no compiled event node in this materialization`);
  return node;
}

/** The one view a materialized Cell attaches to a given presentation slot. Read from the terminal
 * artifact the materialization produced rather than restated here, so these tests observe what the
 * representation actually selected instead of duplicating its authored shape. */
function viewInSlot(
  materialized: ReturnType<typeof materializeBlueprint>,
  cellId: string,
  slot: string,
): [string, CellPotentialView] {
  const views = materialized.payload.terminalBlueprint.payload.cells?.[cellId]?.potentialViews ?? {};
  const found = Object.entries(views).find(([, view]) =>
    (Array.isArray(view.region) ? view.region : [view.region]).includes(slot));
  if (!found) throw new Error(`Cell '${cellId}' materialized no view in slot '${slot}'`);
  return found;
}

const predicate = new JsonataExpressionProvider({ safe: true });

/** Evaluates a materialized view's own visibility gate exactly the way the interpreter does. */
async function gateSatisfied(view: CellPotentialView, state: Record<string, unknown>): Promise<boolean> {
  if (!view.visibility) return true;
  const value = await predicate.eval(view.visibility, state as never);
  return value !== null && value !== undefined && value !== false;
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
  const { materialized, createOrchestrator } = createStudioHarness({ blueprintStorage });
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

// Blueprint Studio carries an external presentation context, `mode`, on its own projection axis:
// `normal` is the complete Studio at one root, `embedded` is the manifestation an application shell
// places by name. Selection is a projection-axis representation choice under immutable external
// context -- never a host reaching into Studio state to simulate a mode.
test("blueprint-studio declares a mode presentation context that defaults to normal", () => {
  const spec = payload.contextFormSpec;
  assert.ok(spec, "blueprint-studio must declare a contextFormSpec");
  const mode = (spec.fields.properties as Record<string, { enum?: string[] }>).mode;
  expect(mode?.enum).toEqual(["normal", "embedded"]);
  expect(resolveDeclarativeFormInitialValue(spec)).toEqual({ mode: "normal" });
  // An unspecified mode is the same manifestation as an explicit normal one.
  expect(resolveDeclarativeFormInitialValue(spec, { mode: "embedded" })).toEqual({ mode: "embedded" });
});

test("only the embedded mode exports host-addressable presentation regions", () => {
  const regionNames = (externalContext?: ExternalContext) =>
    listExportedPresentationRegions(
      materializeBlueprint({ blueprint, externalContext }).payload.terminalBlueprint,
    );

  expect(regionNames()).toEqual([]);
  expect(regionNames({ mode: "normal" })).toEqual([]);
  expect(regionNames({ mode: "embedded" }).map(({ name, slot }) => ({ name, slot }))).toEqual([
    { name: "blueprint-catalog", slot: "catalog-list" },
    { name: "blueprint-preview", slot: "workspace-preview" },
  ]);
});

test("the normal mode keeps the complete Studio surface the full host route renders", () => {
  const normal = materializeBlueprint({ blueprint, externalContext: { mode: "normal" } });
  const embedded = materializeBlueprint({ blueprint, externalContext: { mode: "embedded" } });
  const terminalCells = (materialized: ReturnType<typeof materializeBlueprint>) =>
    materialized.payload.terminalBlueprint.payload.cells ?? {};

  // Normal keeps the authored Cell graph and every authored view, tabs and editor included.
  expect(Object.keys(terminalCells(normal))).toEqual(Object.keys(cells));
  for (const [cellId, cell] of Object.entries(cells)) {
    expect(Object.keys(terminalCells(normal)[cellId].potentialViews ?? {})).toEqual(
      Object.keys(cell.potentialViews ?? {}),
    );
  }
  // Embedded changes only the projection seam: same Cells, same slots, only the preview Cell's own
  // manifestation is replaced.
  expect(Object.keys(terminalCells(embedded))).toEqual(Object.keys(cells));
  expect(embedded.payload.terminalBlueprint.payload.presentation?.slots)
    .toEqual(normal.payload.terminalBlueprint.payload.presentation?.slots);
  const changed = Object.keys(cells).filter((cellId) =>
    JSON.stringify(terminalCells(embedded)[cellId].potentialViews)
      !== JSON.stringify(terminalCells(normal)[cellId].potentialViews));
  expect(changed).toEqual(["blueprint-preview"]);
});

test("selecting a catalog entry shows the embedded live preview without the normal Preview tab", async () => {
  const embedded = createStudioHarness({ externalContext: { mode: "embedded" } });
  const normal = createStudioHarness({ externalContext: { mode: "normal" } });

  const listed = await runMaterializedTransition({
    materializedBlueprint: embedded.materialized,
    state: embedded.materialized.payload.initialState,
    syncExternal: true,
    events: [],
    createOrchestrator: embedded.createOrchestrator,
  });
  const selected = await runMaterializedTransition({
    materializedBlueprint: embedded.materialized,
    state: listed.state,
    syncExternal: true,
    events: [{
      node: eventNodeFor(embedded.materialized, "blueprint-list"),
      name: "select",
      payload: { values: ["portfolio-tracker-new"] },
    }],
    createOrchestrator: embedded.createOrchestrator,
  });

  const studio = selected.state.studio as { selectedBlueprintId: string; activeTab: string };
  expect(studio.selectedBlueprintId).toBe("portfolio-tracker-new");
  // Nothing switched tabs: the embedded shell never mounts the workspace-tabs region at all.
  expect(studio.activeTab).toBe("overview");

  const [, embeddedPreview] = viewInSlot(embedded.materialized, "blueprint-preview", "workspace-preview");
  const [, normalPreview] = viewInSlot(normal.materialized, "blueprint-preview", "workspace-preview");
  expect(embeddedPreview.capability).toBe("gik:blueprint");
  expect(await gateSatisfied(embeddedPreview, selected.state)).toBe(true);
  // The normal manifestation still requires its own Preview tab, exactly as before.
  expect(normalPreview.visibility).toContain("studio.activeTab = 'preview'");
  expect(await gateSatisfied(normalPreview, selected.state)).toBe(false);
});
