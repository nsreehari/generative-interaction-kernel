import { confirmOutcomeEvent, type ConfirmOutcome, type GIKEvent, type Json, type OrchestratorEffect, type StateModel } from "@gik/kernel";
import { prepareBlueprintProgram, runTransition, type BlueprintTransitionResult } from "./run-transition";
import type { BlueprintArtifact } from "./types";

export interface RunLoweringBlueprintOptions {
  /** The compiler Blueprint whose Cells perform the transform / approve / emit-blueprint lowering. */
  blueprint: BlueprintArtifact;
  /**
   * An event that touches the compiler's seeded source state, triggering the standing `compute`
   * derivations to settle. Standing derivations never run from seeded state alone: `runTransition`'s
   * zero-events path only seeds the reaction baseline (confirmed empirically — an empty event list
   * left derived state unpopulated, while dispatching this event settled it), so a real event is
   * required before the derived rows/summary are readable.
   */
  bootstrapEvent: GIKEvent;
  /** The event that fires the compiler's `approve` Cell's `confirm` action. */
  approveEvent: GIKEvent;
  /** Host-side approval decision, e.g. surfaced to a human reviewer. */
  approve: (effect: OrchestratorEffect) => Promise<ConfirmOutcome>;
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
  const { blueprint, bootstrapEvent, approveEvent, approve, contexts } = options;
  const { initialState } = prepareBlueprintProgram(blueprint);

  const bootstrapped = await runTransition({ state: initialState, blueprint, events: [bootstrapEvent], contexts });

  const approved = await runTransition({
    state: bootstrapped.state,
    blueprint,
    events: [approveEvent],
    contexts,
    createOrchestrator: () => ({
      async confirm(effect) {
        const outcome = await approve(effect);
        return { events: [confirmOutcomeEvent(effect, outcome)] };
      },
    }),
  });

  return { state: approved.state, effects: approved.effects };
}
