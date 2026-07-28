import { BulkOperationType, type Container, type JSONObject, type OperationInput } from "@azure/cosmos";
import { randomUUID } from "node:crypto";
import type {
  AsyncJournalStorage,
  AsyncKVStorage,
  AsyncQueueStorage,
  AsyncTokenizedRelayLock,
  JournalEntry,
  QueueDeadLetterMessage,
  QueueLeasedMessage,
  QueueMessage,
} from "./contracts";

interface BaseDocument extends Record<string, unknown> { id: string; partitionKey: string; kind: string; _etag?: string }
interface KvDocument extends BaseDocument { kind: "kv"; key: string; value: unknown }
interface CounterDocument extends BaseDocument { kind: "journal-counter" | "queue-counter"; sequence: number }
interface JournalDocument extends BaseDocument { kind: "journal-entry"; sequence: number; payload: unknown }
type QueueState = "staged" | "active" | "leased" | "done" | "dead";
interface QueueDocument extends BaseDocument {
  kind: "queue-message"; body: unknown; enqueuedAt: string; attempt: number; sequence: number; state: QueueState;
  leaseToken?: string; leaseExpiresAt?: string; reason?: string; dedupKey?: string;
}
interface DedupDocument extends BaseDocument { kind: "queue-dedup"; messageId: string }
interface LockDocument extends BaseDocument { kind: "lock"; holderId: string; expiresAt: string }

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; statusCode?: unknown };
  return typeof candidate.statusCode === "number" ? candidate.statusCode : typeof candidate.code === "number" ? candidate.code : undefined;
}
function batchStatus(response: { code?: number; result?: Array<{ statusCode: number }> }): number {
  return response.result?.find((item) => item.statusCode >= 400)?.statusCode ?? response.code ?? 200;
}
async function executeBatch(container: Container, operations: OperationInput[], partitionKey: string): Promise<number> {
  try { return batchStatus(await container.items.batch(operations, partitionKey)); }
  catch (error) { const code = statusCode(error); if (code !== undefined) return code; throw error; }
}
function documentId(key: string): string { return Buffer.from(key, "utf8").toString("base64url"); }
function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
  return value;
}
function withoutEtag<T extends BaseDocument>(document: T): T { const result = { ...document }; delete result._etag; return result; }
function jsonBody(document: BaseDocument): JSONObject { return document as unknown as JSONObject; }
async function readDocument<T extends BaseDocument>(container: Container, id: string, partitionKey: string): Promise<T | null> {
  try { return (await container.item(id, partitionKey).read<T>()).resource ?? null; }
  catch (error) { if (statusCode(error) === 404) return null; throw error; }
}
async function readOrCreateCounter(container: Container, partitionKey: string, kind: CounterDocument["kind"]): Promise<CounterDocument> {
  const current = await readDocument<CounterDocument>(container, "__counter__", partitionKey);
  if (current) return current;
  try {
    const { resource } = await container.items.create<CounterDocument>({ id: "__counter__", partitionKey, kind, sequence: 0 });
    if (!resource) throw new Error(`Counter for ${partitionKey} was not created.`);
    return resource;
  } catch (error) {
    if (statusCode(error) !== 409) throw error;
    const raced = await readDocument<CounterDocument>(container, "__counter__", partitionKey);
    if (!raced) throw new Error(`Counter for ${partitionKey} disappeared after creation conflict.`);
    return raced;
  }
}

export function createCosmosKvStorage(container: Container, namespace: string): AsyncKVStorage {
  const partitionKey = `kv:${namespace}`;
  return {
    async read(key) { return (await readDocument<KvDocument>(container, documentId(key), partitionKey))?.value ?? null; },
    async write(key, value) { await container.items.upsert<KvDocument>({ id: documentId(key), partitionKey, kind: "kv", key, value: normalize(value) }); },
    async delete(key) { try { await container.item(documentId(key), partitionKey).delete(); } catch (error) { if (statusCode(error) !== 404) throw error; } },
    async listKeys(prefix = "") {
      const { resources } = await container.items.query<{ key: string }>({
        query: "SELECT c.key FROM c WHERE c.partitionKey = @partitionKey AND c.kind = \"kv\" AND STARTSWITH(c.key, @prefix)",
        parameters: [{ name: "@partitionKey", value: partitionKey }, { name: "@prefix", value: prefix }],
      }, { partitionKey }).fetchAll();
      return resources.map((resource) => resource.key).sort();
    },
  };
}

