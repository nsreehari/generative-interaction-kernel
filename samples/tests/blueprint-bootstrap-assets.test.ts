import "fake-indexeddb/auto";

import {
  createIndexedDbStorageApi,
  createIndexedDbStorageRef,
} from "@gik/durable-runtime/storage/indexed-db/api";
import {
  createMemoryStorageApi,
  createMemoryStorageRef,
} from "@gik/durable-runtime/storage/memory";
import { describe, expect, it } from "vitest";

import {
  createBootstrapStorageConnection,
  type BlueprintBootstrapAssets,
} from "../catalog/blueprint-bootstrap-assets";

const assets: BlueprintBootstrapAssets = {
  format: "gik-blueprint-bootstrap-assets/1",
  records: [{ key: "asset:example", value: { source: "bootstrap" } }],
};

async function read(connection: ReturnType<typeof createBootstrapStorageConnection>) {
  return connection.api.dispatch({
    ref: connection.ref,
    capability: "kv",
    operation: "read",
    args: ["asset:example"],
  });
}

async function write(
  connection: ReturnType<typeof createBootstrapStorageConnection>,
  value: unknown,
) {
  await connection.api.dispatch({
    ref: connection.ref,
    capability: "kv",
    operation: "write",
    args: ["asset:example", value],
  });
}

describe("Blueprint bootstrap assets", () => {
  it("initializes each in-memory Blueprint store and preserves later writes", async () => {
    const api = createMemoryStorageApi();
    const ref = createMemoryStorageRef("bootstrap-memory");
    const first = createBootstrapStorageConnection(api, ref, assets);

    expect(await read(first)).toEqual({ source: "bootstrap" });
    await write(first, { source: "runtime" });

    const reopened = createBootstrapStorageConnection(api, ref, assets);
    expect(await read(reopened)).toEqual({ source: "runtime" });

    const isolated = createBootstrapStorageConnection(
      api,
      createMemoryStorageRef("bootstrap-memory-isolated"),
      assets,
    );
    expect(await read(isolated)).toEqual({ source: "bootstrap" });
  });

  it("initializes IndexedDB only for the first open of a durable store", async () => {
    const databaseName = `gik-bootstrap-${crypto.randomUUID()}`;
    const ref = createIndexedDbStorageRef("bootstrap-durable");
    const firstApi = createIndexedDbStorageApi({ databaseName });
    const first = createBootstrapStorageConnection(firstApi, ref, assets);

    expect(await read(first)).toEqual({ source: "bootstrap" });
    await write(first, { source: "runtime" });
    await firstApi.close();

    const reopenedApi = createIndexedDbStorageApi({ databaseName });
    const reopened = createBootstrapStorageConnection(reopenedApi, ref, assets);
    expect(await read(reopened)).toEqual({ source: "runtime" });
    await reopenedApi.close();
  });

  it("imports an existing legacy namespace without overwriting runtime values", async () => {
    const api = createMemoryStorageApi();
    const legacyRef = createMemoryStorageRef("bootstrap-legacy");
    const ref = createMemoryStorageRef("bootstrap-current");
    await api.dispatch({
      ref: legacyRef,
      capability: "kv",
      operation: "write",
      args: ["asset:example", { source: "legacy-runtime" }],
    });
    const connection = createBootstrapStorageConnection(api, ref, assets, [legacyRef]);

    expect(await read(connection)).toEqual({ source: "legacy-runtime" });
  });
});
