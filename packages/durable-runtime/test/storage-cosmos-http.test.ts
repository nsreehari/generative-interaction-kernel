import { describe, expect, it, vi } from "vitest";
import type { AsyncTokenizedRelayLock } from "../src/storage/cosmos/library";
import { createRefStorageLibrary, createStoresProxyRef } from "../src/storage/cosmos/library";
import type { StorageHttpBatchRequest } from "../src/storage/cosmos/api";
import { createRemoteStorageLibrary, dispatchStorageHttpBatch } from "../src/storage/cosmos/api";

describe("Cosmos storage HTTP protocol", () => {
  it("round-trips core capabilities through the remote adapter", async () => {
    const kv = {
      read: vi.fn(async () => ({ value: 1 })), write: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined), listKeys: vi.fn(async () => ["key"]),
    };
    const journal = {
      append: vi.fn(async (payload) => ({ id: "entry", payload })), readAll: vi.fn(async () => []),
      readAfter: vi.fn(async (cursor) => ({ entries: [], newCursor: cursor })), clear: vi.fn(async () => undefined),
    };
    const blob = {
      read: vi.fn(async () => "blob-value"), write: vi.fn(async () => undefined), exists: vi.fn(async () => true),
      remove: vi.fn(async () => undefined), readBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
      writeBytes: vi.fn(async () => undefined), listKeys: vi.fn(async () => ["key"]), renameKey: vi.fn(async () => true),
    };
    const lock: AsyncTokenizedRelayLock = {
      tryAcquireToken: vi.fn(async () => "token"), releaseToken: vi.fn(async () => undefined), async tryAcquire() { return null; },
    };
    const unsupported = vi.fn(() => { throw new Error("unused"); });
    const server = createRefStorageLibrary({
      kv: () => kv, journal: () => journal, blob: () => blob, lock: () => lock,
      json: unsupported, queue: unsupported, scratch: unsupported, archive: unsupported,
      provider: () => ({ kv, journal, blob }),
    });
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requests = JSON.parse(String(init?.body)) as StorageHttpBatchRequest;
      return new Response(JSON.stringify(await dispatchStorageHttpBatch(server, requests)), { status: 200 });
    });
    const remote = createRemoteStorageLibrary({ baseUrl: "https://portable.example", fetch });
    const ref = createStoresProxyRef("boards/demo");
    expect(await remote.kvStorageForRef(ref).read("key")).toEqual({ value: 1 });
    expect((await remote.journalStorageForRef(ref).append({ event: true })).id).toBe("entry");
    expect(await remote.blobStorageForRef(ref).readBytes?.("key")).toEqual(new Uint8Array([1, 2, 3]));
    const release = await remote.lockForRef(ref).tryAcquire();
    await release?.();
    expect(lock.releaseToken).toHaveBeenCalledWith("token");
  });

  it("executes batches in order and reports failures per operation", async () => {
    const values = new Map<string, unknown>();
    const kv = {
      read: vi.fn(async (key: string) => values.get(key) ?? null),
      write: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }),
      delete: vi.fn(async (key: string) => { values.delete(key); }),
      listKeys: vi.fn(async () => [...values.keys()]),
    };
    const unsupported = vi.fn(() => { throw new Error("unused"); });
    const server = createRefStorageLibrary({
      kv: () => kv, blob: unsupported, journal: unsupported, queue: unsupported, json: unsupported,
      lock: unsupported, scratch: unsupported, archive: unsupported, provider: unsupported,
    });
    const ref = createStoresProxyRef("batch");
    expect(await dispatchStorageHttpBatch(server, [
      { ref, capability: "kv", operation: "write", args: ["key", "value"] },
      { ref, capability: "kv", operation: "unsupported" },
      { ref, capability: "kv", operation: "read", args: ["key"] },
    ])).toEqual([
      { ok: true, result: null },
      { ok: false, error: "Unsupported KV operation: unsupported" },
      { ok: true, result: "value" },
    ]);
  });
});