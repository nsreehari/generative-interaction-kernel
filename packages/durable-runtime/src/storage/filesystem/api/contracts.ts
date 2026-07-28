export type FilesystemStorageCapability =
  | "kv"
  | "json"
  | "blob"
  | "journal"
  | "queue"
  | "lock"
  | "scratch"
  | "archive";

export type FilesystemStorageRequest = {
  ref: string;
  capability: FilesystemStorageCapability;
  operation: string;
  args?: unknown[];
  lane?: string;
  resource?: { kind: "stream" | "blob"; name: string };
};

export type FilesystemStorageBatchResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export interface FilesystemStorageBatchRequest {
  operations: FilesystemStorageRequest[];
}
