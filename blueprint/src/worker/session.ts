import { createDurableRuntime, type DurableProvider, type TransitionRefs } from "gik-durable-runtime";
import { validateJsonValue, type GIKEvent, type Json } from "gik-kernel";
import { createBlueprintDurableBootstrapEvent, createBlueprintDurableTransitionAdapter, type DurableBlueprintSpec } from "../durable-transition";
import { BlueprintSenseReconciler, type BlueprintSenseBinding, type BlueprintSenseHandle } from "../senses";
import type { BlueprintArtifact } from "../types";
import type { ExternalContext } from "../run-transition";
import { createBlueprintWorker, executeQueuedBlueprintEffect, queuedBlueprintEffectFailureEvents, type BlueprintEffectExecutor, type QueueNotificationSubscription } from "../worker";

export class BlueprintSessionError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BlueprintSessionError";
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

export interface BlueprintSessionOptions {
  blueprint: BlueprintArtifact;
  externalContext?: ExternalContext;
  runtimeId: string;
  refs: TransitionRefs;
  providers: Record<string, DurableProvider>;
  verifyBinding(): Promise<void>;
  close(): Promise<void>;
  onError(error: unknown): void;
  prepare(context: ExternalContext, signal: AbortSignal): {
    executeEffect: BlueprintEffectExecutor;
    observe?: (binding: BlueprintSenseBinding, emit: Parameters<ConstructorParameters<typeof BlueprintSenseReconciler>[0]["open"]>[1]) => Promise<BlueprintSenseHandle>;
  };
  recover?(state: Record<string, Json>, spec: DurableBlueprintSpec): Promise<GIKEvent[]>;
  subscribe?: QueueNotificationSubscription;
  effectRetry?: { leaseMs?: number; visibilityMs?: number; maxAttempts?: number };
  flushTimeoutMs?: number;
}

