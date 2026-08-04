import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFilesystemStorageDispatcher } from "../src/storage/filesystem/api";
import { createFilesystemDurableStorage } from "../src/storage/filesystem";
import {
  createFilesystemRef,
  createFilesystemStorageLibrary,
  createFsAtomicRelayLock,
  parseFilesystemRef,
} from "../src/storage/filesystem/library";

const roots: string[] = [];

async function fixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "gik-fs-storage-"));
  roots.push(rootDir);
  const storage = createFilesystemStorageLibrary({ rootDir });
  return { rootDir, storage, ref: storage.createRef("scope") };
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("filesystem storage library", () => {
  it("confines refs, keys, and queue lanes to the configured root", async () => {
    const { rootDir, storage, ref } = await fixture();
    expect(parseFilesystemRef(ref).kind).toBe("fs-path");
    expect(() => createFilesystemRef(rootDir, "../outside")).toThrow(/escapes/);
    const escaped = Buffer.from(
      JSON.stringify({
        kind: "fs-path",
        value: path.resolve(rootDir, "..", "outside"),
      }),
    ).toString("base64url");
    expect(() => storage.kvStorageForRef(`b64:${escaped}`)).toThrow(/escapes/);
    expect(() =>
      storage.blobStorageForRef(ref).write("../outside", "bad"),
    ).toThrow(/escapes/);
    expect(() => storage.queueStorageForRef(ref, "../outside")).toThrow(
      /escapes/,
    );
  });

  it("composes KV, JSON, blob, scratch, and archive storage", async () => {
    const { storage, ref } = await fixture();
    const kv = storage.kvStorageForRef(ref);
    expect(await kv.read("missing")).toBeNull();
    await kv.write("cards/2", { value: 2 });
    await kv.write("cards/1", { value: 1 });
    expect(await kv.listKeys("cards/")).toEqual(["cards/1", "cards/2"]);

    const json = storage.jsonStorageForRef(ref);
    await json.write("document", { nested: { first: 1 } });
    await json.deepMerge("document", { nested: { second: 2 } });
    expect(await json.get("document", "nested")).toEqual({
      first: 1,
      second: 2,
    });

    const blob = storage.blobStorageForRef(ref);
    await blob.write("staged/a.txt", "hello");
    await blob.writeBytes("bytes.bin", new Uint8Array([1, 2, 3]));
    expect(await blob.renameKey("staged/a.txt", "live/a.txt")).toBe(true);
    expect(await blob.read("live/a.txt")).toBe("hello");
    expect(await blob.readBytes("bytes.bin")).toEqual(
      new Uint8Array([1, 2, 3]),
    );

    const scratch = storage.scratchStorageForRef(ref);
    const scratchKey = await scratch.create("temporary", "result", ".txt");
    expect(await scratch.read(scratchKey)).toBe("temporary");
    await scratch.config.set("retention.maxAgeMs", 5_000);
    expect(await scratch.config.get("retention.maxAgeMs")).toBe(5_000);

    const archive = storage.archiveFactoryForRef(ref);
    await archive.stream("events").append({ type: "created" });
    await archive.blob("snapshots").write("one.json", "{}");
    expect(await archive.listStreams()).toEqual(["events"]);
    expect(await archive.listBlobs()).toEqual(["snapshots"]);
  });

  it("uses exact exclusive journal cursors and durable wake markers", async () => {
    const { storage, ref } = await fixture();
    const journal = storage.journalStorageForRef(ref);
    const first = await journal.append({ eventId: "same" });
    const second = await journal.append({ eventId: "same" });
    expect(await journal.readAfter(first.id)).toEqual({
      entries: [second],
      newCursor: second.id,
    });

    const wake = storage.engineWakeStorageForRef(ref);
    const requestedAt = await wake.request();
    expect((await wake.read()).requestedAt).toBe(requestedAt);
    await wake.markProcessed(requestedAt);
    expect((await wake.read()).processedAt).toBe(requestedAt);
  });

  it("supports queue dedup, staging, expiry, retry, ack, and dead letters", async () => {
    const { storage, ref } = await fixture();
    const queue = storage.queueStorageForRef(ref, "effects");
    const queued = await queue.enqueueIfAbsent({ task: "one" }, "task-one");
    expect(queued).not.toBeNull();
    expect(
      await queue.enqueueIfAbsent({ task: "duplicate" }, "task-one"),
    ).toBeNull();
    const staged = await queue.stage({ task: "later" }, { dedupKey: "later" });
    expect(staged).not.toBeNull();
    expect(await queue.commitStaged(staged!.id)).toBe(true);

    const [leased] = await queue.lease({ max: 1, visibilityMs: 1 });
    expect(leased.id).toBe(queued!.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const [retried] = await queue.lease({ max: 1 });
    expect(retried.attempt).toBe(2);
    expect(await queue.ack(retried.id, "wrong")).toBe(false);
    expect(
      await queue.nack(retried.id, retried.leaseToken, {
        dead: true,
        reason: "failed",
      }),
    ).toBe(true);
    expect((await queue.peekDeadLetter())[0].reason).toBe("failed");

    const [next] = await queue.lease();
    expect(await queue.ack(next.id, next.leaseToken)).toBe(true);
  });

  it("provides non-blocking holder-safe relay locks", async () => {
    const { rootDir } = await fixture();
    const first = createFsAtomicRelayLock(path.join(rootDir, "relay.lock"));
    const second = createFsAtomicRelayLock(path.join(rootDir, "relay.lock"));
    const releaseFirst = await first.tryAcquire();
    expect(releaseFirst).not.toBeNull();
    expect(await second.tryAcquire()).toBeNull();
    await releaseFirst!();
    const releaseSecond = await second.tryAcquire();
    expect(releaseSecond).not.toBeNull();
    expect(await first.tryAcquire()).toBeNull();
    await releaseSecond!();
  });

  it("reads committed runtime snapshots while a transition lease is held", async () => {
    const { storage, ref } = await fixture();
    const durable = createFilesystemDurableStorage(storage);
    const refs = { stateRef: ref, journalRef: ref, effectsQueueRef: ref };
    await durable.initializeRuntime({
      stateRef: ref,
      effectsQueueRef: ref,
      runtimeId: "snapshot-v1",
      initialState: { count: 1 },
      initialSpec: { multiplier: 2 },
    });
    const lease = await durable.acquireTransition({ ...refs, runtimeId: "snapshot-v1" });
    expect(lease).not.toBeNull();

    expect(await durable.readSnapshot({
      stateRef: ref,
      effectsQueueRef: ref,
      runtimeId: "snapshot-v1",
    })).toEqual({
      state: { count: 1 },
      spec: { multiplier: 2 },
      revision: lease!.revision,
    });

    expect(await durable.abortTransition({
      ...refs,
      runtimeId: "snapshot-v1",
      leaseToken: lease!.leaseToken,
    })).toBe(true);
  });
});

describe("filesystem storage API", () => {
  it("dispatches ordered batches and isolates operation errors", async () => {
    const { storage, ref } = await fixture();
    const dispatcher = createFilesystemStorageDispatcher(storage);
    const results = await dispatcher.dispatchBatch([
      {
        ref,
        capability: "kv",
        operation: "write",
        args: ["key", { value: 1 }],
      },
      { ref, capability: "kv", operation: "read", args: ["key"] },
      { ref, capability: "kv", operation: "unsupported" },
      {
        ref,
        capability: "blob",
        operation: "writeBytes",
        args: ["bytes.bin", Buffer.from([4, 5]).toString("base64")],
      },
      { ref, capability: "blob", operation: "readBytes", args: ["bytes.bin"] },
    ]);
    expect(results).toEqual([
      { ok: true, result: null },
      { ok: true, result: { value: 1 } },
      { ok: false, error: "Unsupported KV operation: unsupported" },
      { ok: true, result: null },
      { ok: true, result: Buffer.from([4, 5]).toString("base64") },
    ]);
  });
});
