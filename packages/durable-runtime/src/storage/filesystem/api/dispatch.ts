import { randomUUID } from "node:crypto";

import type { FilesystemStorageLibrary, Release } from "../library/index";
import type { JournalStorage } from "../../contracts";
import type {
  FilesystemStorageBatchResult,
  FilesystemStorageRequest,
} from "./contracts";

function optionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function dispatchBlob(
  storage: ReturnType<FilesystemStorageLibrary["blobStorageForRef"]>,
  operation: string,
  args: unknown[],
) {
  switch (operation) {
    case "read":
      return storage.read(String(args[0]));
    case "write":
      return storage.write(String(args[0]), String(args[1]));
    case "exists":
      return storage.exists(String(args[0]));
    case "remove":
      return storage.remove(String(args[0]));
    case "listKeys":
      return storage.listKeys(optionalString(args[0]));
    case "renameKey":
      return storage.renameKey(String(args[0]), String(args[1]));
    case "stat":
      return storage.stat(String(args[0]));
    case "readBytes": {
      const value = await storage.readBytes(String(args[0]));
      return value ? Buffer.from(value).toString("base64") : null;
    }
    case "writeBytes":
      return storage.writeBytes(
        String(args[0]),
        Buffer.from(String(args[1]), "base64"),
      );
    default:
      throw new Error(`Unsupported blob operation: ${operation}`);
  }
}

async function dispatchJournal(
  storage: JournalStorage & {
    readAll(): Promise<Array<{ id: string; payload: unknown }>>;
    clear(): Promise<void>;
  },
  operation: string,
  args: unknown[],
) {
  switch (operation) {
    case "append":
      return storage.append(args[0]);
    case "readAll":
      return storage.readAll();
    case "readAfter":
      return storage.readAfter(args[0] === null ? null : String(args[0]));
    case "clear":
      return storage.clear();
    default:
      throw new Error(`Unsupported journal operation: ${operation}`);
  }
}