/** Owns execution, not application authority. Every public ingress rechecks the host binding. */
export async function openDurableBlueprintSession(options: BlueprintSessionOptions) {
  const { refs } = options;
  const controller = new AbortController();
  const adapter = createBlueprintDurableTransitionAdapter({
    blueprint: options.blueprint, externalContext: options.externalContext, instanceId: options.runtimeId,
  });
  let stopped = false, fault: unknown, failed = false;
  let ports: ReturnType<BlueprintSessionOptions["prepare"]>;
  let admission: Promise<unknown> = Promise.resolve();
  let stopping: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  const runtime = createDurableRuntime({
    runtimeId: options.runtimeId, providers: options.providers, transitionAdapter: adapter,
    effectHandlers: {
      "*": async (value, execution) => {
        const saved = await snapshot(controller.signal);
        if (saved.spec.settledEffectMessageIds?.includes(execution.messageId)) return [];
        return executeQueuedBlueprintEffect(value as Parameters<BlueprintEffectExecutor>[0], saved.state, execution.messageId,
          effect => ports.executeEffect(effect, {
            state: structuredClone(saved.state), spec: structuredClone(saved.spec),
            messageId: execution.messageId, attempt: execution.attempt,
            signal: execution.signal ? AbortSignal.any([controller.signal, execution.signal]) : controller.signal,
          }));
      },
    },
    effectFailureHandler: (effect, failure) => queuedBlueprintEffectFailureEvents(effect as Parameters<BlueprintEffectExecutor>[0], failure),
  });
  const senses = new BlueprintSenseReconciler({
    async open(binding, emit) {
      if (!ports.observe) throw new Error("The host has not registered an observation executor.");
      return ports.observe(binding, emit);
    },
    async append(entry) {
      assertRunning();
      await options.verifyBinding();
      assertRunning();
      await runtime.appendJournal({ ...refs, entry });
      worker.notify();
    },
    onError: fail,
  });
  function fail(error: unknown) {
    if (failed || stopped) return;
    failed = true; fault = error;
    controller.abort(); worker.stop();
    void senses.stop().catch(cleanupError => options.onError(cleanupError));
    options.onError(error);
  }
  function assertRunning() {
    if (stopped || failed) throw new BlueprintSessionError("RUNTIME_UNAVAILABLE", "The Blueprint session is stopped or needs recovery.", { cause: fault });
  }
  async function snapshot(signal?: AbortSignal) {
    signal?.throwIfAborted();
    assertRunning();
    await options.verifyBinding();
    signal?.throwIfAborted();
    assertRunning();
    const saved = await runtime.readSnapshot<Record<string, Json>, DurableBlueprintSpec>(refs);
    signal?.throwIfAborted();
    if (canonical(saved.spec.authoredBlueprint) !== canonical(options.blueprint))
      throw new BlueprintSessionError("RUNTIME_INCOMPATIBLE", "The saved Blueprint requires an explicit upgrade. No state was replaced.");
    return saved;
  }
  async function reconcile() {
    if (stopped || failed) return;
    const saved = await snapshot(controller.signal);
    if (!stopped && !failed && saved.spec.senses) await senses.reconcile(saved.spec.senses);
  }
  function track<T>(operation: Promise<T>): Promise<T> {
    pending.add(operation);
    void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  }
  const worker = createBlueprintWorker({
    runtime: {
      processEngineWake: request => stopped || failed ? Promise.resolve({ status: "idle" as const })
        : track(runtime.processEngineWake(request).then(async result => { await reconcile(); return result; })),
      processQueueLaneItem: request => stopped || failed ? Promise.resolve({ status: "idle" as const })
        : track(runtime.processQueueLaneItem(request)),
    },
    request: { ...refs, maxAttempts: 1, ...options.effectRetry },
    subscribe: options.subscribe ?? (() => undefined),
    onError: fail,
  });
  async function flush() {
    const deadline = Date.now() + (options.flushTimeoutMs ?? 5000);
    for (;;) {
      assertRunning();
      const result = await runtime.runEngine(refs);
      if (result.status === "idle") return;
      if (Date.now() >= deadline) throw new BlueprintSessionError("RUNTIME_BUSY", "The Blueprint session is busy. Inspect state before repeating an action.");
      if (result.status !== "committed") await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  function stop(): Promise<void> {
    stopping ??= (async () => {
      stopped = true; controller.abort(); worker.stop();
      try {
        await admission;
        const operations = [...pending];
        const results = await Promise.allSettled(operations);
        const errors = results.flatMap(result => result.status === "rejected"
          && !(result.reason instanceof Error && result.reason.name === "AbortError") ? [result.reason] : []);
        try { await senses.stop(); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, "Blueprint session shutdown failed.");
      } finally { await options.close(); }
    })();
    return stopping;
  }
  try {
    await options.verifyBinding();
    const initialized = await runtime.initializeRuntime(refs);
    const saved = await snapshot();
    ports = options.prepare(saved.spec.externalContext, controller.signal);
    if (initialized.created) await runtime.appendJournal({ ...refs, entry: createBlueprintDurableBootstrapEvent() });
    for (const entry of await options.recover?.(saved.state, saved.spec) ?? []) await runtime.appendJournal({ ...refs, entry });
    await flush(); await reconcile(); await worker.start();
  } catch (error) {
    try { await stop(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Blueprint session initialization and cleanup failed.");
    }
    throw error;
  }
  return {
    attachment: { runtime: { runtimeId: options.runtimeId, refs, providers: options.providers }, worker },
    snapshot: () => snapshot(),
    async changes(afterRevision: string | null) {
      await snapshot();
      return runtime.readSnapshotChanges({ ...refs, afterRevision });
    },
    append(entry: unknown) {
      const operation = admission.then(async () => {
        const saved = await snapshot();
        validateJsonValue({
          type: "object", additionalProperties: false, required: ["node", "name"],
          properties: { node: { type: "string" }, name: { type: "string" }, payload: { type: "object" }, actorId: { type: "string" } },
        }, entry, "Invalid Blueprint event");
        const event = entry as GIKEvent;
        const materialized = saved.spec.materializedBlueprint.payload;
        const owner = materialized.eventNodeOwners[event.node];
        const contract = owner ? materialized.terminalBlueprint.payload.cells?.[owner]?.events?.[event.name] : undefined;
        if (!contract) throw new BlueprintSessionError("EVENT_REJECTED", "This event is not declared by the Blueprint.");
        if (contract.payloadSchema) validateJsonValue(contract.payloadSchema, event.payload ?? {}, "Invalid Blueprint event payload");
        await adapter.transition({ state: saved.state, spec: saved.spec, events: [event] });
        assertRunning();
        await options.verifyBinding();
        assertRunning();
        const result = await runtime.appendJournal({ ...refs, entry: event });
        await flush(); await reconcile(); worker.notify();
        return result;
      });
      admission = operation.then(() => undefined, () => undefined);
      return operation;
    },
    stop,
  };
}
