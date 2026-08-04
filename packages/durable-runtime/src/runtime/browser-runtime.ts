import type {
  DurableEffectHandler,
  DurableEffectFailureHandler,
  DurableProvider,
  DurableTransitionAdapter,
  JournalEntry,
  RuntimeRefs,
  RuntimeSnapshotChanges,
  TransitionRefs,
} from "../contracts";
import { assertSameRefKind, parseRef } from "../refs";

export type DurableRuntimeOptions = {
  runtimeId: string;
  providers: Record<string, DurableProvider>;
  transitionAdapter: DurableTransitionAdapter;
  effectHandlers?: Record<string, DurableEffectHandler>;
  effectFailureHandler?: DurableEffectFailureHandler;
};

export function createDurableRuntime(options: DurableRuntimeOptions) {
  if (options.effectHandlers && !options.effectFailureHandler) {
    throw new Error("effectFailureHandler is required when effectHandlers are configured.");
  }
  const adapter = options.transitionAdapter;

  function providerFor(ref: string): DurableProvider {
    const kind = parseRef(ref).kind;
    const provider = options.providers[kind];
    if (!provider) throw new Error(`No durable provider is configured for ref kind ${kind}.`);
    return provider;
  }

  function readSnapshotChanges<TState, TSpec>(
    request: RuntimeRefs & { afterRevision: string | null },
  ): Promise<RuntimeSnapshotChanges<TState, TSpec>> {
    return providerFor(request.stateRef).readSnapshotChanges<TState, TSpec>({
      ...request,
      runtimeId: options.runtimeId,
    });
  }

  async function executeEngine(request: TransitionRefs & { leaseMs?: number }) {
    const kind = assertSameRefKind([request.stateRef, request.journalRef, request.effectsQueueRef]);
    const provider = options.providers[kind];
    if (!provider) throw new Error(`No durable provider is configured for ref kind ${kind}.`);
    const snapshot = await provider.acquireTransition({ ...request, runtimeId: options.runtimeId });
    if (!snapshot) return { status: "busy" as const };
    if (snapshot.entries.length === 0) {
      await provider.abortTransition({ ...request, runtimeId: options.runtimeId, leaseToken: snapshot.leaseToken });
      return { status: "idle" as const, revision: snapshot.revision, cursor: snapshot.cursor };
    }

    try {
      const output = await adapter.transition({
        state: snapshot.state,
        spec: snapshot.spec,
        events: snapshot.entries.map((entry) => entry.payload),
      });
      const specUpdates = [...(output.specUpdates ?? [])];
      const spec = await adapter.applySpecUpdates({
        spec: snapshot.spec,
        updates: specUpdates,
      });
      const nextCursor = snapshot.entries.at(-1)!.id;
      const committed = await provider.commitTransition({
        ...request,
        runtimeId: options.runtimeId,
        leaseToken: snapshot.leaseToken,
        expectedRevision: snapshot.revision,
        previousCursor: snapshot.cursor,
        nextCursor,
        state: output.state,
        spec,
        specUpdates,
        effects: [...output.effects],
      });
      if (!committed.ok) return { status: committed.reason, revision: committed.revision, cursor: snapshot.cursor };
      return {
        status: "committed" as const,
        revision: committed.revision,
        cursor: nextCursor,
        entryCount: snapshot.entries.length,
        effectCount: output.effects.length,
      };
    } catch (error) {
      await provider.abortTransition({
        ...request,
        runtimeId: options.runtimeId,
        leaseToken: snapshot.leaseToken,
      }).catch(() => false);
      throw error;
    }
  }

  return {
    appendJournal<T>(request: TransitionRefs & { entry: T }): Promise<JournalEntry<T>> {
      const kind = assertSameRefKind([request.stateRef, request.journalRef, request.effectsQueueRef]);
      const provider = options.providers[kind];
      if (!provider) throw new Error(`No durable provider is configured for ref kind ${kind}.`);
      return provider.appendJournal(request);
    },

    initializeRuntime(request: RuntimeRefs) {
      return providerFor(request.stateRef).initializeRuntime({
        ...request,
        runtimeId: options.runtimeId,
        initialState: adapter.initialState(),
        initialSpec: adapter.initialSpec(),
      });
    },

    readSnapshot<TState, TSpec>(request: RuntimeRefs) {
      return providerFor(request.stateRef).readSnapshot<TState, TSpec>({
        ...request,
        runtimeId: options.runtimeId,
      });
    },

    readSnapshotChanges,

    subscribe<TState, TSpec>(
      request: RuntimeRefs,
      listener: (changes: RuntimeSnapshotChanges<TState, TSpec>) => void | Promise<void>,
      subscriptionOptions?: {
        afterRevision?: string | null;
        pollIntervalMs?: number;
        onError?: (error: unknown) => void;
      },
    ): () => void {
      let stopped = false;
      let revision = subscriptionOptions?.afterRevision ?? null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let pending = false;
      let draining: Promise<void> | null = null;
      let drainScheduled = false;
      let unsubscribeInvalidations: (() => void) | undefined;
      const abortController = new AbortController();
      const pollIntervalMs = Math.max(1, subscriptionOptions?.pollIntervalMs ?? 1_000);
      const provider = providerFor(request.stateRef);

      const drain = async (): Promise<void> => {
        if (draining) return draining;
        draining = (async () => {
          while (!stopped && pending) {
            pending = false;
            try {
              const changes = await readSnapshotChanges<TState, TSpec>({
                ...request,
                afterRevision: revision,
              });
              if (!stopped && changes.kind !== "unchanged") {
                await listener(changes);
                revision = changes.kind === "reset"
                  ? changes.snapshot.revision
                  : changes.revision;
              }
            } catch (error) {
              if (!stopped) subscriptionOptions?.onError?.(error);
            }
          }
        })().finally(() => {
          draining = null;
          if (!stopped && pending) scheduleRead();
        });
        return draining;
      };

      const scheduleRead = (): void => {
        if (stopped) return;
        pending = true;
        if (draining || drainScheduled) return;
        drainScheduled = true;
        queueMicrotask(() => {
          drainScheduled = false;
          if (!stopped) void drain();
        });
      };

      const scheduleSafetyPoll = (): void => {
        timer = setTimeout(() => {
          scheduleRead();
          if (!stopped) scheduleSafetyPoll();
        }, pollIntervalMs);
      };

      const startInvalidations = async (): Promise<void> => {
        if (provider.subscribeSnapshotInvalidations) {
          try {
            const cleanup = await provider.subscribeSnapshotInvalidations(
              { ...request, runtimeId: options.runtimeId },
              () => scheduleRead(),
              {
                signal: abortController.signal,
                onError: subscriptionOptions?.onError,
                onReconnect: scheduleRead,
              },
            );
            if (stopped) cleanup?.();
            else unsubscribeInvalidations = cleanup ?? undefined;
          } catch (error) {
            if (!stopped) subscriptionOptions?.onError?.(error);
          }
        }
        scheduleRead();
      };

      scheduleSafetyPoll();
      void startInvalidations();
      return () => {
        stopped = true;
        pending = false;
        abortController.abort();
        if (timer) clearTimeout(timer);
        unsubscribeInvalidations?.();
        unsubscribeInvalidations = undefined;
      };
    },

    runEngine: executeEngine,

    async processEngineWake(request: TransitionRefs & { leaseMs?: number }) {
      const kind = assertSameRefKind([request.stateRef, request.journalRef, request.effectsQueueRef]);
      const provider = options.providers[kind];
      if (!provider) throw new Error(`No durable provider is configured for ref kind ${kind}.`);
      const wake = await provider.readEngineWake(request);
      if (!wake.requestedAt || wake.processedAt && wake.requestedAt <= wake.processedAt) {
        return { status: "idle" as const };
      }
      const result = await executeEngine(request);
      if (result.status === "committed" || result.status === "idle") {
        await provider.markEngineWakeProcessed(request, wake.requestedAt);
      }
      return result;
    },

    async processQueueLaneItem(request: {
      stateRef: string;
      effectsQueueRef: string;
      effectsLane?: string;
      journalRef: string;
      visibilityMs?: number;
      maxAttempts?: number;
      signal?: AbortSignal;
    }) {
      const kind = assertSameRefKind([request.effectsQueueRef, request.journalRef]);
      const provider = options.providers[kind];
      if (!provider?.leaseQueueItem || !provider.ackQueueItem || !provider.nackQueueItem) {
        throw new Error(`Provider ${kind} does not support queue processing.`);
      }
      const message = await provider.leaseQueueItem({
        effectsQueueRef: request.effectsQueueRef,
        effectsLane: request.effectsLane,
        visibilityMs: request.visibilityMs,
      });
      if (!message) return { status: "idle" as const };
      let appended: unknown[] = [];
      try {
        const effectType = typeof message.body === "object" && message.body !== null
          ? String((message.body as { type?: unknown; tool?: unknown; kind?: unknown }).type
            ?? (message.body as { tool?: unknown }).tool
            ?? (message.body as { kind?: unknown }).kind
            ?? "")
          : "";
        const handler = options.effectHandlers?.[effectType] ?? options.effectHandlers?.["*"];
        if (!handler) throw new Error(`Unknown local effect handler: ${effectType || "<missing type>"}.`);
        const events = await handler(message.body, {
          messageId: message.id,
          attempt: message.attempt,
          signal: request.signal,
        }) ?? [];
        if (request.signal?.aborted) {
          await provider.nackQueueItem({
            effectsQueueRef: request.effectsQueueRef,
            effectsLane: request.effectsLane,
            messageId: message.id,
            leaseToken: message.leaseToken,
            reason: "Effect execution was stopped.",
          });
          return { status: "retry" as const, messageId: message.id, error: "Effect execution was stopped." };
        }
        for (const event of events) appended.push(await provider.appendJournal({ ...request, entry: event }));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (request.signal?.aborted) {
          await provider.nackQueueItem({
            effectsQueueRef: request.effectsQueueRef,
            effectsLane: request.effectsLane,
            messageId: message.id,
            leaseToken: message.leaseToken,
            reason: "Effect execution was stopped.",
          });
          return { status: "retry" as const, messageId: message.id, error: "Effect execution was stopped." };
        }
        const dead = message.attempt >= Math.max(1, request.maxAttempts ?? 5);
        appended = [];
        if (dead) {
          try {
            if (!options.effectFailureHandler) throw new Error("Terminal effect failure reporter is not configured.");
            const events = await options.effectFailureHandler(message.body, {
              messageId: message.id,
              attempt: message.attempt,
              error: reason,
            }) ?? [];
            if (events.length === 0) throw new Error("Terminal effect failure reporter produced no journal event.");
            for (const event of events) appended.push(await provider.appendJournal({ ...request, entry: event }));
          } catch (reportError) {
            const reportReason = reportError instanceof Error ? reportError.message : String(reportError);
            await provider.nackQueueItem({
              effectsQueueRef: request.effectsQueueRef,
              effectsLane: request.effectsLane,
              messageId: message.id,
              leaseToken: message.leaseToken,
              reason: reportReason,
            });
            return { status: "retry" as const, messageId: message.id, error: reportReason };
          }
        }
        await provider.nackQueueItem({
          effectsQueueRef: request.effectsQueueRef,
          effectsLane: request.effectsLane,
          messageId: message.id,
          leaseToken: message.leaseToken,
          dead,
          reason,
        });
        return {
          status: dead ? "dead" as const : "retry" as const,
          messageId: message.id,
          error: reason,
          appended,
        };
      }
      const acknowledged = await provider.ackQueueItem({
        effectsQueueRef: request.effectsQueueRef,
        effectsLane: request.effectsLane,
        messageId: message.id,
        leaseToken: message.leaseToken,
      });
      if (!acknowledged) {
        return {
          status: "retry" as const,
          messageId: message.id,
          error: `Queue acknowledgement lost for message ${message.id}.`,
          appended,
          retryAfterMs: Math.max(1, Date.parse(message.leaseExpiresAt) - Date.now()),
        };
      }
      return { status: "completed" as const, messageId: message.id, appended };
    },
  };
}

export type BrowserDurableRuntimeOptions = DurableRuntimeOptions;
export const createBrowserDurableRuntime = createDurableRuntime;
