import type {
  AsyncArchiveFactory,
  AsyncAtomicRelayLock,
  AsyncBlobStorage,
  AsyncJSONStorage,
  AsyncJournalStorage,
  AsyncKVStorage,
  AsyncQueueStorage,
  AsyncScratchStorage,
  AsyncStorageProvider,
} from "../library/contracts";
import { parseRef, type RefStorageLibrary } from "../library/refs";
import type { StorageHttpBatchRequest, StorageHttpBatchResponse, StorageHttpRequest } from "./contracts";

export interface RemoteStorageOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}

export type RemoteStorageBatchInvoker = (requests: StorageHttpBatchRequest) => Promise<StorageHttpBatchResponse>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function createRemoteStorageBatchInvoker(options: RemoteStorageOptions): RemoteStorageBatchInvoker {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required for remote storage.");
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/api/storage`;
  return async (requests) => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify(requests),
    });
    const payload = await response.json() as StorageHttpBatchResponse;
    if (!response.ok) throw new Error(`Storage request failed with status ${response.status}.`);
    if (!Array.isArray(payload)) throw new Error("Storage response must be an array of operation results.");
    return payload;
  };
}

export function createRemoteStorageLibrary(options: RemoteStorageOptions): RefStorageLibrary {
  const invokeBatch = createRemoteStorageBatchInvoker(options);
  async function invoke<T>(request: StorageHttpRequest): Promise<T> {
    const result = (await invokeBatch([request]))[0];
    if (!result?.ok) throw new Error(result?.error || "Storage request returned no result.");
    return result.result as T;
  }
  const call = <T>(ref: string, capability: StorageHttpRequest["capability"], operation: string, args: unknown[] = [], extra: Partial<StorageHttpRequest> = {}) =>
    invoke<T>({ ref, capability, operation, args, ...extra });
  const kv = (ref: string, capability: "kv" | "json" = "kv"): AsyncKVStorage => ({
    read: (key) => call(ref, capability, "read", [key]),
    write: (key, value) => call(ref, capability, "write", [key, value]),
    delete: (key) => call(ref, capability, "delete", [key]),
    listKeys: (prefix) => call(ref, capability, "listKeys", [prefix]),
  });
  const blob = (ref: string, capability: "blob" | "scratch" | "archive" = "blob", extra: Partial<StorageHttpRequest> = {}): AsyncBlobStorage => ({
    read: (key) => call(ref, capability, "read", [key], extra),
    write: (key, value) => call(ref, capability, "write", [key, value], extra),
    exists: (key) => call(ref, capability, "exists", [key], extra),
    remove: (key) => call(ref, capability, "remove", [key], extra),
    listKeys: (prefix) => call(ref, capability, "listKeys", [prefix], extra),
    renameKey: (from, to) => call(ref, capability, "renameKey", [from, to], extra),
    stat: (key) => call(ref, capability, "stat", [key], extra),
    async readBytes(key) {
      const value = await call<string | null>(ref, capability, "readBytes", [key], extra);
      return value === null ? null : base64ToBytes(value);
    },
    writeBytes: (key, value) => call(ref, capability, "writeBytes", [key, bytesToBase64(value)], extra),
  });
  const journal = (ref: string, capability: "journal" | "archive" = "journal", extra: Partial<StorageHttpRequest> = {}): AsyncJournalStorage => ({
    append: (payload) => call(ref, capability, "append", [payload], extra),
    readAll: () => call(ref, capability, "readAll", [], extra),
    readAfter: (cursor) => call(ref, capability, "readAfter", [cursor], extra),
    clear: () => call(ref, capability, "clear", [], extra),
  });
  return {
    namespaceForRef: (ref) => parseRef(ref).value,
    kvStorageForRef: (ref) => kv(ref),
    jsonStorageForRef(ref) {
      return {
        ...kv(ref, "json"),
        get: (key, path) => call(ref, "json", "get", [key, path]),
        shallowMerge: (key, patch) => call(ref, "json", "shallowMerge", [key, patch]),
        deepMerge: (key, patch) => call(ref, "json", "deepMerge", [key, patch]),
        patch: (key, path, value) => call(ref, "json", "patch", [key, path, value]),
      } as AsyncJSONStorage;
    },
    blobStorageForRef: (ref) => blob(ref),
    journalStorageForRef: (ref) => journal(ref),
    queueStorageForRef(ref, lane): AsyncQueueStorage {
      const extra = { lane };
      return {
        enqueue: (body) => call(ref, "queue", "enqueue", [body], extra),
        enqueueMany: (bodies) => call(ref, "queue", "enqueueMany", [bodies], extra),
        enqueueIfAbsent: (body, key) => call(ref, "queue", "enqueueIfAbsent", [body, key], extra),
        lease: (opts) => call(ref, "queue", "lease", [opts], extra),
        ack: (id, token) => call(ref, "queue", "ack", [id, token], extra),
        nack: (id, token, opts) => call(ref, "queue", "nack", [id, token, opts], extra),
        peekActive: (prefix) => call(ref, "queue", "peekActive", [prefix], extra),
        peekDeadLetter: (prefix) => call(ref, "queue", "peekDeadLetter", [prefix], extra),
        stage: (body, opts) => call(ref, "queue", "stage", [body, opts], extra),
        commitStaged: (id) => call(ref, "queue", "commitStaged", [id], extra),
        discardStaged: (id, reason) => call(ref, "queue", "discardStaged", [id, reason], extra),
        peekStaged: (prefix) => call(ref, "queue", "peekStaged", [prefix], extra),
      };
    },
    lockForRef(ref): AsyncAtomicRelayLock {
      return {
        async tryAcquire() {
          const token = await call<string | null>(ref, "lock", "acquire");
          return token ? () => call(ref, "lock", "release", [token]) : null;
        },
      };
    },
    scratchStorageForRef(ref): AsyncScratchStorage {
      return {
        ...blob(ref, "scratch"),
        getUniqueKey: (prefix, suffix) => call(ref, "scratch", "getUniqueKey", [prefix, suffix]),
        create: (data, prefix, suffix) => call(ref, "scratch", "create", [data, prefix, suffix]),
        config: {
          get: (key) => call(ref, "scratch", "config.get", [key]),
          set: (key, value) => call(ref, "scratch", "config.set", [key, value]),
        },
      };
    },
    archiveFactoryForRef(ref): AsyncArchiveFactory {
      return {
        stream: (name) => journal(ref, "archive", { resource: { kind: "stream", name } }),
        blob: (name) => blob(ref, "archive", { resource: { kind: "blob", name } }),
        listStreams: (prefix) => call(ref, "archive", "listStreams", [prefix]),
        listBlobs: (prefix) => call(ref, "archive", "listBlobs", [prefix]),
        config: {
          get: (key) => call(ref, "archive", "config.get", [key]),
          set: (key, value) => call(ref, "archive", "config.set", [key, value]),
        },
      };
    },
    storageProviderForRef(ref): AsyncStorageProvider {
      return { blob: blob(ref), journal: journal(ref), kv: kv(ref) };
    },
  };
}