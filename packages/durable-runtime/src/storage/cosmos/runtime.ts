import {
  BulkOperationType,
  type Container,
  type JSONObject,
  type OperationInput,
} from "@azure/cosmos";
import { randomUUID } from "node:crypto";

import type { QueueLeasedMessage, RuntimeRefs, RuntimeSnapshotPatch } from "../../contracts";
import { createRuntimeSnapshotPatch } from "../../snapshot-changes";
import type {
  DurableStorageResolver,
  EngineWakeStorage,
  LeasedTransitionStorage,
  QueueLaneStorage,
} from "../contracts";

interface RuntimeDocument extends Record<string, unknown> {
  id: string;
  partitionKey: string;
  kind: string;
  _etag?: string;
}

interface RuntimeStateDocument extends RuntimeDocument {
  kind: "gik-state";
  runtimeId: string;
  revision: string;
  cursor: string | null;
  state: unknown;
  spec: unknown;
  specUpdates: unknown[];
  snapshotChange?: RuntimeSnapshotPatch;
}

interface RuntimeLockDocument extends RuntimeDocument {
  kind: "gik-transition-lock";
  leaseToken: string;
  leaseExpiresAt: string;
}

type EffectState = "active" | "leased" | "done" | "dead";

interface RuntimeEffectDocument extends RuntimeDocument {
  kind: "gik-effect";
  body: unknown;
  enqueuedAt: string;
  attempt: number;
  state: EffectState;
  leaseToken?: string;
  leaseExpiresAt?: string;
  reason?: string;
}

interface RuntimeWakeDocument extends RuntimeDocument {
  kind: "gik-engine-wake";
  requestedAt: string | null;
  processedAt: string | null;
}

function releasedLock(partitionKey: string): RuntimeLockDocument {
  return {
    id: "__transition_lock__",
    partitionKey,
    kind: "gik-transition-lock",
    leaseToken: "",
    leaseExpiresAt: new Date(0).toISOString(),
  };
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; statusCode?: unknown };
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  return typeof candidate.code === "number" ? candidate.code : undefined;
}

function responseStatus(response: { code?: number; result?: Array<{ statusCode: number }> }): number {
  return response.result?.find((item) => item.statusCode >= 400)?.statusCode ?? response.code ?? 200;
}

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
  }
  return value;
}

function withoutEtag<T extends RuntimeDocument>(document: T): T {
  const result = { ...document };
  delete result._etag;
  return result;
}

function jsonBody(document: RuntimeDocument): JSONObject {
  return document as unknown as JSONObject;
}

async function readDocument<T extends RuntimeDocument>(container: Container, id: string, partitionKey: string): Promise<T | null> {
  try {
    return (await container.item(id, partitionKey).read<T>()).resource ?? null;
  } catch (error) {
    if (errorStatus(error) === 404) return null;
    throw error;
  }
}

async function executeBatch(container: Container, operations: OperationInput[], partitionKey: string): Promise<number> {
  try {
    return responseStatus(await container.items.batch(operations, partitionKey));
  } catch (error) {
    const status = errorStatus(error);
    if (status !== undefined) return status;
    throw error;
  }
}

export function cosmosRuntimePartition(
  storage: Pick<DurableStorageResolver, "namespaceForRef">,
  stateRef: string,
  effectsQueueRef: string,
  effectsLane = "effects",
): string {
  const stateNamespace = storage.namespaceForRef(stateRef);
  const queueNamespace = storage.namespaceForRef(effectsQueueRef);
  if (stateNamespace !== queueNamespace) {
    throw new Error("Cosmos atomic transitions require stateRef and effectsQueueRef to use the same namespace.");
  }
  return `gik:${stateNamespace}:queue:${effectsLane}`;
}

function effectsPartition(
  storage: Pick<DurableStorageResolver, "namespaceForRef">,
  effectsQueueRef: string,
  effectsLane = "effects",
): string {
  return `gik:${storage.namespaceForRef(effectsQueueRef)}:queue:${effectsLane}`;
}

export function createCosmosTransitionStorage<
  TState = unknown,
  TSpec = unknown,
  TEvent = unknown,
  TEffect = unknown,
  TSpecUpdate = unknown,