export function createCosmosJournalStorage(container: Container, namespace: string): AsyncJournalStorage {
  const partitionKey = `journal:${namespace}`;
  async function queryAfter(sequence: number): Promise<JournalDocument[]> {
    return (await container.items.query<JournalDocument>({
      query: "SELECT * FROM c WHERE c.partitionKey = @partitionKey AND c.kind = \"journal-entry\" AND c.sequence > @sequence ORDER BY c.sequence",
      parameters: [{ name: "@partitionKey", value: partitionKey }, { name: "@sequence", value: sequence }],
    }, { partitionKey }).fetchAll()).resources;
  }
  return {
    async append(payload): Promise<JournalEntry> {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const counter = await readOrCreateCounter(container, partitionKey, "journal-counter");
        const entry: JournalDocument = { id: randomUUID(), partitionKey, kind: "journal-entry", sequence: counter.sequence + 1, payload: normalize(payload) };
        const code = await executeBatch(container, [
          { operationType: BulkOperationType.Replace, id: counter.id, resourceBody: jsonBody(withoutEtag({ ...counter, sequence: entry.sequence })), ifMatch: counter._etag },
          { operationType: BulkOperationType.Create, resourceBody: jsonBody(entry) },
        ], partitionKey);
        if (code >= 200 && code < 300) return { id: entry.id, payload };
        if (code !== 409 && code !== 412) throw new Error(`Journal append failed with status ${code}.`);
      }
      throw new Error(`Journal append contention exceeded retry limit for ${namespace}.`);
    },
    async readAll() { return (await queryAfter(0)).map(({ id, payload }) => ({ id, payload })); },
    async readAfter(cursor) {
      const cursorEntry = cursor ? await readDocument<JournalDocument>(container, cursor, partitionKey) : null;
      const entries = await queryAfter(cursorEntry?.kind === "journal-entry" ? cursorEntry.sequence : 0);
      return { entries: entries.map(({ id, payload }) => ({ id, payload })), newCursor: entries.length ? entries[entries.length - 1].id : cursor };
    },
    async clear() {
      for (const entry of await queryAfter(0)) await container.item(entry.id, partitionKey).delete();
      try { await container.item("__counter__", partitionKey).delete(); } catch (error) { if (statusCode(error) !== 404) throw error; }
    },
  };
}

function toQueueMessage<T>(document: QueueDocument): QueueMessage<T> {
  return { id: document.id, body: document.body as T, enqueuedAt: document.enqueuedAt, attempt: document.attempt };
}
function toLeasedMessage<T>(document: QueueDocument): QueueLeasedMessage<T> {
  return { ...toQueueMessage<T>(document), leaseToken: document.leaseToken ?? "", leaseExpiresAt: document.leaseExpiresAt ?? "" };
}
function toDeadMessage<T>(document: QueueDocument): QueueDeadLetterMessage<T> { return { ...toQueueMessage<T>(document), reason: document.reason }; }

