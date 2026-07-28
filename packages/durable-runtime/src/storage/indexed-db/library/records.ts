import type {
  IndexedDbLibraryOptions,
  IndexedDbRecord,
  IndexedDbRecordLibrary,
} from "./contracts";

export function createIndexedDbRecordLibrary(
  options: IndexedDbLibraryOptions = {},
): IndexedDbRecordLibrary {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new Error("IndexedDB is unavailable.");
  const databaseName = options.databaseName ?? "gik-durable-runtime";
  const databaseVersion = options.databaseVersion ?? 1;
  const objectStoreName = options.objectStoreName ?? "records";
  let databasePromise: Promise<IDBDatabase> | undefined;

  function open(): Promise<IDBDatabase> {
    return (databasePromise ??= new Promise((resolve, reject) => {
      const request = factory.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(objectStoreName)) {
          request.result.createObjectStore(objectStoreName, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error(`Unable to open ${databaseName}.`));
    }));
  }

  function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB request failed."));
    });
  }

  const id = (kind: string, space: string, key: string) =>
    `${kind}\u0000${space}\u0000${key}`;
  const prefix = (kind: string, space: string) => `${kind}\u0000${space}\u0000`;
  const range = (kind: string, space: string) => {
    const start = prefix(kind, space);
    return IDBKeyRange.bound(start, `${start}\uffff`);
  };

  return {
    databaseName,
    objectStoreName,
    id,
    prefix,
    range,
    request: requestResult,
    async transaction<T>(
      mode: IDBTransactionMode,
      work: (store: IDBObjectStore) => Promise<T>,
    ): Promise<T> {
      const tx = (await open()).transaction(objectStoreName, mode);
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () =>
          reject(tx.error ?? new Error("IndexedDB transaction aborted."));
        tx.onerror = () =>
          reject(tx.error ?? new Error("IndexedDB transaction failed."));
      });
      const value = await work(tx.objectStore(objectStoreName));
      await done;
      return value;
    },
    records(store, kind, space) {
      return requestResult(store.getAll(range(kind, space))) as Promise<
        IndexedDbRecord[]
      >;
    },
    async close() {
      const database = await databasePromise;
      database?.close();
      databasePromise = undefined;
    },
  };
}