>(
  containerInput: unknown,
  storage: Pick<DurableStorageResolver, "journalStorageForRef" | "namespaceForRef">,
  runtimeId: string,
): LeasedTransitionStorage<TState, TSpec, TEvent, TEffect, TSpecUpdate> {
  const container = containerInput as Container;
  const stateId = "__state__";
  const lockId = "__transition_lock__";

  return {
    async initialize(refs, initialState, initialSpec) {
      const partitionKey = cosmosRuntimePartition(storage, refs.stateRef, refs.effectsQueueRef, refs.effectsLane);
      const revision = randomUUID();
      const document: RuntimeStateDocument = {
        id: stateId,
        partitionKey,
        kind: "gik-state",
        runtimeId,
        revision,
        cursor: null,
        state: normalize(initialState),
        spec: normalize(initialSpec),
        specUpdates: [],
      };
      const status = await executeBatch(container, [{
        operationType: BulkOperationType.Create,
        resourceBody: jsonBody(document),
      }], partitionKey);
      if (status >= 200 && status < 300) return { created: true, revision };
      if (status !== 409) throw new Error(`Cosmos runtime initialization failed with status ${status}.`);
      const current = await readDocument<RuntimeStateDocument>(container, stateId, partitionKey);
      if (!current) throw new Error("Runtime initialization conflicted but no state was found.");
      if (current.runtimeId !== runtimeId) throw new Error(`Runtime state belongs to runtime ${current.runtimeId}, not ${runtimeId}.`);
      return { created: false, revision: current.revision };
    },

    async readSnapshot(refs) {
      const partitionKey = cosmosRuntimePartition(storage, refs.stateRef, refs.effectsQueueRef, refs.effectsLane);
      const state = await readDocument<RuntimeStateDocument>(container, stateId, partitionKey);
      if (!state) throw new Error("Runtime is not initialized.");
      if (state.runtimeId !== runtimeId) {
        throw new Error(`Runtime state belongs to runtime ${state.runtimeId}, not ${runtimeId}.`);
      }
      return {
        state: state.state as TState,
        spec: state.spec as TSpec,
        revision: state.revision,
      };
    },

    async readSnapshotChanges(refs, afterRevision) {
      const partitionKey = cosmosRuntimePartition(storage, refs.stateRef, refs.effectsQueueRef, refs.effectsLane);
      const state = await readDocument<RuntimeStateDocument>(container, stateId, partitionKey);
      if (!state) throw new Error("Runtime is not initialized.");
      if (state.runtimeId !== runtimeId) {
        throw new Error(`Runtime state belongs to runtime ${state.runtimeId}, not ${runtimeId}.`);
      }
      if (afterRevision === state.revision) {
        return { kind: "unchanged", revision: state.revision };
      }
      if (
        state.snapshotChange?.baseRevision === afterRevision &&
        state.snapshotChange.revision === state.revision
      ) return { kind: "changes", ...state.snapshotChange };
      return {
        kind: "reset",
        snapshot: {
          state: state.state as TState,
          spec: state.spec as TSpec,
          revision: state.revision,
        },
      };
    },

    async acquire(refs, options) {
      const partitionKey = cosmosRuntimePartition(storage, refs.stateRef, refs.effectsQueueRef, refs.effectsLane);
      const currentLock = await readDocument<RuntimeLockDocument>(container, lockId, partitionKey);
      const now = Date.now();
      if (currentLock && Date.parse(currentLock.leaseExpiresAt) > now) return null;
      const leaseToken = randomUUID();
      const leaseExpiresAt = new Date(now + Math.max(1, Math.floor(options?.leaseMs ?? 300_000))).toISOString();
      const lock: RuntimeLockDocument = { id: lockId, partitionKey, kind: "gik-transition-lock", leaseToken, leaseExpiresAt };
      const status = await executeBatch(container, [currentLock ? {
        operationType: BulkOperationType.Replace,
        id: lockId,
        resourceBody: jsonBody(lock),
        ifMatch: currentLock._etag,
      } : { operationType: BulkOperationType.Create, resourceBody: jsonBody(lock) }], partitionKey);
      if (status === 409 || status === 412) return null;
      if (status < 200 || status >= 300) throw new Error(`Cosmos transition acquire failed with status ${status}.`);
      const state = await readDocument<RuntimeStateDocument>(container, stateId, partitionKey);
      if (!state) {
        await this.abort(refs, leaseToken);
        throw new Error("Runtime is not initialized.");
      }
      if (state.runtimeId !== runtimeId) {
        await this.abort(refs, leaseToken);
        throw new Error(`Runtime state belongs to runtime ${state.runtimeId}, not ${runtimeId}.`);
      }
      const cursor = state.cursor || null;
      const journal = await storage.journalStorageForRef(refs.journalRef).readAfter(cursor);
      return {
        leaseToken,
        leaseExpiresAt,
        state: state.state as TState,
        spec: state.spec as TSpec,
        revision: state.revision,
        cursor,
        entries: journal.entries as Array<{ id: string; payload: TEvent }>,
      };
    },

    async commit(commit) {
      const partitionKey = cosmosRuntimePartition(storage, commit.stateRef, commit.effectsQueueRef, commit.effectsLane);
      if (commit.effects.length > 98) throw new Error("A leased Cosmos transition may emit at most 98 effects.");
      const [lock, current] = await Promise.all([
        readDocument<RuntimeLockDocument>(container, lockId, partitionKey),
        readDocument<RuntimeStateDocument>(container, stateId, partitionKey),
      ]);
      const currentRevision = current?.revision ?? null;
      if (!lock || lock.leaseToken !== commit.leaseToken || Date.parse(lock.leaseExpiresAt) <= Date.now()) {
        return { ok: false, reason: "lease-lost", revision: currentRevision };
      }
      if (currentRevision !== commit.expectedRevision || (current?.cursor || null) !== commit.previousCursor) {
        await executeBatch(container, [{
          operationType: BulkOperationType.Replace,
          id: lockId,
          resourceBody: jsonBody(releasedLock(partitionKey)),
          ifMatch: lock._etag,
        }], partitionKey);
        return { ok: false, reason: "conflict", revision: currentRevision };
      }
      const revision = randomUUID();
      const snapshotChange = current && currentRevision
        ? createRuntimeSnapshotPatch(
            { state: current.state, spec: current.spec, revision: currentRevision },
            { state: commit.state, spec: commit.spec, revision },
          )
        : undefined;
      const nextState: RuntimeStateDocument = {
        id: stateId, partitionKey, kind: "gik-state", runtimeId, revision,
        cursor: commit.nextCursor, state: normalize(commit.state),
        spec: normalize(commit.spec), specUpdates: normalize(commit.specUpdates) as unknown[],
        snapshotChange,
      };
      const operations: OperationInput[] = [current ? {
        operationType: BulkOperationType.Replace,
        id: stateId,
        resourceBody: jsonBody(nextState),
        ifMatch: current._etag,
      } : { operationType: BulkOperationType.Create, resourceBody: jsonBody(nextState) }];
      const enqueuedAt = new Date().toISOString();
      for (const effect of commit.effects) {
        operations.push({
          operationType: BulkOperationType.Create,
          resourceBody: jsonBody({
            id: randomUUID(), partitionKey, kind: "gik-effect", body: normalize(effect),
            enqueuedAt, attempt: 0, state: "active",
          } satisfies RuntimeEffectDocument),
        });
      }
      operations.push({
        operationType: BulkOperationType.Replace,
        id: lockId,
        resourceBody: jsonBody(releasedLock(partitionKey)),
        ifMatch: lock._etag,
      });
      const status = await executeBatch(container, operations, partitionKey);
      if (status >= 200 && status < 300) return { ok: true, revision };
      if (status === 409 || status === 412) return { ok: false, reason: "lease-lost", revision: currentRevision };
      throw new Error(`Cosmos leased transition commit failed with status ${status}.`);
    },

    async abort(refs, leaseToken) {
      const partitionKey = cosmosRuntimePartition(storage, refs.stateRef, refs.effectsQueueRef, refs.effectsLane);
      const lock = await readDocument<RuntimeLockDocument>(container, lockId, partitionKey);
      if (!lock || lock.leaseToken !== leaseToken) return false;
      const status = await executeBatch(container, [{
        operationType: BulkOperationType.Replace,
        id: lockId,
        resourceBody: jsonBody(releasedLock(partitionKey)),
        ifMatch: lock._etag,
      }], partitionKey);
      return status >= 200 && status < 300;
    },
  };
}

