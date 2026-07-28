import type { Container } from "@azure/cosmos";
import type { ContainerClient } from "@azure/storage-blob";
import { createAzureBlobStorage } from "./azure-blob-storage";
import type { AsyncArchiveFactory, AsyncStorageLibrary } from "./contracts";
import {
  createCosmosAtomicRelayLock,
  createCosmosJournalStorage,
  createCosmosKvStorage,
  createCosmosQueueStorage,
} from "./cosmos-storage";
import { createJsonStorage } from "./json-storage";
import { createRefStorageLibrary, type RefStorageLibrary } from "./refs";
import { createScratchStorage } from "./scratch-storage";

export interface CosmosStorageLibrary extends AsyncStorageLibrary, RefStorageLibrary {
  clearNamespace(namespace: string): Promise<void>;
}

export function createCosmosStorageLibrary(cosmos: Container, blobs: ContainerClient): CosmosStorageLibrary {
  const blob = (namespace: string) => createAzureBlobStorage(blobs, namespace);
  const kv = (namespace: string) => createCosmosKvStorage(cosmos, namespace);
  const journal = (namespace: string) => createCosmosJournalStorage(cosmos, namespace);

  function archive(namespace: string): AsyncArchiveFactory {
    const registry = kv(`${namespace}:archive-registry`);
    return {
      stream(name) {
        const storage = journal(`${namespace}:archive-stream:${name}`);
        return { ...storage, async append(payload) { await registry.write(`stream:${name}`, true); return storage.append(payload); } };
      },
      blob(name) {
        const storage = blob(`${namespace}/archive-blob/${name}`);
        return {
          ...storage,
          async write(key, content) { await registry.write(`blob:${name}`, true); await storage.write(key, content); },
          async writeBytes(key, content) {
            if (!storage.writeBytes) throw new Error("Binary writes are not supported by this archive blob store.");
            await registry.write(`blob:${name}`, true);
            await storage.writeBytes(key, content);
          },
        };
      },
      async listStreams(prefix = "") { return (await registry.listKeys(`stream:${prefix}`)).map((key) => key.slice("stream:".length)); },
      async listBlobs(prefix = "") { return (await registry.listKeys(`blob:${prefix}`)).map((key) => key.slice("blob:".length)); },
      config: {
        get: (key) => registry.read(`config:${key}`),
        async set(key, value) {
          if (value === null || value === undefined) await registry.delete(`config:${key}`);
          else await registry.write(`config:${key}`, value);
        },
      },
    };
  }

  const library: AsyncStorageLibrary = {
    blob,
    kv,
    journal,
    queue: (namespace) => createCosmosQueueStorage(cosmos, namespace),
    json: (namespace) => createJsonStorage(kv(namespace)),
    lock: (namespace) => createCosmosAtomicRelayLock(cosmos, namespace),
    scratch: (namespace) => createScratchStorage(blob(`${namespace}/scratch`), kv(`${namespace}:scratch-config`)),
    archive,
    provider: (namespace) => ({ blob: blob(namespace), journal: journal(namespace), kv: kv(namespace) }),
  };
  return {
    ...library,
    ...createRefStorageLibrary(library),
    async clearNamespace(namespace) {
      const { resources: partitionKeys } = await cosmos.items.query<string>({
        query: `SELECT DISTINCT VALUE c.partitionKey FROM c
          WHERE c.partitionKey = @kv OR STARTSWITH(c.partitionKey, @kvNested)
             OR c.partitionKey = @journal OR STARTSWITH(c.partitionKey, @journalNested)
             OR c.partitionKey = @queue OR STARTSWITH(c.partitionKey, @queueNested)
             OR c.partitionKey = @lock OR STARTSWITH(c.partitionKey, @lockNested)`,
        parameters: [
          { name: "@kv", value: `kv:${namespace}` }, { name: "@kvNested", value: `kv:${namespace}:` },
          { name: "@journal", value: `journal:${namespace}` }, { name: "@journalNested", value: `journal:${namespace}:` },
          { name: "@queue", value: `queue:${namespace}` }, { name: "@queueNested", value: `queue:${namespace}:` },
          { name: "@lock", value: `lock:${namespace}` }, { name: "@lockNested", value: `lock:${namespace}:` },
        ],
      }).fetchAll();
      for (const partitionKey of partitionKeys) await cosmos.deleteAllItemsForPartitionKey(partitionKey);
      for await (const item of blobs.listBlobsFlat({ prefix: `${namespace}/` })) await blobs.deleteBlob(item.name);
    },
  };
}