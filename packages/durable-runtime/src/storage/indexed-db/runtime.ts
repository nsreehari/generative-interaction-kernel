import type {
  DurableProvider,
  QueueLeasedMessage,
  RuntimeSnapshotPatch,
  TransitionCommit,
  TransitionRefs,
} from "../../contracts";
import { parseRef } from "../../refs";
import { createRuntimeSnapshotPatch } from "../../snapshot-changes";
import type { IndexedDbStorageOptions } from "./api/contracts";
import {
  createIndexedDbRecordLibrary,
  type IndexedDbRecord,
} from "./library/index";

export function createIndexedDbStorage(
  options: IndexedDbStorageOptions = {},
): DurableProvider {
  const library = createIndexedDbRecordLibrary(options);
  const { id, records, request, transaction } = library;
  const namespace = (ref: string) => parseRef(ref).value;
  const runtimeSpace = (ref: string) => `${namespace(ref)}:state`;
  const queueSpace = (ref: string, lane = "effects") =>
    `${namespace(ref)}:queue:${lane}`;

  async function finishQueue(
    requestValue: {
      effectsQueueRef: string;
      effectsLane?: string;
      messageId: string;
      leaseToken: string;
      dead?: boolean;
      reason?: string;
    },
    success: boolean,
  ): Promise<boolean> {
    const space = queueSpace(
      requestValue.effectsQueueRef,
      requestValue.effectsLane,
    );
    return transaction("readwrite", async (store) => {
      const recordId = id("runtime-effect", space, requestValue.messageId);
      const current = (await request(store.get(recordId))) as
        | IndexedDbRecord
        | undefined;
      if (
        !current ||
        current.state !== "leased" ||
        current.leaseToken !== requestValue.leaseToken
      )
        return false;
      await request(
        store.put({
          ...current,
          state: success ? "done" : requestValue.dead ? "dead" : "active",
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          reason: requestValue.reason,
        }),
      );
      return true;
    });
  }

  return {
    appendJournal<T>(requestValue: {
      stateRef: string;
      journalRef: string;
      effectsQueueRef: string;
      effectsLane?: string;
      entry: T;
    }) {
      const space = namespace(requestValue.journalRef);
      const stateSpace = runtimeSpace(requestValue.stateRef);
      return transaction("readwrite", async (store) => {
        const counterId = id("journal", space, "__counter__");
        const counter = (await request(store.get(counterId))) as
          | IndexedDbRecord
          | undefined;
        const sequence = Number(counter?.sequence ?? 0) + 1;
        const entryId = crypto.randomUUID();
        await request(
          store.put({
            id: counterId,
            namespace: space,
            kind: "journal",
            key: "__counter__",
            sequence,
          }),
        );
        await request(
          store.add({
            id: id("journal", space, entryId),
            namespace: space,
            kind: "journal",
            key: entryId,
            sequence,
            value: requestValue.entry,
          }),
        );
        const wakeId = id("runtime-wake", stateSpace, "__wake__");
        const wake = (await request(store.get(wakeId))) as
          | IndexedDbRecord
          | undefined;
        const processedAt =
          typeof wake?.processedAt === "string" ? wake.processedAt : null;
        const now = new Date().toISOString();
        const requestedAt =
          processedAt && now <= processedAt
            ? new Date(Date.parse(processedAt) + 1).toISOString()
            : now;
        await request(
          store.put({
            id: wakeId,
            namespace: stateSpace,
            kind: "runtime-wake",
            key: "__wake__",
            requestedAt,
            processedAt,
          }),
        );
        return { id: entryId, payload: requestValue.entry };
      });
    },
    readEngineWake(requestValue) {
      const stateSpace = runtimeSpace(requestValue.stateRef);
      return transaction("readonly", async (store) => {
        const wake = (await request(
          store.get(id("runtime-wake", stateSpace, "__wake__")),
        )) as IndexedDbRecord | undefined;
        return {
          requestedAt:
            typeof wake?.requestedAt === "string" ? wake.requestedAt : null,
          processedAt:
            typeof wake?.processedAt === "string" ? wake.processedAt : null,
        };
      });
    },
    markEngineWakeProcessed(requestValue, processedAt) {
      const stateSpace = runtimeSpace(requestValue.stateRef);
      return transaction("readwrite", async (store) => {
        const wakeId = id("runtime-wake", stateSpace, "__wake__");
        const wake = (await request(store.get(wakeId))) as
          | IndexedDbRecord
          | undefined;
        if (!wake) return;
        const current =
          typeof wake.processedAt === "string" ? wake.processedAt : null;
        if (!current || processedAt > current)
          await request(store.put({ ...wake, processedAt }));
      });
    },
    initializeRuntime(requestValue) {
      const stateSpace = runtimeSpace(requestValue.stateRef);
      return transaction("readwrite", async (store) => {
        const stateId = id("runtime-state", stateSpace, "__state__");
        const current = (await request(store.get(stateId))) as
          | IndexedDbRecord
          | undefined;
        if (current) {
          if (current.runtimeId !== requestValue.runtimeId)
            throw new Error(
              `Runtime state belongs to runtime ${String(current.runtimeId)}, not ${requestValue.runtimeId}.`,
            );
          return { created: false, revision: String(current.revision) };
        }
        const revision = crypto.randomUUID();
        await request(
          store.add({
            id: stateId,
            namespace: stateSpace,
            kind: "runtime-state",
            key: "__state__",
            runtimeId: requestValue.runtimeId,
            revision,
            cursor: null,
            value: requestValue.initialState,
            spec: requestValue.initialSpec,
            specUpdates: [],
          }),
        );
        return { created: true, revision };
      });
    },
    readSnapshot<TState, TSpec>(requestValue: {
      stateRef: string;
      effectsQueueRef: string;
      effectsLane?: string;
      runtimeId: string;
    }) {
      const stateSpace = runtimeSpace(requestValue.stateRef);
      return transaction("readonly", async (store) => {
        const state = (await request(
          store.get(id("runtime-state", stateSpace, "__state__")),
        )) as IndexedDbRecord | undefined;
        if (!state) throw new Error("Runtime is not initialized.");
        if (state.runtimeId !== requestValue.runtimeId)
          throw new Error(
            `Runtime state belongs to runtime ${String(state.runtimeId)}, not ${requestValue.runtimeId}.`,
          );
        return {
          state: state.value as TState,
          spec: state.spec as TSpec,
          revision: String(state.revision),
        };
      });
    },
    readSnapshotChanges<TState, TSpec>(requestValue: {
      stateRef: string;
      effectsQueueRef: string;
      effectsLane?: string;
      runtimeId: string;
      afterRevision: string | null;
    }) {
      const stateSpace = runtimeSpace(requestValue.stateRef);
      return transaction("readonly", async (store) => {
        const state = (await request(
          store.get(id("runtime-state", stateSpace, "__state__")),
        )) as IndexedDbRecord | undefined;
        if (!state) throw new Error("Runtime is not initialized.");
        if (state.runtimeId !== requestValue.runtimeId)
          throw new Error(
            `Runtime state belongs to runtime ${String(state.runtimeId)}, not ${requestValue.runtimeId}.`,
          );
        const revision = String(state.revision);
        if (requestValue.afterRevision === revision) {
          return { kind: "unchanged" as const, revision };
        }
        const snapshotChange = state.snapshotChange as RuntimeSnapshotPatch | undefined;
        if (
          snapshotChange?.baseRevision === requestValue.afterRevision &&
          snapshotChange.revision === revision
        ) return { kind: "changes" as const, ...snapshotChange };
        return {
          kind: "reset" as const,
          snapshot: {
            state: state.value as TState,
            spec: state.spec as TSpec,
            revision,
          },
        };
      });
    },
    acquireTransition<TState, TSpec, TEvent>(
      requestValue: TransitionRefs & { runtimeId: string; leaseMs?: number },
    ) {
      const stateSpace = runtimeSpace(requestValue.stateRef);
      const journalSpace = namespace(requestValue.journalRef);
      return transaction("readwrite", async (store) => {
        const lockId = id("runtime-lock", stateSpace, "__lock__");
        const lock = (await request(store.get(lockId))) as
          | IndexedDbRecord
          | undefined;
        const now = Date.now();
        if (lock && Date.parse(String(lock.leaseExpiresAt)) > now) return null;
        const state = (await request(
          store.get(id("runtime-state", stateSpace, "__state__")),
        )) as IndexedDbRecord | undefined;
        if (!state) throw new Error("Runtime is not initialized.");
        if (state.runtimeId !== requestValue.runtimeId)
          throw new Error(
            `Runtime state belongs to runtime ${String(state.runtimeId)}, not ${requestValue.runtimeId}.`,
          );
        const leaseToken = crypto.randomUUID();
        const leaseExpiresAt = new Date(
          now + Math.max(1, requestValue.leaseMs ?? 300_000),
        ).toISOString();
        await request(
          store.put({
            id: lockId,
            namespace: stateSpace,
            kind: "runtime-lock",
            key: "__lock__",
            leaseToken,
            leaseExpiresAt,
          }),
        );
        const cursor = typeof state.cursor === "string" ? state.cursor : null;
        const journal = (await records(store, "journal", journalSpace))
          .filter((record) => record.key !== "__counter__")
          .sort(
            (left, right) => Number(left.sequence) - Number(right.sequence),
          );
        const cursorIndex = cursor
          ? journal.findIndex((record) => record.key === cursor)
          : -1;
        const selected =
          cursor && cursorIndex >= 0 ? journal.slice(cursorIndex + 1) : journal;
        return {
          leaseToken,
          leaseExpiresAt,
          state: state.value as TState,
          spec: state.spec as TSpec,
          revision: String(state.revision),
          cursor,
          entries: selected.map((record) => ({
            id: record.key,
            payload: record.value as TEvent,
          })),
        };
      });
    },
    commitTransition(requestValue: TransitionCommit) {
      const stateSpace = runtimeSpace(requestValue.stateRef);
      const effectsSpace = queueSpace(
        requestValue.effectsQueueRef,
        requestValue.effectsLane,
      );
      return transaction("readwrite", async (store) => {
        const lockId = id("runtime-lock", stateSpace, "__lock__");
        const lock = (await request(store.get(lockId))) as
          | IndexedDbRecord
          | undefined;
        const stateId = id("runtime-state", stateSpace, "__state__");
        const current = (await request(store.get(stateId))) as
          | IndexedDbRecord
          | undefined;
        const revision =
          typeof current?.revision === "string" ? current.revision : null;
        if (
          !lock ||
          lock.leaseToken !== requestValue.leaseToken ||
          Date.parse(String(lock.leaseExpiresAt)) <= Date.now()
        )
          return { ok: false, reason: "lease-lost" as const, revision };
        const cursor =
          typeof current?.cursor === "string" ? current.cursor : null;
        if (
          revision !== requestValue.expectedRevision ||
          cursor !== requestValue.previousCursor
        ) {
          await request(store.delete(lockId));
          return { ok: false, reason: "conflict" as const, revision };
        }
        const nextRevision = crypto.randomUUID();
        const snapshotChange = current && revision
          ? createRuntimeSnapshotPatch(
              { state: current.value, spec: current.spec, revision },
              { state: requestValue.state, spec: requestValue.spec, revision: nextRevision },
            )
          : undefined;
        await request(
          store.put({
            id: stateId,
            namespace: stateSpace,
            kind: "runtime-state",
            key: "__state__",
            runtimeId: requestValue.runtimeId,
            revision: nextRevision,
            cursor: requestValue.nextCursor,
            value: requestValue.state,
            spec: requestValue.spec,
            specUpdates: requestValue.specUpdates,
            snapshotChange,
          }),
        );
        const enqueuedAt = new Date().toISOString();
        for (const effect of requestValue.effects) {
          const effectId = crypto.randomUUID();
          await request(
            store.add({
              id: id("runtime-effect", effectsSpace, effectId),
              namespace: effectsSpace,
              kind: "runtime-effect",
              key: effectId,
              body: effect,
              enqueuedAt,
              attempt: 0,
              state: "active",
            }),
          );
        }
        await request(store.delete(lockId));
        return { ok: true, revision: nextRevision };
      });
    },
    abortTransition(requestValue) {
      const stateSpace = runtimeSpace(requestValue.stateRef);
      return transaction("readwrite", async (store) => {
        const lockId = id("runtime-lock", stateSpace, "__lock__");
        const lock = (await request(store.get(lockId))) as
          | IndexedDbRecord
          | undefined;
        if (!lock || lock.leaseToken !== requestValue.leaseToken) return false;
        await request(store.delete(lockId));
        return true;
      });
    },
    leaseQueueItem<TEffect>(requestValue: {
      effectsQueueRef: string;
      effectsLane?: string;
      visibilityMs?: number;
    }) {
      const space = queueSpace(
        requestValue.effectsQueueRef,
        requestValue.effectsLane,
      );
      return transaction("readwrite", async (store) => {
        const now = Date.now();
        const [current] = (await records(store, "runtime-effect", space))
          .filter(
            (record) =>
              record.state === "active" ||
              (record.state === "leased" &&
                Date.parse(String(record.leaseExpiresAt)) <= now),
          )
          .sort((left, right) =>
            String(left.enqueuedAt).localeCompare(String(right.enqueuedAt)),
          );
        if (!current) return null;
        const leaseToken = crypto.randomUUID();
        const leaseExpiresAt = new Date(
          now + Math.max(1, requestValue.visibilityMs ?? 60_000),
        ).toISOString();
        const attempt = Number(current.attempt ?? 0) + 1;
        await request(
          store.put({
            ...current,
            state: "leased",
            attempt,
            leaseToken,
            leaseExpiresAt,
          }),
        );
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
    ackQueueItem: (requestValue) => finishQueue(requestValue, true),
    nackQueueItem: (requestValue) => finishQueue(requestValue, false),
  };
}

export const createIndexedDbProvider = createIndexedDbStorage;