export function createCosmosEffectsQueue(
  containerInput: unknown,
  storage: Pick<DurableStorageResolver, "namespaceForRef">,
  effectsQueueRef: string,
  effectsLane?: string,
): QueueLaneStorage {
  const container = containerInput as Container;
  const partitionKey = effectsPartition(storage, effectsQueueRef, effectsLane);
  async function replaceIfCurrent(document: RuntimeEffectDocument): Promise<boolean> {
    try {
      await container.item(document.id, partitionKey).replace(withoutEtag(document), {
        accessCondition: { type: "IfMatch", condition: document._etag ?? "" },
      });
      return true;
    } catch (error) {
      if (errorStatus(error) === 404 || errorStatus(error) === 412) return false;
      throw error;
    }
  }
  return {
    async lease<T>(options: { max?: number; visibilityMs?: number } = {}) {
      const max = Math.max(1, Math.floor(options.max ?? 1));
      const visibilityMs = Math.max(1, Math.floor(options.visibilityMs ?? 60_000));
      const now = new Date().toISOString();
      const { resources } = await container.items.query<RuntimeEffectDocument>({
        query: `SELECT * FROM c
          WHERE c.partitionKey = @partitionKey AND c.kind = "gik-effect"
            AND (c.state = "active" OR (c.state = "leased" AND c.leaseExpiresAt < @now))
          ORDER BY c.enqueuedAt`,
        parameters: [{ name: "@partitionKey", value: partitionKey }, { name: "@now", value: now }],
      }, { partitionKey }).fetchAll();
      const leased: QueueLeasedMessage<T>[] = [];
      for (const current of resources) {
        if (leased.length >= max) break;
        const leaseToken = randomUUID();
        const leaseExpiresAt = new Date(Date.now() + visibilityMs).toISOString();
        const claimed: RuntimeEffectDocument = {
          ...current, state: "leased", attempt: current.attempt + 1, leaseToken, leaseExpiresAt,
        };
        if (!await replaceIfCurrent(claimed)) continue;
        leased.push({
          id: claimed.id, body: claimed.body as T, enqueuedAt: claimed.enqueuedAt,
          attempt: claimed.attempt, leaseToken, leaseExpiresAt,
        });
      }
      return leased;
    },
    async ack(messageId, leaseToken) {
      const current = await readDocument<RuntimeEffectDocument>(container, messageId, partitionKey);
      if (!current || current.state !== "leased" || current.leaseToken !== leaseToken) return false;
      const done: RuntimeEffectDocument = { ...current, state: "done" };
      delete done.leaseToken;
      delete done.leaseExpiresAt;
      return replaceIfCurrent(done);
    },
    async nack(messageId, leaseToken, options) {
      const current = await readDocument<RuntimeEffectDocument>(container, messageId, partitionKey);
      if (!current || current.state !== "leased" || current.leaseToken !== leaseToken) return false;
      const next: RuntimeEffectDocument = {
        ...current, state: options?.dead ? "dead" : "active",
        ...(options?.reason ? { reason: options.reason } : {}),
      };
      delete next.leaseToken;
      delete next.leaseExpiresAt;
      return replaceIfCurrent(next);
    },
  };
}

