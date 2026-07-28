import { describe, expect, it, vi } from "vitest";
import {
  createRefStorageLibrary,
  createStoresProxyRef,
  parseRef,
  serializeRef,
} from "../src/storage/cosmos/library";

describe("Cosmos storage refs", () => {
  it("round-trips the stores-proxy wire format", () => {
    const ref = createStoresProxyRef("boards/demo/cards");
    expect(ref.startsWith("b64:")).toBe(true);
    expect(parseRef(ref)).toEqual({ kind: "stores-proxy", value: "boards/demo/cards" });
    expect(serializeRef(parseRef(ref))).toBe(ref);
  });

  it("routes capabilities and scopes queue lanes", () => {
    const source = {
      blob: vi.fn(), journal: vi.fn(), queue: vi.fn(), kv: vi.fn(), json: vi.fn(),
      lock: vi.fn(), scratch: vi.fn(), archive: vi.fn(), provider: vi.fn(),
    };
    const stores = createRefStorageLibrary(source);
    const ref = createStoresProxyRef("boards/demo/runtime");
    stores.kvStorageForRef(ref);
    stores.queueStorageForRef(ref, "task-executor");
    expect(source.kv).toHaveBeenCalledWith("boards/demo/runtime");
    expect(source.queue).toHaveBeenCalledWith("boards/demo/runtime:queue:task-executor");
  });

  it("rejects refs owned by another provider", () => {
    const unsupported = vi.fn();
    const stores = createRefStorageLibrary({
      blob: unsupported, journal: unsupported, queue: unsupported, kv: unsupported, json: unsupported,
      lock: unsupported, scratch: unsupported, archive: unsupported, provider: unsupported,
    });
    const ref = serializeRef({ kind: "firestore", value: "boards/demo/cards" });
    expect(() => stores.kvStorageForRef(ref)).toThrow("Unsupported storage ref kind: firestore");
  });
});