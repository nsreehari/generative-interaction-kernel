import type { GIKEvent, Json, OrchestratorEffect } from "@gik/kernel";
import {
  applyBlueprintPatches,
  materializeBlueprint,
  runMaterializedTransition,
  type ExternalContext,
  type MaterializedBlueprint,
} from "./run-transition";
import type { BlueprintArtifact, BlueprintPatch, BlueprintPatchOrigin } from "./types";

export interface DurableBlueprintSpec {
  authoredBlueprint: BlueprintArtifact;
  externalContext: Record<string, Json>;
  materializedBlueprint: MaterializedBlueprint;
}

export interface DurableBlueprintSpecUpdate {
  patch: BlueprintPatch;
  origin: BlueprintPatchOrigin;
}

export interface BlueprintDurableTransitionAdapter {
  initialState(): Record<string, Json>;
  initialSpec(): DurableBlueprintSpec;
  transition(input: {
    state: Record<string, Json>;
    spec: DurableBlueprintSpec;
    events: readonly GIKEvent[];
  }): Promise<{
    state: Record<string, Json>;
    effects: readonly OrchestratorEffect[];
    specUpdates?: readonly DurableBlueprintSpecUpdate[];
  }>;
  applySpecUpdates(input: {
    spec: DurableBlueprintSpec;
    updates: readonly DurableBlueprintSpecUpdate[];
  }): DurableBlueprintSpec;
}

export function createBlueprintDurableTransitionAdapter(input: {
  blueprint: BlueprintArtifact;
  externalContext?: ExternalContext;
}): BlueprintDurableTransitionAdapter {
  const materializedBlueprint = materializeBlueprint(input);
  const initialSpec: DurableBlueprintSpec = {
    authoredBlueprint: structuredClone(input.blueprint),
    externalContext: structuredClone(input.externalContext ?? {}),
    materializedBlueprint,
  };

  return {
    initialState: () => structuredClone(materializedBlueprint.payload.initialState),
    initialSpec: () => structuredClone(initialSpec),
    async transition({ state, spec, events }) {
      const result = await runMaterializedTransition({
        state,
        materializedBlueprint: spec.materializedBlueprint,
        events,
      });
      const proposals = result.blueprintPatchProposals ?? result.blueprintPatches;
      return {
        state: result.state,
        effects: result.effects ?? [],
        ...(proposals?.length
          ? { specUpdates: proposals.map((patch) => ({ patch, origin: "runtime" as const })) }
          : {}),
      };
    },
    applySpecUpdates({ spec, updates }) {
      let next = structuredClone(spec);
      for (const update of updates) {
        const applied = applyBlueprintPatches({
          blueprint: next.authoredBlueprint,
          externalContext: next.externalContext,
          state: {},
          patch: update.patch,
          origin: update.origin,
        });
        next = {
          authoredBlueprint: applied.blueprint,
          externalContext: structuredClone(next.externalContext),
          materializedBlueprint: applied.materializedBlueprint,
        };
      }
      return next;
    },
  };
}