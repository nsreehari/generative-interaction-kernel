import {
  createDurableRuntime,
  createDurableQueueProcessor,
  type DurableProvider,
  type QueueNotificationSubscription,
  type QueueProcessResult,
  type TransitionRefs,
} from "@gik-ai/durable-runtime";
import { evalAsyncJsonata } from "@gik-ai/evaluators";
import type { GIKEvent, Json, OrchestratorEffect, OrchestratorResult } from "@gik-ai/kernel";
import {
  createBlueprintDurableEffectSettlementEvent,
  createBlueprintDurableTransitionAdapter,
  type DurableBlueprintSpec,
} from "./durable-transition";
import type { BlueprintArtifact } from "./types";
import type { ExternalContext } from "./run-transition";

export type { QueueNotificationSubscription } from "@gik-ai/durable-runtime";

export interface BlueprintWorker {
  start(): Promise<void>;
  notify(): void;
  stop(): void;
  readonly isRunning: boolean;
}

export interface BlueprintWorkerRuntime {
  processEngineWake(request: BlueprintWorkerRequest): Promise<{
    status: "busy" | "committed" | "conflict" | "idle" | "lease-lost";
  }>;
  processQueueLaneItem(request: BlueprintWorkerRequest): Promise<QueueProcessResult>;
}

export interface BlueprintWorkerRequest {
  stateRef: string;
  journalRef: string;
  effectsQueueRef: string;
  effectsLane?: string;
  leaseMs?: number;
  visibilityMs?: number;
  maxAttempts?: number;
}

export function createBlueprintWorker(options: {
  runtime: BlueprintWorkerRuntime;
  request: BlueprintWorkerRequest;
  subscribe: QueueNotificationSubscription;
  onError?: (error: unknown) => void;
}): BlueprintWorker {
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRetry = (afterMs = 100) => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      processor.notify();
    }, afterMs);
  };
  const processor = createDurableQueueProcessor({
    subscribe: options.subscribe,
    onError: options.onError,
    async processNext(signal) {
      const request = { ...options.request, signal };
      const engine = await options.runtime.processEngineWake(request);
      if (engine.status === "busy" || engine.status === "conflict" || engine.status === "lease-lost") {
        scheduleRetry();
        return { status: "retry" };
      }

      const queue = await options.runtime.processQueueLaneItem(request);
      if (queue.appended?.length) processor.notify();
      if (queue.status === "retry") scheduleRetry(queue.retryAfterMs);
      if (queue.status !== "idle") return queue;
      return { status: engine.status === "committed" ? "completed" : "idle" };
    },
  });

  return {
    async start() {
      await processor.start();
      processor.notify();
    },
    notify: processor.notify,
    stop() {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      processor.stop();
    },
    get isRunning() {
      return processor.isRunning;
    },
  };
}

export interface DurableBlueprintWorkerRuntimeOptions {
  runtimeId: string;
  providers: Record<string, DurableProvider>;
  refs: TransitionRefs;
}

export interface BlueprintEffectExecutionContext {
  state: Record<string, Json>;
  spec: DurableBlueprintSpec;
  messageId: string;
  attempt: number;
  signal?: AbortSignal;
}

export type BlueprintEffectExecutor = (
  effect: OrchestratorEffect,
  context: BlueprintEffectExecutionContext,
) => Promise<OrchestratorResult | void> | OrchestratorResult | void;

