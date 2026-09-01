import {
  createDurableBlueprintWorker,
  type BlueprintWorker,
  type QueueNotificationSubscription,
} from "@gik-ai/blueprint/worker";
import type { BlueprintArtifact, ExternalContext, MaterializedBlueprint } from "@gik-ai/blueprint";
import {
  CompositeStateModel,
  InMemoryStateModel,
  unwrap,
  type InvocationControl,
  type Json,
  type OrchestratorEffect,
  type OrchestratorResult,
} from "@gik-ai/kernel";
import type { DurableBlueprintRuntimeOptions } from "./durable-blueprint-controller";
import type { BundleContextBindings } from "./primitives/bundle-registry";
import type { BundleNative } from "./primitives/bundle";
import { createEffectDispatcher } from "./primitives/effects";

export async function executeNativeBlueprintEffect(options: {
  effect: OrchestratorEffect;
  state: Record<string, Json>;
  vocabulary: MaterializedBlueprint["payload"]["vocabulary"];
  externalContext: Record<string, Json>;
  native: BundleNative;
  invocationId?: string;
  signal?: AbortSignal;
  contexts?: BundleContextBindings;
}): Promise<OrchestratorResult | void> {
  const local = new InMemoryStateModel(unwrap(options.vocabulary).namespaces ?? []);
  local.apply(Object.entries(options.state).map(([path, value]) => ({ op: "set", path, value })));
  const externalContextStore = new InMemoryStateModel(["externalContext"]);
  externalContextStore.apply([{ op: "set", path: "externalContext", value: structuredClone(options.externalContext) }]);
  const state = new CompositeStateModel(local, {
    ...options.contexts,
    externalContext: externalContextStore,
  });
  const fallback = createEffectDispatcher(state, options.native.effectHandlers ?? {});
  const orchestrator = options.native.wrapOrchestrator?.(fallback, state) ?? fallback;
  let emitted: OrchestratorResult | undefined;
  const control: InvocationControl = {
    id: options.invocationId ?? crypto.randomUUID(),
    signal: options.signal ?? new AbortController().signal,
    emitProgress: async () => undefined,
    emit: async (result = {}) => { emitted = result; },
  };
  const returned = options.effect.kind === "invoke"
    ? await orchestrator.invoke?.(options.effect, control)
    : options.effect.kind === "request"
      ? await orchestrator.request?.(options.effect)
      : await orchestrator.route?.(options.effect);
  return returned ?? emitted;
}

export function createNativeBlueprintWorker(options: {
  blueprint: BlueprintArtifact;
  runtime: DurableBlueprintRuntimeOptions;
  native: BundleNative;
  externalContext?: ExternalContext;
  materializedBlueprint?: MaterializedBlueprint;
  contexts?: BundleContextBindings;
  effectRetry?: Parameters<typeof createDurableBlueprintWorker>[0]["effectRetry"];
  subscribe?: QueueNotificationSubscription;
  onError?: (error: unknown) => void;
}): BlueprintWorker {
  return createDurableBlueprintWorker({
    blueprint: options.blueprint,
    runtime: options.runtime,
    externalContext: options.externalContext,
    materializedBlueprint: options.materializedBlueprint,
    effectRetry: options.effectRetry,
    subscribe: options.subscribe,
    onError: options.onError,
    executeEffect: async (effect, { state: snapshotState, spec, messageId, signal }) => {
      const { vocabulary, externalContext } = spec.materializedBlueprint.payload;
      return executeNativeBlueprintEffect({
        effect,
        state: snapshotState,
        vocabulary,
        externalContext,
        native: options.native,
        invocationId: messageId,
        signal,
        contexts: options.contexts,
      });
    },
  });
}