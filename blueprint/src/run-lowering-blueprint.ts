import { type EffectSettlement, type GIKEvent, type Json, type OrchestratorEffect, type StateModel } from "@gik/kernel";
import { prepareBlueprintProgram, runTransition, type BlueprintTransitionResult } from "./run-transition";
import type { BlueprintArtifact } from "./types";

export interface RunLoweringBlueprintOptions {
  /** The compiler Blueprint whose Cells perform the transform / approve / emit-blueprint lowering. */
  blueprint: BlueprintArtifact;
  /** The event that fires the compiler's approval request action. */
  approveEvent: GIKEvent;
  /** Resolve the request through host policy, a human reviewer, or another actor. */
  resolveRequest: (effect: OrchestratorEffect) => Promise<EffectSettlement>;
  contexts?: Record<string, StateModel>;
}

export interface RunLoweringBlueprintResult {
  state: Record<string, Json>;
  effects?: BlueprintTransitionResult["effects"];
}

/**
 * ADR-0044 Phase 2 host-side driver: run a Lowering Cell meta-graph (transform / approve /
 * emit-blueprint Cells) as ordinary Blueprint transitions on the shared Kernel, via
 * `runTransition` — no bespoke execution engine, no manual ControlFace/StateModel wiring.
 */
export async function runLoweringBlueprint(options: RunLoweringBlueprintOptions): Promise<RunLoweringBlueprintResult> {
  const { blueprint, approveEvent, resolveRequest, contexts } = options;
  const { initialState } = prepareBlueprintProgram(blueprint);

  const bootstrapped = await runTransition({ state: initialState, blueprint, events: [], contexts });

  const approved = await runTransition({
    state: bootstrapped.state,
    blueprint,
    events: [approveEvent],
    contexts,
    createOrchestrator: () => ({
      async request(effect) {
        return { settlement: await resolveRequest(effect) };
      },
    }),
  });

  return { state: approved.state, effects: approved.effects };
}
