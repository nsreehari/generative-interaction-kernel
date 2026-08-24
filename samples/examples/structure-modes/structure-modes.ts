// Manual proof of the three Blueprint structure modes through the public Face API.
//
// Run: npx tsx samples/examples/structure-modes/structure-modes.ts

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
    serviceTiers: [{ id: "runtime", kind: "runtime-document" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-document" , capabilities: []}],
    projectionRecipes: [],
    runtime: {},
    cells: {
      root: {
        id: "root",
        events: adaptive ? { adapt: { payloadSchema: { type: "object" } } } : undefined,
        behavior: adaptive ? { on: { adapt: [{
          do: "request",
          control: { kind: "data", responseSchema: { type: "object" } },
          data: {},
        }] } } : undefined,
        potentialViews: { primary: { capability: `${structureMode}:before`, region: "root" } },
      },
    },
    presentation: {
      slots: ["root"],
      root: "root",
      allowedCapabilities: [`${structureMode}:before`, `${structureMode}:after`],
    },
  });
}

function createFace(blueprint: BlueprintArtifact, orchestrator?: Orchestrator): ControlFace {
  const runtime = openBlueprint(blueprint);
  return new ControlFace(runtime.vocabulary, runtime.program, { blueprint, orchestrator });
}

function capability(face: ControlFace): string {
  const root = face.getProgram().root;
  if (!root) throw new Error("Structure mode demo requires a presentation root");
  const rendered = root.edges?.children?.[0] ?? root;
  return rendered.capability;
}

export async function runStructureModesDemo(): Promise<StructureModeDemoResult> {
  const fixed = createFace(structureModeBlueprint("fixed"));
  const fixedBefore = capability(fixed);
  let fixedRejection = "";
  try {
    await fixed.reconfigureBlueprint([{
      op: "replaceCell",
      cellId: "root",
      cell: { id: "root", potentialViews: { primary: { capability: "fixed:after", region: "root" } } },
    }]);
  } catch (error) {
    fixedRejection = error instanceof Error ? error.message : String(error);
  }
  const fixedAfter = capability(fixed);
  fixed.stop();

  const reconfigurable = createFace(structureModeBlueprint("reconfigurable"));
  const reconfigurableBefore = capability(reconfigurable);
  await reconfigurable.emit({ node: "root--primary--in-root", name: "adapt" });
  const reconfigurableAfterEvent = capability(reconfigurable);
  const reconfiguration = await reconfigurable.reconfigureBlueprint([{
    op: "replaceCell",
    cellId: "root",
    cell: { id: "root", potentialViews: { primary: { capability: "reconfigurable:after", region: "root" } } },
  }]);
  const reconfigurableAfter = capability(reconfigurable);
  reconfigurable.stop();

  const adaptiveBlueprint = structureModeBlueprint("adaptive", true);
  const adaptive = createFace(adaptiveBlueprint, {
    async request() {
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
  const adaptivePatch = await adaptive.emit({ node: "root--primary--in-root", name: "adapt" });
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