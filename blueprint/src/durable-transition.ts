import {
  InMemoryStateModel,
  unwrap,
  type GIKEvent,
  type Json,
  type OrchestratorEffect,
  type OrchestratorResult,
} from "@gik/kernel";
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

const DURABLE_EFFECT_NODE = "$gik.durable-effect";
const DURABLE_EFFECT_SETTLED = "settled";
const DURABLE_BOOTSTRAP = "bootstrap";

export function createBlueprintDurableBootstrapEvent(): GIKEvent {
  return { node: DURABLE_EFFECT_NODE, name: DURABLE_BOOTSTRAP };
}

export function createBlueprintDurableEffectSettlementEvent(result: OrchestratorResult): GIKEvent {
  if (result.program) throw new Error("Durable Blueprint effects cannot settle with runtime program patches.");
  return {
    node: DURABLE_EFFECT_NODE,
    name: DURABLE_EFFECT_SETTLED,
    payload: { result: structuredClone(result) as unknown as Json },
  };
}

function durableEffectSettlement(event: GIKEvent): OrchestratorResult | undefined {
  if (event.node !== DURABLE_EFFECT_NODE || event.name !== DURABLE_EFFECT_SETTLED) return undefined;
  const result = event.payload?.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Durable Blueprint effect settlement is missing its result.");
  }
  return result as unknown as OrchestratorResult;
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
      const settlements = events.map(durableEffectSettlement);
      const regularEvents = events.filter((event, index) =>
        settlements[index] === undefined
        && !(event.node === DURABLE_EFFECT_NODE && event.name === DURABLE_BOOTSTRAP));
      const settlementResults = settlements.filter((result): result is OrchestratorResult => result !== undefined);
      let nextState = state;
      if (settlementResults.some((result) => result.ops?.length)) {
        const store = new InMemoryStateModel(unwrap(spec.materializedBlueprint.payload.vocabulary).namespaces ?? []);
        store.apply(Object.entries(state).map(([path, value]) => ({ op: "set", path, value })));
        for (const result of settlementResults) {
          if (result.ops?.length) store.apply(result.ops);
        }
        nextState = store.snapshot();
      }
      const followUpEvents = settlementResults.flatMap((result) => result.events ?? []);
      const result = await runMaterializedTransition({
        state: nextState,
        materializedBlueprint: spec.materializedBlueprint,
        events: [...followUpEvents, ...regularEvents],
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