export function createFilesystemStorageDispatcher(
  storage: FilesystemStorageLibrary,
) {
  const lockTokens = new Map<string, { ref: string; release: Release }>();
  async function dispatch(request: FilesystemStorageRequest): Promise<unknown> {
    if (
      !request ||
      typeof request.ref !== "string" ||
      typeof request.operation !== "string"
    )
      throw new Error(
        "Storage request requires ref, capability, and operation.",
      );
    const args = Array.isArray(request.args) ? request.args : [];
    switch (request.capability) {
      case "kv": {
        const target = storage.kvStorageForRef(request.ref);
        switch (request.operation) {
          case "read":
            return target.read(String(args[0]));
          case "write":
            return target.write(String(args[0]), args[1]);
          case "delete":
            return target.delete(String(args[0]));
          case "listKeys":
            return target.listKeys(optionalString(args[0]));
          default:
            throw new Error(`Unsupported KV operation: ${request.operation}`);
        }
      }
      case "json": {
        const target = storage.jsonStorageForRef(request.ref);
        switch (request.operation) {
          case "read":
            return target.read(String(args[0]));
          case "write":
            return target.write(String(args[0]), args[1]);
          case "delete":
            return target.delete(String(args[0]));
          case "listKeys":
            return target.listKeys(optionalString(args[0]));
          case "get":
            return target.get(String(args[0]), String(args[1]));
          case "shallowMerge":
            return target.shallowMerge(String(args[0]), args[1]);
          case "deepMerge":
            return target.deepMerge(String(args[0]), args[1]);
          case "patch":
            return target.patch(String(args[0]), String(args[1]), args[2]);
          default:
            throw new Error(`Unsupported JSON operation: ${request.operation}`);
        }
      }
      case "blob":
        return dispatchBlob(
          storage.blobStorageForRef(request.ref),
          request.operation,
          args,
        );
      case "journal":
        return dispatchJournal(
          storage.journalStorageForRef(request.ref),
          request.operation,
          args,
        );
      case "queue": {
        const target = storage.queueStorageForRef(request.ref, request.lane);
        switch (request.operation) {
          case "enqueue":
            return target.enqueue(args[0]);
          case "enqueueMany":
            return target.enqueueMany(args[0] as unknown[]);
          case "enqueueIfAbsent":
            return target.enqueueIfAbsent(args[0], String(args[1]));
          case "lease":
            return target.lease(
              args[0] as { max?: number; visibilityMs?: number },
            );
          case "ack":
            return target.ack(String(args[0]), String(args[1]));
          case "nack":
            return target.nack(
              String(args[0]),
              String(args[1]),
              args[2] as { dead?: boolean; reason?: string },
            );
          case "peekActive":
            return target.peekActive(optionalString(args[0]));
          case "peekDeadLetter":
            return target.peekDeadLetter(optionalString(args[0]));
          case "stage":
            return target.stage(args[0], args[1] as { dedupKey?: string });
          case "commitStaged":
            return target.commitStaged(String(args[0]));
          case "discardStaged":
            return target.discardStaged(
              String(args[0]),
              optionalString(args[1]),
            );
          case "peekStaged":
            return target.peekStaged(optionalString(args[0]));
          default:
            throw new Error(
              `Unsupported queue operation: ${request.operation}`,
            );
        }
      }
      case "lock": {
        if (request.operation === "acquire") {
          const release = await storage.lockForRef(request.ref).tryAcquire();
          if (!release) return null;
          const token = randomUUID();
          lockTokens.set(token, { ref: request.ref, release });
          return token;
        }
        if (request.operation === "release") {
          const token = String(args[0]);
          const held = lockTokens.get(token);
          if (!held || held.ref !== request.ref) return false;
          lockTokens.delete(token);
          await held.release();
          return true;
        }
        throw new Error(`Unsupported lock operation: ${request.operation}`);
      }
      case "scratch": {
        const target = storage.scratchStorageForRef(request.ref);
        if (request.operation === "getUniqueKey")
          return target.getUniqueKey(
            optionalString(args[0]),
            optionalString(args[1]),
          );
        if (request.operation === "create")
          return target.create(
            String(args[0]),
            optionalString(args[1]),
            optionalString(args[2]),
          );
        if (request.operation === "config.get")
          return target.config.get(String(args[0]));
        if (request.operation === "config.set")
          return target.config.set(String(args[0]), args[1]);
        return dispatchBlob(target, request.operation, args);
      }
      case "archive": {
        const target = storage.archiveFactoryForRef(request.ref);
        if (request.operation === "listStreams")
          return target.listStreams(optionalString(args[0]));
        if (request.operation === "listBlobs")
          return target.listBlobs(optionalString(args[0]));
        if (request.operation === "config.get")
          return target.config.get(String(args[0]));
        if (request.operation === "config.set")
          return target.config.set(String(args[0]), args[1]);
        if (!request.resource?.name)
          throw new Error("Archive operations require a named resource.");
        return request.resource.kind === "stream"
          ? dispatchJournal(
              target.stream(request.resource.name),
              request.operation,
              args,
            )
          : dispatchBlob(
              target.blob(request.resource.name),
              request.operation,
              args,
            );
      }
      default:
        throw new Error(
          `Unsupported storage capability: ${String(request.capability)}`,
        );
    }
  }
  return {
    dispatch,
    async dispatchBatch(
      requests: FilesystemStorageRequest[],
    ): Promise<FilesystemStorageBatchResult[]> {
      if (!Array.isArray(requests))
        throw new Error("operations must be an array.");
      const results: FilesystemStorageBatchResult[] = [];
      for (const request of requests) {
        try {
          results.push({ ok: true, result: (await dispatch(request)) ?? null });
        } catch (error) {
          results.push({ ok: false, error: errorMessage(error) });
        }
      }
      return results;
    },
  };
}