export function createCosmosQueueStorage(container: Container, namespace: string): AsyncQueueStorage {
  const partitionKey = `queue:${namespace}`;
  const dedupId = (key: string) => `dedup:${documentId(key)}`;
  async function queryState(state: QueueState): Promise<QueueDocument[]> {
    return (await container.items.query<QueueDocument>({
      query: "SELECT * FROM c WHERE c.partitionKey = @partitionKey AND c.kind = \"queue-message\" AND c.state = @state ORDER BY c.sequence",
      parameters: [{ name: "@partitionKey", value: partitionKey }, { name: "@state", value: state }],
    }, { partitionKey }).fetchAll()).resources;
  }
  async function replaceIfCurrent(document: QueueDocument): Promise<boolean> {
    try { await container.item(document.id, partitionKey).replace(withoutEtag(document), { accessCondition: { type: "IfMatch", condition: document._etag ?? "" } }); return true; }
    catch (error) { if ([404, 412].includes(statusCode(error) ?? 0)) return false; throw error; }
  }
  async function enqueueState<T>(body: T, state: "active" | "staged", dedupKey?: string): Promise<QueueMessage<T> | null> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (dedupKey && await readDocument<DedupDocument>(container, dedupId(dedupKey), partitionKey)) return null;
      const counter = await readOrCreateCounter(container, partitionKey, "queue-counter");
      const message: QueueDocument = { id: randomUUID(), partitionKey, kind: "queue-message", body: normalize(body), enqueuedAt: new Date().toISOString(), attempt: 0, sequence: counter.sequence + 1, state, ...(dedupKey ? { dedupKey } : {}) };
      const operations: OperationInput[] = [
        { operationType: BulkOperationType.Replace, id: counter.id, resourceBody: jsonBody(withoutEtag({ ...counter, sequence: message.sequence })), ifMatch: counter._etag },
        { operationType: BulkOperationType.Create, resourceBody: jsonBody(message) },
      ];
      if (dedupKey) operations.push({ operationType: BulkOperationType.Create, resourceBody: jsonBody({ id: dedupId(dedupKey), partitionKey, kind: "queue-dedup", messageId: message.id } satisfies DedupDocument) });
      const code = await executeBatch(container, operations, partitionKey);
      if (code >= 200 && code < 300) return toQueueMessage<T>(message);
      if (code !== 409 && code !== 412) throw new Error(`Queue enqueue failed with status ${code}.`);
      if (dedupKey && await readDocument<DedupDocument>(container, dedupId(dedupKey), partitionKey)) return null;
    }
    throw new Error(`Queue enqueue contention exceeded retry limit for ${namespace}.`);
  }
  async function reviveExpiredLeases(): Promise<void> {
    for (const document of await queryState("leased")) {
      if (!document.leaseExpiresAt || Date.parse(document.leaseExpiresAt) > Date.now()) continue;
      const revived = { ...document, state: "active" as const }; delete revived.leaseToken; delete revived.leaseExpiresAt; await replaceIfCurrent(revived);
    }
  }
  async function finish(current: QueueDocument, replacement?: QueueDocument): Promise<boolean> {
    const terminal = replacement ?? { ...current, state: "done" as const }; delete terminal.leaseToken; delete terminal.leaseExpiresAt;
    const operations: OperationInput[] = [{ operationType: BulkOperationType.Replace, id: current.id, resourceBody: jsonBody(withoutEtag(terminal)), ifMatch: current._etag }];
    if (current.dedupKey) operations.push({ operationType: BulkOperationType.Delete, id: dedupId(current.dedupKey) });
    const code = await executeBatch(container, operations, partitionKey);
    if (code === 404 || code === 412) return false;
    if (code < 200 || code >= 300) throw new Error(`Queue transition failed with status ${code}.`);
    return true;
  }
  return {
    async enqueue<T>(body: T) { return (await enqueueState(body, "active"))!; },
    async enqueueMany<T>(bodies: T[]) { const messages: QueueMessage<T>[] = []; for (const body of bodies) messages.push(await this.enqueue(body)); return messages; },
    enqueueIfAbsent: (body, key) => enqueueState(body, "active", key),
    async lease<T>(options?: { max?: number; visibilityMs?: number }) {
      await reviveExpiredLeases(); const leased: QueueLeasedMessage<T>[] = []; const max = Math.max(1, Math.floor(options?.max ?? 1));
      for (const document of await queryState("active")) {
        if (leased.length >= max) break;
        const claimed: QueueDocument = { ...document, state: "leased", attempt: document.attempt + 1, leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + Math.max(1, Math.floor(options?.visibilityMs ?? 60_000))).toISOString() };
        if (await replaceIfCurrent(claimed)) leased.push(toLeasedMessage<T>(claimed));
      }
      return leased;
    },
    async ack(id, token) { const item = await readDocument<QueueDocument>(container, id, partitionKey); return !!item && item.state === "leased" && item.leaseToken === token && finish(item); },
    async nack(id, token, options) {
      const item = await readDocument<QueueDocument>(container, id, partitionKey); if (!item || item.state !== "leased" || item.leaseToken !== token) return false;
      const next: QueueDocument = { ...item, state: options?.dead ? "dead" : "active", ...(options?.dead && options.reason !== undefined ? { reason: options.reason } : {}) }; delete next.leaseToken; delete next.leaseExpiresAt;
      return options?.dead ? finish(item, next) : replaceIfCurrent(next);
    },
    async peekActive<T>(prefix = "") { await reviveExpiredLeases(); return (await queryState("active")).filter((item) => item.id.startsWith(prefix)).map(toQueueMessage<T>); },
    async peekDeadLetter<T>(prefix = "") { return (await queryState("dead")).filter((item) => item.id.startsWith(prefix)).map(toDeadMessage<T>); },
    stage: (body, options) => enqueueState(body, "staged", options?.dedupKey),
    async commitStaged(id) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const item = await readDocument<QueueDocument>(container, id, partitionKey); if (!item || item.state !== "staged") return false;
        const counter = await readOrCreateCounter(container, partitionKey, "queue-counter");
        const promoted: QueueDocument = { ...withoutEtag(item), state: "active", enqueuedAt: new Date().toISOString(), attempt: 0, sequence: counter.sequence + 1 };
        const code = await executeBatch(container, [
          { operationType: BulkOperationType.Replace, id: counter.id, resourceBody: jsonBody(withoutEtag({ ...counter, sequence: promoted.sequence })), ifMatch: counter._etag },
          { operationType: BulkOperationType.Replace, id: item.id, resourceBody: jsonBody(promoted), ifMatch: item._etag },
        ], partitionKey);
        if (code >= 200 && code < 300) return true;
        if (code !== 409 && code !== 412) throw new Error(`Queue staged commit failed with status ${code}.`);
      }
      throw new Error(`Queue staged commit contention exceeded retry limit for ${namespace}.`);
    },
    async discardStaged(id, reason) { const item = await readDocument<QueueDocument>(container, id, partitionKey); return !!item && item.state === "staged" && finish(item, { ...item, state: "dead", ...(reason !== undefined ? { reason } : {}) }); },
    async peekStaged<T>(prefix = "") { return (await queryState("staged")).filter((item) => item.id.startsWith(prefix)).map(toQueueMessage<T>); },
  };
}

