import type { AsyncJSONStorage, AsyncKVStorage } from "./contracts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMergeValue(current: unknown, patch: unknown): unknown {
  if (!isPlainObject(current) || !isPlainObject(patch)) return patch;
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) merged[key] = deepMergeValue(merged[key], value);
  return merged;
}

function applyJsonPath(current: Record<string, unknown>, segments: string[], value: unknown): Record<string, unknown> {
  if (segments.length === 0) return current;
  const [head, ...tail] = segments;
  if (tail.length === 0) return { ...current, [head]: value };
  const nested = isPlainObject(current[head]) ? current[head] : {};
  return { ...current, [head]: applyJsonPath(nested, tail, value) };
}

export function createJsonStorage(kv: AsyncKVStorage): AsyncJSONStorage {
  return {
    read: (key) => kv.read(key),
    write: (key, value) => kv.write(key, value),
    delete: (key) => kv.delete(key),
    listKeys: (prefix) => kv.listKeys(prefix),
    async get(key, jsonPath) {
      let current = await kv.read(key);
      for (const segment of jsonPath.split(".").filter(Boolean)) {
        if (current === null || typeof current !== "object" || Array.isArray(current)) return null;
        current = (current as Record<string, unknown>)[segment];
        if (current === undefined) return null;
      }
      return current ?? null;
    },
    async shallowMerge(key, patch) {
      const current = await kv.read(key);
      await kv.write(key, { ...(isPlainObject(current) ? current : {}), ...patch });
    },
    async deepMerge(key, patch) {
      await kv.write(key, deepMergeValue(await kv.read(key), patch));
    },
    async patch(key, jsonPath, value) {
      const current = await kv.read(key);
      await kv.write(key, applyJsonPath(isPlainObject(current) ? current : {}, jsonPath.split(".").filter(Boolean), value));
    },
  };
}