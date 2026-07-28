import { randomUUID } from "node:crypto";

import type { RuntimeRefs, TransitionRefs } from "../../contracts";
import type {
  EngineWakeStorage,
  JournalStorage,
  LeasedTransitionStorage,
  QueueLaneStorage,
} from "../contracts";

type Release = () => Promise<void>;
type KeyValueStorage = {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
};
type StagedQueueStorage = QueueLaneStorage & {
  stage(body: unknown): Promise<{ id: string } | null>;
  commitStaged(messageId: string): Promise<boolean>;
  discardStaged(messageId: string, reason?: string): Promise<boolean>;
};
export interface FilesystemDurableStoragePrimitives {
  namespaceForRef(ref: string): string;
  journalStorageForRef(ref: string): JournalStorage;
  engineWakeStorageForRef(ref: string): EngineWakeStorage;
  kvStorageForRef(ref: string): KeyValueStorage;
  queueStorageForRef(ref: string, lane?: string): StagedQueueStorage;
  lockForRef(ref: string): { tryAcquire(): Promise<Release | null> };
}
type PersistedRuntimeState = {
  runtimeId: string;
  revision: string;
  cursor: string | null;
  state: unknown;
  spec: unknown;
  specUpdates: unknown[];
};
type HeldTransition = {
  refsKey: string;
  runtimeId: string;
  release: Release;
  timer: ReturnType<typeof setTimeout>;
};