export function createCosmosEngineWakeStorage(
  containerInput: unknown,
  storage: Pick<DurableStorageResolver, "namespaceForRef">,
  refs: RuntimeRefs,
): EngineWakeStorage {
  const container = containerInput as Container;
  const id = "__engine_wake__";
  const partitionKey = cosmosRuntimePartition(storage, refs.stateRef, refs.effectsQueueRef, refs.effectsLane);
  async function update(change: (current: RuntimeWakeDocument | null) => RuntimeWakeDocument): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await readDocument<RuntimeWakeDocument>(container, id, partitionKey);
      const next = change(current);
      const status = await executeBatch(container, [current ? {
        operationType: BulkOperationType.Replace, id, resourceBody: jsonBody(next), ifMatch: current._etag,
      } : { operationType: BulkOperationType.Create, resourceBody: jsonBody(next) }], partitionKey);
      if (status >= 200 && status < 300) return;
      if (status !== 409 && status !== 412) throw new Error(`Cosmos engine wake update failed with status ${status}.`);
    }
    throw new Error("Cosmos engine wake update conflicted repeatedly.");
  }
  return {
    async request() {
      let requestedAt = "";
      await update((current) => {
        const processedAt = current?.processedAt ?? null;
        const now = new Date().toISOString();
        requestedAt = processedAt && now <= processedAt ? new Date(Date.parse(processedAt) + 1).toISOString() : now;
        return { id, partitionKey, kind: "gik-engine-wake", requestedAt, processedAt };
      });
      return requestedAt;
    },
    async read() {
      const current = await readDocument<RuntimeWakeDocument>(container, id, partitionKey);
      return { requestedAt: current?.requestedAt ?? null, processedAt: current?.processedAt ?? null };
    },
    markProcessed(processedAt) {
      return update((current) => ({
        id, partitionKey, kind: "gik-engine-wake", requestedAt: current?.requestedAt ?? null,
        processedAt: !current?.processedAt || processedAt > current.processedAt ? processedAt : current.processedAt,
      }));
    },
  };
}

export const createCosmosLeasedTransitionStore = createCosmosTransitionStorage;
export const createCosmosEngineWakeStore = createCosmosEngineWakeStorage;