export async function prepareQueuedCellSourceEffect(effect: OrchestratorEffect): Promise<OrchestratorEffect> {
  if (effect.kind !== "invoke" || !effect.control.sourceInputs || !effect.control.sourceInputTransform) return effect;
  const input = await evalAsyncJsonata(effect.control.sourceInputTransform.expr, effect.control.sourceInputs);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Cell source '${effect.control.sourceId}' input transform must return an object`);
  }
  return { ...effect, data: input };
}

export async function settleQueuedCellSourceEffect(
  effect: OrchestratorEffect,
  result: OrchestratorResult | void,
  state: Record<string, Json>,
): Promise<OrchestratorResult | void> {
  if (effect.kind !== "invoke" || !result || result.sourceOutput === undefined || !effect.control.sourceId) return result;
  const sourceValue = effect.control.sourceOutputTransform
    ? await evalAsyncJsonata(effect.control.sourceOutputTransform.expr, { response: result.sourceOutput })
    : structuredClone(result.sourceOutput);
  const { sourceOutput: _rawSourceOutput, ...settlement } = result;
  const runState = state.blueprintRunState;
  const cells = runState && typeof runState === "object" && !Array.isArray(runState)
    && runState.cells && typeof runState.cells === "object" && !Array.isArray(runState.cells)
    ? structuredClone(runState.cells)
    : {};
  const cellId = effect.control.sourceCellId ?? effect.node;
  const currentCell = cells[cellId];
  const cell = currentCell && typeof currentCell === "object" && !Array.isArray(currentCell)
    ? currentCell
    : { sources: [] };
  const currentSourceValues = cell.sourceValues;
  const sourceValues = currentSourceValues && typeof currentSourceValues === "object" && !Array.isArray(currentSourceValues)
    ? currentSourceValues
    : {};
  cells[cellId] = { ...cell, sourceValues: { ...sourceValues, [effect.control.sourceId]: sourceValue } };
  return {
    ...settlement,
    ops: [
      ...(settlement.ops ?? []),
      {
        op: "set",
        path: "blueprintRunState.cells",
        value: cells,
      },
    ],
  };
}

export async function executeQueuedCellSourceEffect(
  effect: OrchestratorEffect,
  state: Record<string, Json>,
  executeEffect: (effect: OrchestratorEffect) => Promise<OrchestratorResult | void> | OrchestratorResult | void,
): Promise<OrchestratorResult | void> {
  const executingEffect = await prepareQueuedCellSourceEffect(effect);
  return settleQueuedCellSourceEffect(effect, await executeEffect(executingEffect), state);
}

export async function executeQueuedBlueprintEffect(
  effect: OrchestratorEffect,
  state: Record<string, Json>,
  messageId: string,
  executeEffect: (effect: OrchestratorEffect) => Promise<OrchestratorResult | void> | OrchestratorResult | void,
): Promise<GIKEvent[]> {
  const result = await executeQueuedCellSourceEffect(effect, state, executeEffect);
  const isCellSource = effect.kind === "invoke" && Boolean(effect.control.sourceRequestToken);
  const isDeclarativeService = effect.kind === "invoke" && Boolean(effect.control.serviceRef);
  if (!isCellSource && !isDeclarativeService && effect.kind !== "request") return [];
  if (effect.kind === "request" && !result?.settlement) {
    throw new Error(`Request effect '${effect.effectId ?? messageId}' completed without a settlement`);
  }
  return [createBlueprintDurableEffectSettlementEvent(
    messageId,
    result ?? { outcome: "completed" },
    effect,
  )];
}

export function queuedBlueprintEffectFailureEvents(
  effect: OrchestratorEffect,
  failure: { messageId: string; attempt: number; error: string },
): GIKEvent[] {
  const detail = {
    messageId: failure.messageId,
    attempt: failure.attempt,
    error: failure.error,
  };
  if (effect.kind === "request") {
    if (!effect.effectId) throw new Error("Queued request effect is missing its effect id");
    return [createBlueprintDurableEffectSettlementEvent(failure.messageId, {
      outcome: "failed",
      detail,
      settlement: {
        effectId: effect.effectId,
        outcome: "failed",
        detail,
      },
    }, effect)];
  }
  // Mirrors executeQueuedBlueprintEffect's success-path classification just above: any invoke that
  // settles a Cell source (sourceRequestToken) OR a plain declarative service (serviceRef, with no
  // sourceRequestToken -- e.g. an action-triggered save) must also settle on terminal failure, or
  // the failure is silently dropped once the queue exhausts retries -- no settlement event, no
  // state change, no signal the Blueprint (or its view) can ever observe.
  if (effect.kind === "invoke" && (effect.control.sourceRequestToken || effect.control.serviceRef)) {
    return [createBlueprintDurableEffectSettlementEvent(failure.messageId, {
      outcome: "failed",
      detail,
    }, effect)];
  }
  return [];
}

export interface BlueprintExecution {
  runtime: DurableBlueprintWorkerRuntimeOptions;
  createWorker(options: {
    executeEffect: BlueprintEffectExecutor;
    subscribe?: QueueNotificationSubscription;
    onError?: (error: unknown) => void;
  }): BlueprintWorker;
}

export type BlueprintExecutionOptions = {
  blueprint: BlueprintArtifact;
  runtimeId: string;
  refs: TransitionRefs;
  externalContext?: ExternalContext;
};

export function createDurableBlueprintWorker(options: {
  blueprint: BlueprintArtifact;
  runtime: DurableBlueprintWorkerRuntimeOptions;
  externalContext?: ExternalContext;
  materializedBlueprint?: DurableBlueprintSpec["materializedBlueprint"];
  executeEffect: BlueprintEffectExecutor;
  subscribe?: QueueNotificationSubscription;
  onError?: (error: unknown) => void;
}): BlueprintWorker {
  const runtime = createDurableRuntime({
    runtimeId: options.runtime.runtimeId,
    providers: options.runtime.providers,
    transitionAdapter: createBlueprintDurableTransitionAdapter({
      blueprint: options.blueprint,
      externalContext: options.externalContext,
      materializedBlueprint: options.materializedBlueprint,
    }),
    effectHandlers: {
      "*": async (value, execution) => {
        const snapshot = await runtime.readSnapshot<Record<string, Json>, DurableBlueprintSpec>(
          options.runtime.refs,
        );
        if (snapshot.spec.settledEffectMessageIds?.includes(execution.messageId)) return [];
        const effect = value as OrchestratorEffect;
        return executeQueuedBlueprintEffect(effect, snapshot.state, execution.messageId, (executingEffect) =>
          options.executeEffect(executingEffect, {
            state: structuredClone(snapshot.state),
            spec: structuredClone(snapshot.spec),
            messageId: execution.messageId,
            attempt: execution.attempt,
            signal: execution.signal,
          }));
      },
    },
    effectFailureHandler: (value, failure) => {
      return queuedBlueprintEffectFailureEvents(value as OrchestratorEffect, failure);
    },
  });

  return createBlueprintWorker({
    runtime,
    request: options.runtime.refs,
    subscribe: options.subscribe ?? (() => undefined),
    onError: options.onError,
  });
}

export function createBlueprintExecution(
  options: BlueprintExecutionOptions,
  kind: string,
  provider: DurableProvider,
): BlueprintExecution {
  const runtime = {
    runtimeId: options.runtimeId,
    providers: { [kind]: provider },
    refs: options.refs,
  };
  return {
    runtime,
    createWorker(workerOptions) {
      return createDurableBlueprintWorker({
        blueprint: options.blueprint,
        runtime,
        externalContext: options.externalContext,
        ...workerOptions,
      });
    },
  };
}