export function createFilesystemDurableStorage(
  storage: FilesystemDurableStoragePrimitives,
) {
  const runtimeStateKey = "__gik_runtime_state__";
  const transitionTokens = new Map<string, HeldTransition>();
  function runtimeRefs(request: Record<string, unknown>): RuntimeRefs {
    for (const name of ["stateRef", "effectsQueueRef"] as const)
      if (typeof request[name] !== "string" || !request[name])
        throw new Error(`${name} must be a non-empty string.`);
    const stateRef = request.stateRef as string;
    const effectsQueueRef = request.effectsQueueRef as string;
    if (
      storage.namespaceForRef(stateRef) !==
      storage.namespaceForRef(effectsQueueRef)
    )
      throw new Error(
        "Filesystem transitions require stateRef and effectsQueueRef to use the same namespace.",
      );
    return {
      stateRef,
      effectsQueueRef,
      effectsLane:
        request.effectsLane === undefined || request.effectsLane === null
          ? "effects"
          : String(request.effectsLane),
    };
  }
  function transitionRefs(request: Record<string, unknown>): TransitionRefs {
    if (typeof request.journalRef !== "string" || !request.journalRef)
      throw new Error("journalRef must be a non-empty string.");
    return { ...runtimeRefs(request), journalRef: request.journalRef };
  }
  const refsKey = (refs: TransitionRefs) =>
    JSON.stringify([
      refs.stateRef,
      refs.journalRef,
      refs.effectsQueueRef,
      refs.effectsLane ?? "effects",
    ]);
  async function releaseTransition(token: string) {
    const held = transitionTokens.get(token);
    if (!held) return false;
    transitionTokens.delete(token);
    clearTimeout(held.timer);
    await held.release();
    return true;
  }
  function transitionStorage(runtimeId: string): LeasedTransitionStorage {
    if (!runtimeId) throw new Error("runtimeId must be a non-empty string.");
    return {
      async initialize(refs, initialState, initialSpec) {
        runtimeRefs(refs as Record<string, unknown>);
        const release = await storage.lockForRef(refs.stateRef).tryAcquire();
        if (!release) throw new Error("Runtime is busy.");
        try {
          const stateStorage = storage.kvStorageForRef(refs.stateRef);
          const current = (await stateStorage.read(
            runtimeStateKey,
          )) as PersistedRuntimeState | null;
          if (current) {
            if (current.runtimeId !== runtimeId)
              throw new Error(
                `Runtime state belongs to runtime ${current.runtimeId}, not ${runtimeId}.`,
              );
            return { created: false, revision: current.revision };
          }
          const revision = randomUUID();
          await stateStorage.write(runtimeStateKey, {
            runtimeId,
            revision,
            cursor: null,
            state: initialState,
            spec: initialSpec,
            specUpdates: [],
          });
          return { created: true, revision };
        } finally {
          await release();
        }
      },
      async acquire(refs, options) {
        transitionRefs(refs as Record<string, unknown>);
        const release = await storage.lockForRef(refs.stateRef).tryAcquire();
        if (!release) return null;
        const leaseMs = Math.max(1, Math.floor(options?.leaseMs ?? 300_000));
        const leaseToken = randomUUID();
        const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
        const timer = setTimeout(
          () => releaseTransition(leaseToken).catch(() => {}),
          leaseMs,
        );
        timer.unref?.();
        transitionTokens.set(leaseToken, {
          refsKey: refsKey(refs),
          runtimeId,
          release,
          timer,
        });
        try {
          const persisted = (await storage
            .kvStorageForRef(refs.stateRef)
            .read(runtimeStateKey)) as PersistedRuntimeState | null;
          if (!persisted) throw new Error("Runtime is not initialized.");
          if (persisted.runtimeId !== runtimeId)
            throw new Error(
              `Runtime state belongs to runtime ${persisted.runtimeId}, not ${runtimeId}.`,
            );
          const journal = await storage
            .journalStorageForRef(refs.journalRef)
            .readAfter(persisted.cursor);
          return {
            leaseToken,
            leaseExpiresAt,
            state: persisted.state,
            spec: persisted.spec,
            revision: persisted.revision,
            cursor: persisted.cursor,
            entries: journal.entries,
          };
        } catch (error) {
          await releaseTransition(leaseToken);
          throw error;
        }
      },
      async commit(request) {
        const refs: TransitionRefs = {
          stateRef: request.stateRef,
          journalRef: request.journalRef,
          effectsQueueRef: request.effectsQueueRef,
          effectsLane: request.effectsLane ?? "effects",
        };
        const held = transitionTokens.get(request.leaseToken);
        if (
          !held ||
          held.refsKey !== refsKey(refs) ||
          held.runtimeId !== runtimeId
        )
          return { ok: false, reason: "lease-lost", revision: null };
        try {
          const stateStorage = storage.kvStorageForRef(request.stateRef);
          const current = (await stateStorage.read(
            runtimeStateKey,
          )) as PersistedRuntimeState | null;
          const revision = current?.revision ?? null;
          if (
            revision !== request.expectedRevision ||
            (current?.cursor ?? null) !== request.previousCursor
          )
            return { ok: false, reason: "conflict", revision };
          const queue = storage.queueStorageForRef(
            request.effectsQueueRef,
            request.effectsLane ?? "effects",
          );
          const staged: Array<{ id: string }> = [];
          try {
            for (const effect of request.effects) {
              const message = await queue.stage(effect);
              if (!message)
                throw new Error("Unable to stage filesystem effect.");
              staged.push(message);
            }
            const nextRevision = randomUUID();
            await stateStorage.write(runtimeStateKey, {
              runtimeId,
              revision: nextRevision,
              cursor: request.nextCursor,
              state: request.state ?? null,
              spec: request.spec ?? null,
              specUpdates: request.specUpdates,
            });
            for (const message of staged) await queue.commitStaged(message.id);
            return { ok: true, revision: nextRevision };
          } catch (error) {
            for (const message of staged)
              await queue
                .discardStaged(message.id, "transition commit failed")
                .catch(() => false);
            throw error;
          }
        } finally {
          await releaseTransition(request.leaseToken);
        }
      },
      async abort(refs, leaseToken) {
        const held = transitionTokens.get(leaseToken);
        if (
          !held ||
          held.refsKey !== refsKey(refs) ||
          held.runtimeId !== runtimeId
        )
          return false;
        return releaseTransition(leaseToken);
      },
    };
  }
  return {
    journalStorageForRef: (ref: string) => storage.journalStorageForRef(ref),
    transitionStorage,
    engineWakeStorage: (refs: RuntimeRefs) => {
      const normalized = runtimeRefs(refs as Record<string, unknown>);
      return storage.engineWakeStorageForRef(normalized.stateRef);
    },
    effectsQueueStorage: (effectsQueueRef: string, effectsLane?: string) =>
      storage.queueStorageForRef(effectsQueueRef, effectsLane ?? "effects"),
    async appendJournalAndWake(request: Record<string, unknown>) {
      const refs = transitionRefs(request);
      if (!Object.prototype.hasOwnProperty.call(request, "entry"))
        throw new Error("entry is required.");
      const entry = await storage
        .journalStorageForRef(refs.journalRef)
        .append(request.entry);
      await storage.engineWakeStorageForRef(refs.stateRef).request();
      return entry;
    },
    readEngineWake(request: Record<string, unknown>) {
      const refs = runtimeRefs(request);
      return storage.engineWakeStorageForRef(refs.stateRef).read();
    },
    async markEngineWakeProcessed(request: Record<string, unknown>) {
      const refs = runtimeRefs(request);
      if (typeof request.processedAt !== "string" || !request.processedAt)
        throw new Error("processedAt must be a non-empty string.");
      await storage
        .engineWakeStorageForRef(refs.stateRef)
        .markProcessed(request.processedAt);
    },
    initializeRuntime(request: Record<string, unknown>) {
      const refs = runtimeRefs(request);
      if (typeof request.runtimeId !== "string" || !request.runtimeId)
        throw new Error("runtimeId must be a non-empty string.");
      if (!Object.prototype.hasOwnProperty.call(request, "initialState"))
        throw new Error("initialState is required.");
      if (!Object.prototype.hasOwnProperty.call(request, "initialSpec"))
        throw new Error("initialSpec is required.");
      return transitionStorage(request.runtimeId).initialize(
        refs,
        request.initialState,
        request.initialSpec,
      );
    },
    acquireTransition(request: Record<string, unknown>) {
      const refs = transitionRefs(request);
      if (typeof request.runtimeId !== "string" || !request.runtimeId)
        throw new Error("runtimeId must be a non-empty string.");
      const leaseMs =
        typeof request.leaseMs === "number" &&
        Number.isInteger(request.leaseMs) &&
        request.leaseMs > 0
          ? request.leaseMs
          : undefined;
      return transitionStorage(request.runtimeId).acquire(refs, { leaseMs });
    },
    commitTransition(request: Record<string, unknown>) {
      const refs = transitionRefs(request);
      if (typeof request.runtimeId !== "string" || !request.runtimeId)
        throw new Error("runtimeId must be a non-empty string.");
      if (!Array.isArray(request.effects))
        throw new Error("effects must be an array.");
      if (!Array.isArray(request.specUpdates))
        throw new Error("specUpdates must be an array.");
      return transitionStorage(request.runtimeId).commit({
        ...refs,
        leaseToken: String(request.leaseToken ?? ""),
        expectedRevision:
          request.expectedRevision === null
            ? null
            : String(request.expectedRevision),
        previousCursor:
          request.previousCursor === null
            ? null
            : String(request.previousCursor),
        nextCursor: String(request.nextCursor),
        state: request.state,
        spec: request.spec,
        specUpdates: request.specUpdates,
        effects: request.effects,
      });
    },
    abortTransition(request: Record<string, unknown>) {
      const refs = transitionRefs(request);
      if (typeof request.runtimeId !== "string" || !request.runtimeId)
        throw new Error("runtimeId must be a non-empty string.");
      return transitionStorage(request.runtimeId).abort(
        refs,
        String(request.leaseToken ?? ""),
      );
    },
  };
}
