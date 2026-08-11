import type { StorageApi } from "@gik/durable-runtime";
import type { Json } from "@gik/kernel";

export interface StorageSeedCatalog {
  format: "gik-storage-seed/1";
  namespace: string;
  records: Array<{ key: string; value: Json }>;
}

export function storageSeedValue<T>(catalog: StorageSeedCatalog, key: string): T | undefined {
  return catalog.records.find((record) => record.key === key)?.value as T | undefined;
}

export function storageSeedValues<T>(catalog: StorageSeedCatalog, prefix: string): T[] {
  return catalog.records
    .filter((record) => record.key.startsWith(prefix))
    .map((record) => record.value as T);
}

export function createSeededStorageConnection(
  api: StorageApi,
  ref: string,
  catalog: StorageSeedCatalog,
): { api: StorageApi; ref: string } {
  let seeded: Promise<void> | undefined;
  const seed = () => seeded ??= Promise.all(catalog.records.map((record) => api.dispatch({
    ref,
    capability: "kv",
    operation: "write",
    args: [record.key, record.value],
  }))).then(() => undefined);
  return {
    ref,
    api: {
      async dispatch(request) {
        await seed();
        return api.dispatch(request);
      },
    },
  };
}