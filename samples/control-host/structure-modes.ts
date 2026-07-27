// Manual proof of the three Blueprint structure modes through the public Face API.
//
// Run: npx tsx samples/control-host/structure-modes.ts

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  createBlueprint,
  type BlueprintArtifact,
  type BlueprintStructureMode,
} from "@gik/blueprint";
import { ControlFace, openBlueprint } from "@gik/controlface";
import type { Orchestrator } from "@gik/kernel";

export interface StructureModeDemoResult {
  fixed: {
    before: string;
    after: string;
    rejection: string;
  };
  reconfigurable: {
    before: string;
    afterEvent: string;
    afterReconfigure: string;
    programPatch: string;
  };
  adaptive: {
    before: string;
    afterEvent: string;
    restored: string;
    programPatch: string;
  };
}

function structureModeBlueprint(
  structureMode: BlueprintStructureMode,
  adaptive = false,
): BlueprintArtifact {
  return createBlueprint({
    id: `${structureMode}-structure-mode-demo`,
    kind: "structure-mode-demo",
    version: "1",
    structureMode,
    ...(adaptive ? {
      structurePolicy: {
        allowedBlueprintOperations: ["replaceCell"],
        allowedProgramOperations: ["setRoot"],
      },
    } : {}),
    tiers: [{ id: "runtime", kind: "runtime-document" }],
    recipes: [],
    runtime: { capabilities: {} },
    cells: {
      root: {
        id: "root",
        behavior: adaptive ? { events: { adapt: [{ do: "confirm" }] } } : undefined,
        view: { capability: `${structureMode}:before` },
      },
    },
    projections: { presentation: { roots: ["root"] } },
  });
}

function createFace(blueprint: BlueprintArtifact, orchestrator?: Orchestrator): ControlFace {
  const runtime = openBlueprint(blueprint);
  return new ControlFace(runtime.vocabulary, runtime.program, { blueprint, orchestrator });
}

function capability(face: ControlFace): string {
  return face.getProgram().root.capability;
}

export async function runStructureModesDemo(): Promise<StructureModeDemoResult> {
  const fixed = createFace(structureModeBlueprint("fixed"));
  const fixedBefore = capability(fixed);
  let fixedRejection = "";
  try {
    await fixed.reconfigureBlueprint([{
      op: "replaceCell",
      cellId: "root",
      cell: { id: "root", view: { capability: "fixed:after" } },
    }]);
  } catch (error) {
    fixedRejection = error instanceof Error ? error.message : String(error);
  }
  const fixedAfter = capability(fixed);
  fixed.stop();

  const reconfigurable = createFace(structureModeBlueprint("reconfigurable"));
  const reconfigurableBefore = capability(reconfigurable);
  await reconfigurable.emit({ node: "root", name: "adapt" });
  const reconfigurableAfterEvent = capability(reconfigurable);
  const reconfiguration = await reconfigurable.reconfigureBlueprint([{
    op: "replaceCell",
    cellId: "root",
    cell: { id: "root", view: { capability: "reconfigurable:after" } },
  }]);
  const reconfigurableAfter = capability(reconfigurable);
  reconfigurable.stop();

  const adaptiveBlueprint = structureModeBlueprint("adaptive", true);
  const adaptive = createFace(adaptiveBlueprint, {
    async confirm() {
      return {
        program: [{
          op: "setRoot",
          root: { capability: "adaptive:after", id: "root" },
        }],
      };
    },
  });
  const adaptiveBefore = capability(adaptive);
  const checkpoint = adaptive.checkpoint();
  const adaptivePatch = await adaptive.emit({ node: "root", name: "adapt" });
  const adaptiveAfter = capability(adaptive);
  await adaptive.restore(checkpoint);
  const adaptiveRestored = capability(adaptive);
  adaptive.stop();

  return {
    fixed: {
      before: fixedBefore,
      after: fixedAfter,
      rejection: fixedRejection,
    },
    reconfigurable: {
      before: reconfigurableBefore,
      afterEvent: reconfigurableAfterEvent,
      afterReconfigure: reconfigurableAfter,
      programPatch: reconfiguration.programPatch?.[0]?.op ?? "none",
    },
    adaptive: {
      before: adaptiveBefore,
      afterEvent: adaptiveAfter,
      restored: adaptiveRestored,
      programPatch: adaptivePatch.program?.[0]?.op ?? "none",
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(JSON.stringify(await runStructureModesDemo(), null, 2));
}