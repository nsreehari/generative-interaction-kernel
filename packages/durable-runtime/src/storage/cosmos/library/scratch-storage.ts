import type { AsyncBlobStorage, AsyncKVStorage, AsyncScratchStorage } from "./contracts";

const defaultMaxAgeMs = 24 * 60 * 60 * 1000;
const defaultSweepIntervalMs = 12 * 60 * 60 * 1000;

function sanitize(value: string | undefined, fallback: string): string {
  return (value || fallback).replace(/[^A-Za-z0-9._-]/g, "_") || fallback;
}

export function createScratchStorage(blob: AsyncBlobStorage, configKv: AsyncKVStorage): AsyncScratchStorage {
  async function maybeSweep(): Promise<void> {
    const maxAgeMs = Number(await configKv.read("retention.maxAgeMs") ?? defaultMaxAgeMs);
    const intervalMs = Number(await configKv.read("retention.sweepIntervalMs") ?? defaultSweepIntervalMs);
    const lastSweepAt = Number(await configKv.read("retention.lastSweepAt") ?? 0);
    const now = Date.now();
    if (maxAgeMs <= 0 || intervalMs <= 0 || now - lastSweepAt < intervalMs) return;
    await configKv.write("retention.lastSweepAt", now);
    for (const key of await blob.listKeys()) {
      const stat = await blob.stat?.(key);
      if (stat?.updatedAt && now - Date.parse(stat.updatedAt) > maxAgeMs) await blob.remove(key);
    }
  }
  return {
    read: (key) => blob.read(key),
    async write(key, content) { await blob.write(key, content); await maybeSweep(); },
    exists: (key) => blob.exists(key),
    remove: (key) => blob.remove(key),
    readBytes: blob.readBytes ? (key) => blob.readBytes!(key) : undefined,
    async writeBytes(key, content) {
      if (!blob.writeBytes) throw new Error("Binary writes are not supported by this blob store.");
      await blob.writeBytes(key, content);
      await maybeSweep();
    },
    listKeys: (prefix) => blob.listKeys(prefix),
    stat: blob.stat ? (key) => blob.stat!(key) : undefined,
    renameKey: (from, to) => blob.renameKey(from, to),
    async getUniqueKey(prefix = "scratch", suffix = ".json") {
      const safePrefix = sanitize(prefix, "scratch");
      const safeSuffix = sanitize(suffix, ".json");
      return `${safePrefix}-${Date.now()}-${globalThis.crypto.randomUUID()}${safeSuffix.startsWith(".") ? safeSuffix : `.${safeSuffix}`}`;
    },
    async create(data, prefix, suffix) {
      const key = await this.getUniqueKey(prefix, suffix);
      await this.write(key, data);
      return key;
    },
    config: {
      get: (key) => configKv.read(key),
      async set(key, value) {
        if (value === null || value === undefined) await configKv.delete(key);
        else await configKv.write(key, value);
      },
    },
  };
}