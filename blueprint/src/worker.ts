import {
  createDurableRuntime,
  createDurableQueueProcessor,
  type DurableProvider,
  type QueueNotificationSubscription,
  type QueueProcessResult,
  type TransitionRefs,
} from "@gik/durable-runtime";
import type { GIKEvent, Json, OrchestratorEffect, OrchestratorResult } from "@gik/kernel";
import {
  createBlueprintDurableEffectSettlementEvent,
  createBlueprintDurableTransitionAdapter,
  type DurableBlueprintSpec,
} from "./durable-transition";
import type { BlueprintArtifact } from "./types";
import type { ExternalContext } from "./run-transition";

export type { QueueNotificationSubscription } from "@gik/durable-runtime";

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
        const result = await options.executeEffect(value as OrchestratorEffect, {
          state: structuredClone(snapshot.state),
          spec: structuredClone(snapshot.spec),
          messageId: execution.messageId,
          attempt: execution.attempt,
          signal: execution.signal,
        });
        return [createBlueprintDurableEffectSettlementEvent(
          execution.messageId,
          result ?? { outcome: "completed" },
        )] satisfies GIKEvent[];
      },
    },
    effectFailureHandler: (value, failure) => {
      const effect = value as OrchestratorEffect;
      return [createBlueprintDurableEffectSettlementEvent(failure.messageId, {
      outcome: "failed",
      detail: {
        messageId: failure.messageId,
        attempt: failure.attempt,
        error: failure.error,
      },
      events: [{
        node: effect.node,
        name: `${effect.kind}-failed`,
        payload: {
          messageId: failure.messageId,
          attempt: failure.attempt,
          error: failure.error,
          ...(effect.tool ? { tool: effect.tool } : {}),
        },
      }],
    })];
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