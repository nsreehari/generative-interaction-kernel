import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import { createIndexedDbStorageApi } from "../src/storage/indexed-db/api";
import { createIndexedDbRecordLibrary } from "../src/storage/indexed-db/library";

function indexedDbRef(value: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "indexed-db", value }));
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `b64:${encoded}`;
}

describe("IndexedDB record library", () => {
  it("routes KV API operations by kind ref and namespace", async () => {
    const api = createIndexedDbStorageApi({
      databaseName: `gik-api-${crypto.randomUUID()}`,
    });
    const primary = indexedDbRef("incident-cache");
    const other = indexedDbRef("other-cache");

    await api.dispatch({ ref: primary, capability: "kv", operation: "write", args: ["asset:a", { value: 1 }] });
    await api.dispatch({ ref: primary, capability: "kv", operation: "write", args: ["other:a", { value: 2 }] });
    await api.dispatch({ ref: other, capability: "kv", operation: "write", args: ["asset:a", { value: 3 }] });

    await expect(api.dispatch({ ref: primary, capability: "kv", operation: "read", args: ["asset:a"] }))
      .resolves.toEqual({ value: 1 });
    await expect(api.dispatch({ ref: primary, capability: "kv", operation: "listKeys", args: ["asset:"] }))
      .resolves.toEqual(["asset:a"]);
    await expect(api.dispatch({ ref: other, capability: "kv", operation: "read", args: ["asset:a"] }))
      .resolves.toEqual({ value: 3 });
    await api.close();
  });

  it("owns record ids, ranges, requests, and transaction completion", async () => {
    const library = createIndexedDbRecordLibrary({
      databaseName: `gik-library-${crypto.randomUUID()}`,
    });
    const space = "scope:journal";
    await library.transaction("readwrite", async (store) => {
      await library.request(
        store.add({
          id: library.id("event", space, "2"),
          namespace: space,
          kind: "event",
          key: "2",
          sequence: 2,
        }),
      );
      await library.request(
        store.add({
          id: library.id("event", space, "1"),
          namespace: space,
          kind: "event",
          key: "1",
          sequence: 1,
        }),
      );
      await library.request(
        store.add({
          id: library.id("other", space, "1"),
          namespace: space,
          kind: "other",
          key: "1",
        }),
      );
    });

    const records = await library.transaction("readonly", (store) =>
      library.records(store, "event", space),
    );
    expect(records.map((record) => record.key)).toEqual(["1", "2"]);
    expect(library.prefix("event", space)).toBe(`event\u0000${space}\u0000`);
    await library.close();
  });

  it("supports configurable object stores without durable-runtime semantics", async () => {
    const library = createIndexedDbRecordLibrary({
      databaseName: `gik-library-custom-${crypto.randomUUID()}`,
      objectStoreName: "primitive-records",
    });
    expect(library.objectStoreName).toBe("primitive-records");
    await library.transaction("readwrite", async (store) => {
      await library.request(
        store.put({
          id: "record",
          namespace: "scope",
          kind: "raw",
          key: "record",
          value: 42,
        }),
      );
    });
    const value = await library.transaction("readonly", (store) =>
      library.request(store.get("record")),
    );
    expect(value).toMatchObject({ value: 42 });
    await library.close();
  });
});
