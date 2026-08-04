import type {
  DurableProvider,
  QueueLeasedMessage,
  RuntimeRefs,
  RuntimeSnapshotInvalidation,
  RuntimeSnapshotInvalidationSubscription,
  RuntimeSnapshotPatch,
  TransitionCommit,
  TransitionRefs,
} from "../contracts";
import { createRuntimeSnapshotPatch } from "../snapshot-changes";

type RuntimeRecord = {
  runtimeId: string;
  state: unknown;
  spec: unknown;
  revision: string;
  cursor: string | null;
  snapshotChange?: RuntimeSnapshotPatch;
  lease?: { token: string; expiresAt: string };
};

type QueueRecord = {
  id: string;
  body: unknown;
  enqueuedAt: string;
  attempt: number;
  state: "active" | "leased" | "done" | "dead";
  leaseToken?: string;
  leaseExpiresAt?: string;
  reason?: string;
};

function nextTimestamp(after?: string | null): string {
  const now = new Date().toISOString();
  return after && now <= after
    ? new Date(Date.parse(after) + 1).toISOString()
    : now;
}

export function createInMemoryProvider(): DurableProvider {
  const runtimes = new Map<string, RuntimeRecord>();
  const journals = new Map<string, Array<{ id: string; payload: unknown }>>();
  const wakes = new Map<string, { requestedAt: string | null; processedAt: string | null }>();
  const queues = new Map<string, QueueRecord[]>();
  const listeners = new Set<{
    request: Parameters<RuntimeSnapshotInvalidationSubscription>[0];
    listener: Parameters<RuntimeSnapshotInvalidationSubscription>[1];
  }>();
  const queueKey = (ref: string, lane = "effects") => `${ref}:${lane}`;

  function runtime(request: { stateRef: string; runtimeId: string }): RuntimeRecord {
    const current = runtimes.get(request.stateRef);
    if (!current) throw new Error("Runtime is not initialized.");
    if (current.runtimeId !== request.runtimeId) {
      throw new Error(`Runtime state belongs to runtime ${current.runtimeId}, not ${request.runtimeId}.`);
    }
    return current;
  }

  function publish(invalidation: RuntimeSnapshotInvalidation): void {
    queueMicrotask(() => {
      for (const subscription of listeners) {
        if (subscription.request.runtimeId === invalidation.runtimeId
          && subscription.request.stateRef === invalidation.stateRef) {
          subscription.listener(invalidation);
        }
      }
    });
  }

  return {
    subscribeSnapshotInvalidations(request, listener, options) {
      const subscription = { request, listener };
      listeners.add(subscription);
      const cleanup = () => listeners.delete(subscription);
      if (options.signal.aborted) cleanup();
      else options.signal.addEventListener("abort", cleanup, { once: true });
      return cleanup;
    },
    async appendJournal(request) {
      const entries = journals.get(request.journalRef) ?? [];
      const entry = { id: crypto.randomUUID(), payload: structuredClone(request.entry) };
      entries.push(entry);
      journals.set(request.journalRef, entries);
      const wake = wakes.get(request.stateRef) ?? { requestedAt: null, processedAt: null };
      wakes.set(request.stateRef, { ...wake, requestedAt: nextTimestamp(wake.processedAt) });
      return structuredClone(entry);
    },
    async readEngineWake(request) {
      return structuredClone(wakes.get(request.stateRef) ?? { requestedAt: null, processedAt: null });
    },
    async markEngineWakeProcessed(request, processedAt) {
      const wake = wakes.get(request.stateRef) ?? { requestedAt: null, processedAt: null };
      if (!wake.processedAt || processedAt > wake.processedAt) {
        wakes.set(request.stateRef, { ...wake, processedAt });
      }
    },
    async initializeRuntime(request) {
      const current = runtimes.get(request.stateRef);
      if (current) {
        runtime(request);
        return { created: false, revision: current.revision };
      }
      const revision = crypto.randomUUID();
      runtimes.set(request.stateRef, {
        runtimeId: request.runtimeId,
        state: structuredClone(request.initialState),
        spec: structuredClone(request.initialSpec),
        revision,
        cursor: null,
      });
      return { created: true, revision };
    },
    async readSnapshot<TState, TSpec>(request: RuntimeRefs & { runtimeId: string }) {
      const current = runtime(request);
      return {
        state: structuredClone(current.state) as TState,
        spec: structuredClone(current.spec) as TSpec,
        revision: current.revision,
      };
    },
    async readSnapshotChanges<TState, TSpec>(request: RuntimeRefs & {
      runtimeId: string;
      afterRevision: string | null;
    }) {
      const current = runtime(request);
      if (request.afterRevision === current.revision) {
        return { kind: "unchanged", revision: current.revision };
      }
      const snapshotChange = current.snapshotChange;
      if (snapshotChange?.baseRevision === request.afterRevision) {
        return {
          kind: "changes",
          baseRevision: snapshotChange.baseRevision,
          revision: snapshotChange.revision,
          operations: structuredClone(snapshotChange.operations),
        };
      }
      return {
        kind: "reset",
        snapshot: {
          state: structuredClone(current.state) as TState,
          spec: structuredClone(current.spec) as TSpec,
          revision: current.revision,
        },
      };
    },
    async acquireTransition<TState, TSpec, TEvent>(request: TransitionRefs & {
      runtimeId: string;
      leaseMs?: number;
    }) {
      const current = runtime(request);
      if (current.lease && Date.parse(current.lease.expiresAt) > Date.now()) return null;
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + Math.max(1, request.leaseMs ?? 300_000)).toISOString();
      current.lease = { token, expiresAt };
      const entries = journals.get(request.journalRef) ?? [];
      const cursorIndex = current.cursor ? entries.findIndex((entry) => entry.id === current.cursor) : -1;
      return {
        leaseToken: token,
        leaseExpiresAt: expiresAt,
        state: structuredClone(current.state) as TState,
        spec: structuredClone(current.spec) as TSpec,
        revision: current.revision,
        cursor: current.cursor,
        entries: entries.slice(cursorIndex + 1).map((entry) => structuredClone(entry) as { id: string; payload: TEvent }),
      };
    },
    async commitTransition(request: TransitionCommit) {
      const current = runtime(request);
      if (!current.lease
        || current.lease.token !== request.leaseToken
        || Date.parse(current.lease.expiresAt) <= Date.now()) {
        return { ok: false, reason: "lease-lost", revision: current.revision };
      }
      if (current.revision !== request.expectedRevision || current.cursor !== request.previousCursor) {
        current.lease = undefined;
        return { ok: false, reason: "conflict", revision: current.revision };
      }
      const revision = crypto.randomUUID();
      const snapshotChange = createRuntimeSnapshotPatch({
        state: current.state,
        spec: current.spec,
        revision: current.revision,
      }, {
        state: request.state,
        spec: request.spec,
        revision,
      });
      Object.assign(current, {
        state: structuredClone(request.state),
        spec: structuredClone(request.spec),
        revision,
        cursor: request.nextCursor,
        snapshotChange,
        lease: undefined,
      });
      const key = queueKey(request.effectsQueueRef, request.effectsLane);
      const queue = queues.get(key) ?? [];
      for (const effect of request.effects) {
        queue.push({
          id: crypto.randomUUID(),
          body: structuredClone(effect),
          enqueuedAt: new Date().toISOString(),
          attempt: 0,
          state: "active",
        });
      }
      queues.set(key, queue);
      publish({ runtimeId: request.runtimeId, stateRef: request.stateRef, observedRevision: revision });
      return { ok: true, revision };
    },
    async abortTransition(request) {
      const current = runtime(request);
      if (current.lease?.token !== request.leaseToken) return false;
      current.lease = undefined;
      return true;
    },
    async leaseQueueItem<TEffect>(request: {
      effectsQueueRef: string;
      effectsLane?: string;
      visibilityMs?: number;
    }) {
      const queue = queues.get(queueKey(request.effectsQueueRef, request.effectsLane)) ?? [];
      const now = Date.now();
      const message = queue.find((item) => item.state === "active"
        || item.state === "leased" && Date.parse(item.leaseExpiresAt ?? "") <= now);
      if (!message) return null;
      message.state = "leased";
      message.attempt += 1;
      message.leaseToken = crypto.randomUUID();
      message.leaseExpiresAt = new Date(now + Math.max(1, request.visibilityMs ?? 30_000)).toISOString();
      return structuredClone({
        id: message.id,
        body: message.body as TEffect,
        enqueuedAt: message.enqueuedAt,
        attempt: message.attempt,
        leaseToken: message.leaseToken,
        leaseExpiresAt: message.leaseExpiresAt,
      }) as QueueLeasedMessage<TEffect>;
    },
    async ackQueueItem(request) {
      const message = (queues.get(queueKey(request.effectsQueueRef, request.effectsLane)) ?? [])
        .find((item) => item.id === request.messageId);
      if (!message || message.state !== "leased" || message.leaseToken !== request.leaseToken) return false;
      message.state = "done";
      message.leaseToken = undefined;
      message.leaseExpiresAt = undefined;
      return true;
    },
    async nackQueueItem(request) {
      const message = (queues.get(queueKey(request.effectsQueueRef, request.effectsLane)) ?? [])
        .find((item) => item.id === request.messageId);
      if (!message || message.state !== "leased" || message.leaseToken !== request.leaseToken) return false;
      message.state = request.dead ? "dead" : "active";
      message.reason = request.reason;
      message.leaseToken = undefined;
      message.leaseExpiresAt = undefined;
      return true;
    },
  };
}