export function createCosmosAtomicRelayLock(container: Container, namespace: string, ttlMs = 30_000): AsyncTokenizedRelayLock {
  const partitionKey = `lock:${namespace}`; const id = "__lock__";
  const lock: AsyncTokenizedRelayLock = {
    async tryAcquireToken() {
      const holderId = randomUUID(); const next: LockDocument = { id, partitionKey, kind: "lock", holderId, expiresAt: new Date(Date.now() + ttlMs).toISOString() };
      const current = await readDocument<LockDocument>(container, id, partitionKey); if (current && Date.parse(current.expiresAt) > Date.now()) return null;
      try {
        if (current) await container.item(id, partitionKey).replace(next, { accessCondition: { type: "IfMatch", condition: current._etag ?? "" } });
        else await container.items.create(next);
      } catch (error) { if ([409, 412].includes(statusCode(error) ?? 0)) return null; throw error; }
      return holderId;
    },
    async releaseToken(holderId) {
      const latest = await readDocument<LockDocument>(container, id, partitionKey); if (!latest || latest.holderId !== holderId) return;
      await container.item(id, partitionKey).replace({ ...withoutEtag(latest), expiresAt: new Date(0).toISOString() }, { accessCondition: { type: "IfMatch", condition: latest._etag ?? "" } });
    },
    async tryAcquire() { const token = await lock.tryAcquireToken(); return token ? () => lock.releaseToken(token) : null; },
  };
  return lock;
}