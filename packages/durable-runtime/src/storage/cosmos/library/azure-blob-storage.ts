import type { ContainerClient } from "@azure/storage-blob";
import type { AsyncBlobStorage } from "./contracts";

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; statusCode?: unknown };
  return candidate.statusCode === 404 || candidate.code === "BlobNotFound";
}

export function createAzureBlobStorage(container: ContainerClient, namespace: string): AsyncBlobStorage {
  const normalizedNamespace = namespace.replace(/^\/+|\/+$/g, "");
  const prefix = normalizedNamespace ? `${normalizedNamespace}/` : "";
  const blobName = (key: string) => `${prefix}${key.replace(/^\/+/, "")}`;
  return {
    async read(key) {
      const blob = container.getBlobClient(blobName(key));
      return await blob.exists() ? (await blob.downloadToBuffer()).toString("utf8") : null;
    },
    async write(key, content) {
      await container.getBlockBlobClient(blobName(key)).uploadData(Buffer.from(content), {
        blobHTTPHeaders: { blobContentType: "text/plain; charset=utf-8" },
      });
    },
    exists: (key) => container.getBlobClient(blobName(key)).exists(),
    async remove(key) { await container.getBlobClient(blobName(key)).deleteIfExists(); },
    async readBytes(key) {
      const blob = container.getBlobClient(blobName(key));
      return await blob.exists() ? new Uint8Array(await blob.downloadToBuffer()) : null;
    },
    async writeBytes(key, content) {
      await container.getBlockBlobClient(blobName(key)).uploadData(content, {
        blobHTTPHeaders: { blobContentType: "application/octet-stream" },
      });
    },
    async listKeys(keyPrefix = "") {
      const keys: string[] = [];
      for await (const blob of container.listBlobsFlat({ prefix: blobName(keyPrefix) })) keys.push(blob.name.slice(prefix.length));
      return keys.sort();
    },
    async stat(key) {
      const blob = container.getBlobClient(blobName(key));
      if (!await blob.exists()) return null;
      const properties = await blob.getProperties();
      return { key, size: properties.contentLength ?? 0, updatedAt: properties.lastModified?.toISOString(), contentType: properties.contentType };
    },
    async renameKey(from, to) {
      const source = container.getBlobClient(blobName(from));
      if (!await source.exists()) return false;
      try {
        const [content, properties] = await Promise.all([source.downloadToBuffer(), source.getProperties()]);
        await container.getBlockBlobClient(blobName(to)).uploadData(content, {
          blobHTTPHeaders: { blobContentType: properties.contentType },
        });
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
      await source.deleteIfExists();
      return true;
    },
  };
}