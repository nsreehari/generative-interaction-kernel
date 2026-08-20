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
  settledEffectMessageIds: string[];
}

export type DurableBlueprintSpecUpdate =
  | { patch: BlueprintPatch; origin: BlueprintPatchOrigin }
  | { settledEffectMessageId: string };

const DURABLE_EFFECT_NODE = "$gik.durable-effect";
const DURABLE_EFFECT_SETTLED = "settled";
const DURABLE_BOOTSTRAP = "bootstrap";

export function createBlueprintDurableBootstrapEvent(): GIKEvent {
  return { node: DURABLE_EFFECT_NODE, name: DURABLE_BOOTSTRAP };
}

export function createBlueprintDurableEffectSettlementEvent(
  messageId: string,
  result: OrchestratorResult,
  effect?: OrchestratorEffect,
): GIKEvent {
  if (result.program) throw new Error("Durable Blueprint effects cannot settle with runtime program patches.");
  return {
    node: DURABLE_EFFECT_NODE,
    name: DURABLE_EFFECT_SETTLED,
    payload: {
      messageId,
      result: structuredClone(result) as unknown as Json,
      ...(effect ? { effect: structuredClone(effect) as unknown as Json } : {}),
    },
  };
}

function durableEffectSettlement(event: GIKEvent): {
  messageId: string;
  result: OrchestratorResult;
  effect?: OrchestratorEffect;
} | undefined {
  if (event.node !== DURABLE_EFFECT_NODE || event.name !== DURABLE_EFFECT_SETTLED) return undefined;
  const messageId = event.payload?.messageId;
  if (typeof messageId !== "string" || !messageId) {
    throw new Error("Durable Blueprint effect settlement is missing its message id.");
  }
  const result = event.payload?.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Durable Blueprint effect settlement is missing its result.");
  }
  const effect = event.payload?.effect;
  return {
    messageId,
    result: result as unknown as OrchestratorResult,
    ...(effect && typeof effect === "object" && !Array.isArray(effect)
      ? { effect: effect as unknown as OrchestratorEffect }
      : {}),
  };
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
  materializedBlueprint?: MaterializedBlueprint;
  onTransition?: (
    event: GIKEvent | null,
    result: Awaited<ReturnType<typeof runMaterializedTransition>>,
  ) => void;
}): BlueprintDurableTransitionAdapter {
  const materializedBlueprint = input.materializedBlueprint ?? materializeBlueprint(input);
  const initialSpec: DurableBlueprintSpec = {
    authoredBlueprint: structuredClone(input.blueprint),
    externalContext: structuredClone(input.externalContext ?? {}),
    materializedBlueprint,
    settledEffectMessageIds: [],
  };

  return {
    initialState: () => structuredClone(materializedBlueprint.payload.initialState),
    initialSpec: () => structuredClone(initialSpec),
    async transition({ state, spec, events }) {
      const settlements = events.map(durableEffectSettlement);
      const regularEvents = events.filter((event, index) =>
        settlements[index] === undefined
        && !(event.node === DURABLE_EFFECT_NODE && event.name === DURABLE_BOOTSTRAP));
      const consumed = new Set(spec.settledEffectMessageIds ?? []);
      const acceptedSettlements = settlements.filter((settlement) => {
        if (settlement === undefined || consumed.has(settlement.messageId)) return false;
        consumed.add(settlement.messageId);
        return true;
      });
      const sourceSettlements = acceptedSettlements
        .filter((settlement) => settlement?.effect?.kind === "invoke" && settlement.effect.control.sourceRequestToken)
        .map((settlement) => ({ effect: settlement!.effect!, result: settlement!.result }));
      const requestSettlements = acceptedSettlements
        .filter((settlement) => settlement?.effect?.kind === "request")
        .map((settlement) => ({ effect: settlement!.effect!, result: settlement!.result }));
      const serviceSettlements = acceptedSettlements
        .filter((settlement) =>
          settlement?.effect?.kind === "invoke"
          && Boolean(settlement.effect.control.serviceRef)
          && !settlement.effect.control.sourceRequestToken)
        .map((settlement) => settlement!.result);
      const isBootstrap = events.some((event) =>
        event.node === DURABLE_EFFECT_NODE && event.name === DURABLE_BOOTSTRAP);
      const result = await runMaterializedTransition({
        state,
        materializedBlueprint: spec.materializedBlueprint,
        events: regularEvents,
        syncExternal: isBootstrap,
        sourceSettlements,
        requestSettlements,
        serviceSettlements,
      });
      if (regularEvents.length || isBootstrap) {
        input.onTransition?.(regularEvents[0] ? structuredClone(regularEvents[0]) : null, result);
      }
      const proposals = result.blueprintPatchProposals ?? result.blueprintPatches;
      const settlementUpdates = acceptedSettlements.map((settlement) => ({
        settledEffectMessageId: settlement!.messageId,
      }));
      return {
        state: result.state,
        effects: result.effects ?? [],
        specUpdates: [
          ...settlementUpdates,
          ...(proposals?.map((patch) => ({ patch, origin: "runtime" as const })) ?? []),
        ],
      };
    },
    applySpecUpdates({ spec, updates }) {
      let next = structuredClone(spec);
      for (const update of updates) {
        if ("settledEffectMessageId" in update) {
          next.settledEffectMessageIds ??= [];
          if (!next.settledEffectMessageIds.includes(update.settledEffectMessageId)) {
            next.settledEffectMessageIds.push(update.settledEffectMessageId);
          }
          continue;
        }
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
          settledEffectMessageIds: next.settledEffectMessageIds,
        };
      }
      return next;
    },
  };
}