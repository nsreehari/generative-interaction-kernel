import type {
  AsyncArchiveFactory,
  AsyncBlobStorage,
  AsyncJournalStorage,
  AsyncTokenizedRelayLock,
} from "../library/contracts";
import type { RefStorageLibrary } from "../library/refs";
import type {
  StorageHttpBatchRequest,
  StorageHttpBatchResponse,
  StorageHttpRequest,
} from "./contracts";

function optionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function tokenizedLock(lock: { tryAcquire(): Promise<unknown> }): AsyncTokenizedRelayLock {
  const candidate = lock as Partial<AsyncTokenizedRelayLock>;
  if (!candidate.tryAcquireToken || !candidate.releaseToken) {
    throw new Error("This storage provider does not support remote lock leases.");
  }
  return candidate as AsyncTokenizedRelayLock;
}

async function dispatchBlob(storage: AsyncBlobStorage, operation: string, args: unknown[]): Promise<unknown> {
  switch (operation) {
    case "read": return storage.read(String(args[0]));
    case "write": return storage.write(String(args[0]), String(args[1]));
    case "exists": return storage.exists(String(args[0]));
    case "remove": return storage.remove(String(args[0]));
    case "listKeys": return storage.listKeys(optionalString(args[0]));
    case "renameKey": return storage.renameKey(String(args[0]), String(args[1]));
    case "stat": return storage.stat?.(String(args[0])) ?? null;
    case "readBytes": {
      const value = await storage.readBytes?.(String(args[0]));
      return value ? Buffer.from(value).toString("base64") : null;
    }
    case "writeBytes": {
      if (!storage.writeBytes) throw new Error("Binary writes are not supported by this blob store.");
      return storage.writeBytes(String(args[0]), Buffer.from(String(args[1]), "base64"));
    }
    default: throw new Error(`Unsupported blob operation: ${operation}`);
  }
}

async function dispatchJournal(storage: AsyncJournalStorage, operation: string, args: unknown[]): Promise<unknown> {
  switch (operation) {
    case "append": return storage.append(args[0]);
    case "readAll": return storage.readAll();
    case "readAfter": return storage.readAfter(args[0] === null ? null : String(args[0]));
    case "clear": return storage.clear?.();
    default: throw new Error(`Unsupported journal operation: ${operation}`);
  }
}

async function dispatchArchive(archive: AsyncArchiveFactory, request: StorageHttpRequest, args: unknown[]): Promise<unknown> {
  if (request.operation === "listStreams") return archive.listStreams(optionalString(args[0]));
  if (request.operation === "listBlobs") return archive.listBlobs(optionalString(args[0]));
  if (request.operation === "config.get") return archive.config.get(String(args[0]));
  if (request.operation === "config.set") return archive.config.set(String(args[0]), args[1]);
  if (!request.resource?.name) throw new Error("Archive stream/blob operations require a named resource.");
  return request.resource.kind === "stream"
    ? dispatchJournal(archive.stream(request.resource.name), request.operation, args)
    : dispatchBlob(archive.blob(request.resource.name), request.operation, args);
}

export async function dispatchStorageHttpRequest(stores: RefStorageLibrary, request: StorageHttpRequest): Promise<unknown> {
  if (!request || typeof request.ref !== "string" || typeof request.operation !== "string") {
    throw new Error("Storage request requires ref, capability, and operation.");
  }
  const args = Array.isArray(request.args) ? request.args : [];
  switch (request.capability) {
    case "kv": {
      const storage = stores.kvStorageForRef(request.ref);
      switch (request.operation) {
        case "read": return storage.read(String(args[0]));
        case "write": return storage.write(String(args[0]), args[1]);
        case "delete": return storage.delete(String(args[0]));
        case "listKeys": return storage.listKeys(optionalString(args[0]));
        default: throw new Error(`Unsupported KV operation: ${request.operation}`);
      }
    }
    case "json": {
      const storage = stores.jsonStorageForRef(request.ref);
      switch (request.operation) {
        case "read": return storage.read(String(args[0]));
        case "write": return storage.write(String(args[0]), args[1]);
        case "delete": return storage.delete(String(args[0]));
        case "listKeys": return storage.listKeys(optionalString(args[0]));
        case "get": return storage.get(String(args[0]), String(args[1]));
        case "shallowMerge": return storage.shallowMerge(String(args[0]), args[1] as Record<string, unknown>);
        case "deepMerge": return storage.deepMerge(String(args[0]), args[1] as Record<string, unknown>);
        case "patch": return storage.patch(String(args[0]), String(args[1]), args[2]);
        default: throw new Error(`Unsupported JSON operation: ${request.operation}`);
      }
    }
    case "blob": return dispatchBlob(stores.blobStorageForRef(request.ref), request.operation, args);
    case "journal": return dispatchJournal(stores.journalStorageForRef(request.ref), request.operation, args);
    case "queue": {
      const storage = stores.queueStorageForRef(request.ref, request.lane);
      switch (request.operation) {
        case "enqueue": return storage.enqueue(args[0]);
        case "enqueueMany": return storage.enqueueMany(args[0] as unknown[]);
        case "enqueueIfAbsent": return storage.enqueueIfAbsent?.(args[0], String(args[1])) ?? null;
        case "lease": return storage.lease(args[0] as { max?: number; visibilityMs?: number } | undefined);
        case "ack": return storage.ack(String(args[0]), String(args[1]));
        case "nack": return storage.nack(String(args[0]), String(args[1]), args[2] as { dead?: boolean; reason?: string } | undefined);
        case "peekActive": return storage.peekActive(optionalString(args[0]));
        case "peekDeadLetter": return storage.peekDeadLetter(optionalString(args[0]));
        case "stage": return storage.stage(args[0], args[1] as { dedupKey?: string } | undefined);
        case "commitStaged": return storage.commitStaged(String(args[0]));
        case "discardStaged": return storage.discardStaged(String(args[0]), optionalString(args[1]));
        case "peekStaged": return storage.peekStaged(optionalString(args[0]));
        default: throw new Error(`Unsupported queue operation: ${request.operation}`);
      }
    }
    case "lock": {
      const lock = tokenizedLock(stores.lockForRef(request.ref));
      if (request.operation === "acquire") return lock.tryAcquireToken();
      if (request.operation === "release") return lock.releaseToken(String(args[0]));
      throw new Error(`Unsupported lock operation: ${request.operation}`);
    }
    case "scratch": {
      const storage = stores.scratchStorageForRef(request.ref);
      if (request.operation === "getUniqueKey") return storage.getUniqueKey(args[0] as string | undefined, args[1] as string | undefined);
      if (request.operation === "create") return storage.create(String(args[0]), args[1] as string | undefined, args[2] as string | undefined);
      if (request.operation === "config.get") return storage.config.get(String(args[0]));
      if (request.operation === "config.set") return storage.config.set(String(args[0]), args[1]);
      return dispatchBlob(storage, request.operation, args);
    }
    case "archive": return dispatchArchive(stores.archiveFactoryForRef(request.ref), request, args);
    default: throw new Error(`Unsupported storage capability: ${String(request.capability)}`);
  }
}

export async function dispatchStorageHttpBatch(
  stores: RefStorageLibrary,
  requests: StorageHttpBatchRequest,
): Promise<StorageHttpBatchResponse> {
  if (!Array.isArray(requests)) throw new Error("Storage request body must be an array of operations.");
  const responses: StorageHttpBatchResponse = [];
  for (const request of requests) {
    try {
      const result = await dispatchStorageHttpRequest(stores, request);
      responses.push({ ok: true, result: result ?? null });
    } catch (error) {
      responses.push({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return responses;
}