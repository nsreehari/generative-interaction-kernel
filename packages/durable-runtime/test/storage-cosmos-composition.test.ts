import { describe, expect, it } from "vitest";
import type { AsyncBlobStorage, AsyncKVStorage } from "../src/storage/cosmos/library";
import { createJsonStorage, createScratchStorage } from "../src/storage/cosmos/library";

class MemoryKv implements AsyncKVStorage {
  private readonly values = new Map<string, unknown>();
  async read(key: string) { return this.values.has(key) ? this.values.get(key) ?? null : null; }
  async write(key: string, value: unknown) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
  async listKeys(prefix = "") { return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort(); }
}

class MemoryBlob implements AsyncBlobStorage {
  private readonly values = new Map<string, Uint8Array>();
  async read(key: string) { const value = this.values.get(key); return value ? new TextDecoder().decode(value) : null; }
  async write(key: string, content: string) { this.values.set(key, new TextEncoder().encode(content)); }
  async exists(key: string) { return this.values.has(key); }
  async remove(key: string) { this.values.delete(key); }
  async listKeys(prefix = "") { return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort(); }
  async renameKey(from: string, to: string) {
    const value = this.values.get(from); if (!value) return false; this.values.set(to, value); this.values.delete(from); return true;
  }
}

describe("Cosmos storage composition", () => {
  it("preserves JSON merge and path semantics", async () => {
    const json = createJsonStorage(new MemoryKv());
    await json.write("doc", { nested: { first: 1 }, array: [{ value: 1 }] });
    await json.shallowMerge("doc", { top: true });
    await json.deepMerge("doc", { nested: { second: 2 }, array: ["replaced"] });
    await json.patch("doc", "nested.first", 3);
    await json.patch("doc", "", "ignored");
    expect(await json.read("doc")).toEqual({ nested: { first: 3, second: 2 }, array: ["replaced"], top: true });
    expect(await json.get("doc", "nested.second")).toBe(2);
    expect(await json.get("doc", "array.0")).toBeNull();
  });

  it("creates sanitized scratch keys and stores configuration", async () => {
    const config = new MemoryKv();
    const scratch = createScratchStorage(new MemoryBlob(), config);
    const key = await scratch.create("payload", "input file", "txt");
    expect(key).toMatch(/^input_file-/);
    expect(key.endsWith(".txt")).toBe(true);
    expect(await scratch.read(key)).toBe("payload");
    await scratch.config.set("retention.maxAgeMs", 5_000);
    expect(await scratch.config.get("retention.maxAgeMs")).toBe(5_000);
  });
});