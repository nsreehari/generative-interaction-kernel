import type { DurableProvider, QueueLeasedMessage } from "../contracts";
import { parseRef } from "../refs";

type RecordValue = {
  id: string;
  namespace: string;
  kind: string;
  key: string;
  [key: string]: unknown;
};

export type IndexedDbProviderOptions = {
  databaseName?: string;
  indexedDB?: IDBFactory;
};

export function createIndexedDbProvider(options: IndexedDbProviderOptions = {}): DurableProvider {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new Error("IndexedDB is unavailable.");
  const databaseName = options.databaseName ?? "gik-durable-runtime";
  let databasePromise: Promise<IDBDatabase> | undefined;

  function open(): Promise<IDBDatabase> {
    return databasePromise ??= new Promise((resolve, reject) => {
      const request = factory.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`Unable to open ${databaseName}.`));
    });
  }

  function result<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    });
  }

  async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const tx = (await open()).transaction("records", mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    });
    const value = await work(tx.objectStore("records"));
    await done;
    return value;
  }

  const namespace = (ref: string) => parseRef(ref).value;
  const id = (kind: string, space: string, key: string) => `${kind}\u0000${space}\u0000${key}`;
  const prefix = (kind: string, space: string) => `${kind}\u0000${space}\u0000`;
  const runtimeSpace = (ref: string) => `${namespace(ref)}:state`;
  const queueSpace = (ref: string, lane = "effects") => `${namespace(ref)}:queue:${lane}`;

  async function records(store: IDBObjectStore, kind: string, space: string): Promise<RecordValue[]> {
    const start = prefix(kind, space);
    return result(store.getAll(IDBKeyRange.bound(start, `${start}\uffff`))) as Promise<RecordValue[]>;
  }

  async function finishQueue(request: {
    effectsQueueRef: string; effectsLane?: string; messageId: string; leaseToken: string;
    dead?: boolean; reason?: string;
  }, success: boolean): Promise<boolean> {
    const space = queueSpace(request.effectsQueueRef, request.effectsLane);
    return transaction("readwrite", async (store) => {
      const recordId = id("runtime-effect", space, request.messageId);
      const current = await result(store.get(recordId)) as RecordValue | undefined;
      if (!current || current.state !== "leased" || current.leaseToken !== request.leaseToken) return false;
      await result(store.put({
        ...current,
        state: success ? "done" : request.dead ? "dead" : "active",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        reason: request.reason,
      }));
      return true;
    });
  }

  return {
    appendJournal<T>(journalRef: string, entry: T) {
      const space = namespace(journalRef);
      return transaction("readwrite", async (store) => {
        const counterId = id("journal", space, "__counter__");
        const counter = await result(store.get(counterId)) as RecordValue | undefined;
        const sequence = Number(counter?.sequence ?? 0) + 1;
        const entryId = crypto.randomUUID();
        await result(store.put({ id: counterId, namespace: space, kind: "journal", key: "__counter__", sequence }));
        await result(store.add({
          id: id("journal", space, entryId), namespace: space, kind: "journal", key: entryId,
          sequence, value: entry,
        }));
        return { id: entryId, payload: entry };
      });
    },

    initializeRuntime(request) {
      const stateSpace = runtimeSpace(request.stateRef);
      return transaction("readwrite", async (store) => {
        const stateId = id("runtime-state", stateSpace, "__state__");
        const current = await result(store.get(stateId)) as RecordValue | undefined;
        if (current) {
          if (current.kernelId !== request.kernelId) {
            throw new Error(`Runtime state belongs to kernel ${String(current.kernelId)}, not ${request.kernelId}.`);
          }
          return { created: false, revision: String(current.revision) };
        }
        const revision = crypto.randomUUID();
        await result(store.add({
          id: stateId, namespace: stateSpace, kind: "runtime-state", key: "__state__",
          kernelId: request.kernelId, revision, cursor: null, value: request.initialState,
        }));
        return { created: true, revision };
      });
    },

    acquireTransition<TState, TEvent>(request) {
      const stateSpace = runtimeSpace(request.stateRef);
      const journalSpace = namespace(request.journalRef);
      return transaction("readwrite", async (store) => {
        const lockId = id("runtime-lock", stateSpace, "__lock__");
        const lock = await result(store.get(lockId)) as RecordValue | undefined;
        const now = Date.now();
        if (lock && Date.parse(String(lock.leaseExpiresAt)) > now) return null;
        const state = await result(store.get(id("runtime-state", stateSpace, "__state__"))) as RecordValue | undefined;
        if (!state) throw new Error("Runtime is not initialized.");
        if (state.kernelId !== request.kernelId) {
          throw new Error(`Runtime state belongs to kernel ${String(state.kernelId)}, not ${request.kernelId}.`);
        }
        const leaseToken = crypto.randomUUID();
        const leaseExpiresAt = new Date(now + Math.max(1, request.leaseMs ?? 300_000)).toISOString();
        await result(store.put({
          id: lockId, namespace: stateSpace, kind: "runtime-lock", key: "__lock__",
          leaseToken, leaseExpiresAt,
        }));
        const cursor = typeof state?.cursor === "string" ? state.cursor : null;
        const journal = (await records(store, "journal", journalSpace))
          .filter((record) => record.key !== "__counter__")
          .sort((left, right) => Number(left.sequence) - Number(right.sequence));
        const cursorIndex = cursor ? journal.findIndex((record) => record.key === cursor) : -1;
        const selected = cursor && cursorIndex >= 0 ? journal.slice(cursorIndex + 1) : journal;
        return {
          leaseToken,
          leaseExpiresAt,
          state: state.value as TState,
          revision: String(state.revision),
          cursor,
          entries: selected.map((record) => ({ id: record.key, payload: record.value as TEvent })),
        };
      });
    },

    commitTransition(request) {
      const stateSpace = runtimeSpace(request.stateRef);
      const effectsSpace = queueSpace(request.effectsQueueRef, request.effectsLane);
      return transaction("readwrite", async (store) => {
        const lockId = id("runtime-lock", stateSpace, "__lock__");
        const lock = await result(store.get(lockId)) as RecordValue | undefined;
        const stateId = id("runtime-state", stateSpace, "__state__");
        const current = await result(store.get(stateId)) as RecordValue | undefined;
        const revision = typeof current?.revision === "string" ? current.revision : null;
        if (!lock || lock.leaseToken !== request.leaseToken || Date.parse(String(lock.leaseExpiresAt)) <= Date.now()) {
          return { ok: false, reason: "lease-lost" as const, revision };
        }
        const cursor = typeof current?.cursor === "string" ? current.cursor : null;
        if (revision !== request.expectedRevision || cursor !== request.previousCursor) {
          await result(store.delete(lockId));
          return { ok: false, reason: "conflict" as const, revision };
        }
        const nextRevision = crypto.randomUUID();
        await result(store.put({
          id: stateId, namespace: stateSpace, kind: "runtime-state", key: "__state__",
          kernelId: request.kernelId, revision: nextRevision, cursor: request.nextCursor, value: request.state,
        }));
        const enqueuedAt = new Date().toISOString();
        for (const effect of request.effects) {
          const effectId = crypto.randomUUID();
          await result(store.add({
            id: id("runtime-effect", effectsSpace, effectId), namespace: effectsSpace,
            kind: "runtime-effect", key: effectId, body: effect, enqueuedAt, attempt: 0, state: "active",
          }));
        }
        await result(store.delete(lockId));
        return { ok: true, revision: nextRevision };
      });
    },

    abortTransition(request) {
      const stateSpace = runtimeSpace(request.stateRef);
      return transaction("readwrite", async (store) => {
        const lockId = id("runtime-lock", stateSpace, "__lock__");
        const lock = await result(store.get(lockId)) as RecordValue | undefined;
        if (!lock || lock.leaseToken !== request.leaseToken) return false;
        await result(store.delete(lockId));
        return true;
      });
    },

    leaseQueueItem<TEffect>(request) {
      const space = queueSpace(request.effectsQueueRef, request.effectsLane);
      return transaction("readwrite", async (store) => {
        const now = Date.now();
        const [current] = (await records(store, "runtime-effect", space))
          .filter((record) => record.state === "active"
            || record.state === "leased" && Date.parse(String(record.leaseExpiresAt)) <= now)
          .sort((left, right) => String(left.enqueuedAt).localeCompare(String(right.enqueuedAt)));
        if (!current) return null;
        const leaseToken = crypto.randomUUID();
        const leaseExpiresAt = new Date(now + Math.max(1, request.visibilityMs ?? 60_000)).toISOString();
        const attempt = Number(current.attempt ?? 0) + 1;
        await result(store.put({ ...current, state: "leased", attempt, leaseToken, leaseExpiresAt }));
        return {
          id: current.key,
          body: current.body as TEffect,
          enqueuedAt: String(current.enqueuedAt),
          attempt,
          leaseToken,
          leaseExpiresAt,
        } satisfies QueueLeasedMessage<TEffect>;
      });
    },
    ackQueueItem: (request) => finishQueue(request, true),
    nackQueueItem: (request) => finishQueue(request, false),
  };
}
