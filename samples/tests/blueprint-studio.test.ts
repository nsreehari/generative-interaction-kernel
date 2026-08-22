import assert from "node:assert/strict";
import {
  analyzeCellComposition,
  materializeBlueprint,
  runMaterializedTransition,
  type BlueprintArtifact,
  type CellDefinition,
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
