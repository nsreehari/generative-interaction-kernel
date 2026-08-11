import { parseRef } from "../../refs";
import { createStorageRef, type StorageApi } from "../api";

export function createMemoryStorageRef(namespace: string): string {
  return createStorageRef("memory", namespace);
}

export function createMemoryStorageApi(): StorageApi {
  const namespaces = new Map<string, Map<string, unknown>>();

  return {
    async dispatch(request) {
      const parsed = parseRef(request.ref);
      if (parsed.kind !== "memory") {
        throw new Error(`Unsupported storage ref kind: ${parsed.kind}`);
      }
      const records = namespaces.get(parsed.value) ?? new Map<string, unknown>();
      namespaces.set(parsed.value, records);
      const args = request.args ?? [];
      const key = String(args[0]);
      if (request.operation === "read") return structuredClone(records.get(key) ?? null);
      if (request.operation === "write") {
        records.set(key, structuredClone(args[1]));
        return;
      }
      if (request.operation === "delete") {
        records.delete(key);
        return;
      }
      const prefix = args[0] == null ? "" : key;
      return [...records.keys()].filter((recordKey) => recordKey.startsWith(prefix)).sort();
    },
  };
}