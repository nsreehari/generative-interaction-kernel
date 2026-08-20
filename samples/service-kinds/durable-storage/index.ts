import type { StorageApi, StorageApiRequest } from "@gik/durable-runtime";
import type { Json, NativeServiceDeclaration } from "@gik/kernel";
import {
  serviceConfig,
  type ServiceAdapter,
  type ServiceKindFactory,
  type ServiceKindManifest,
} from "@gik/controlface/services";

import manifestJson from "./manifest.json";

export interface DurableStorageConnection {
  api: StorageApi;
  ref: string;
}

export function createDurableStorageKind(
  connections: Readonly<Record<string, DurableStorageConnection>>,
): ServiceKindFactory {
  const manifest = manifestJson as ServiceKindManifest;
  return {
    manifest,
    validate(declaration) {
      const connection = String(serviceConfig(declaration).connection ?? "");
      return connections[connection]
        ? { ok: true }
        : { ok: false, errors: [`Unknown durable storage connection '${connection}'`] };
    },
    create(declaration: NativeServiceDeclaration): ServiceAdapter {
      const connectionId = String(serviceConfig(declaration).connection);
      const connection = connections[connectionId];
      const operations = new Set(Object.values(declaration.operations).map(({ operation }) => operation));
      return {
        provider: { id: `durable-storage:${connectionId}`, version: manifest.version },
        discover: async () => ({
          provider: { id: `durable-storage:${connectionId}`, version: manifest.version },
          revision: manifest.version,
          discoveredAt: new Date().toISOString(),
          capabilities: [...operations].map((operation) => ({
            id: operation,
            operation,
            version: declaration.version,
            inputSchema: {},
            assurance: "declared-and-locally-validated",
          })),
        }),
        validate: async (request) => isStorageOperation(request.operation)
          ? { ok: true }
          : { ok: false, errors: [`Unsupported durable storage operation '${request.operation}'`] },
        execute: async (request) => ({
          output: asJson(await connection.api.dispatch(storageRequest(connection.ref, request.operation, request.input))),
        }),
      };
    },
  };
}

const SUPPORTED_OPERATIONS = new Set<StorageApiRequest["operation"]>([
  "read",
  "write",
  "delete",
  "listKeys",
]);

function isStorageOperation(operation: string): operation is StorageApiRequest["operation"] {
  return SUPPORTED_OPERATIONS.has(operation as StorageApiRequest["operation"]);
}

function storageRequest(ref: string, operation: string, input: Json | undefined): StorageApiRequest {
  if (!isStorageOperation(operation)) {
    throw new Error(`Unsupported durable storage operation '${operation}'`);
  }
  const value = inputRecord(input);
  if (operation === "read" || operation === "delete") {
    return { ref, capability: "kv", operation, args: [requiredString(value, "key")] };
  }
  if (operation === "write") {
    return { ref, capability: "kv", operation, args: [requiredString(value, "key"), value.value ?? null] };
  }
  return {
    ref,
    capability: "kv",
    operation: "listKeys",
    args: typeof value.prefix === "string" ? [value.prefix] : [],
  };
}

function inputRecord(value: Json | undefined): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
}

function requiredString(value: Record<string, Json>, name: string): string {
  const field = value[name];
  if (typeof field !== "string" || !field.trim()) {
    throw new Error(`Durable storage operation requires '${name}'`);
  }
  return field;
}

function asJson(value: unknown): Json | undefined {
  return value === undefined ? undefined : value as Json;
}