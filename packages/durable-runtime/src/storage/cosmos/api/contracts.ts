export interface StorageHttpRequest {
  ref: string;
  capability: "kv" | "json" | "blob" | "journal" | "queue" | "lock" | "scratch" | "archive";
  operation: string;
  args?: unknown[];
  lane?: string;
  resource?: { kind: "stream" | "blob"; name: string };
}

export interface StorageHttpResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error?: string;
}

export type StorageHttpBatchRequest = StorageHttpRequest[];
export type StorageHttpBatchResponse = StorageHttpResponse[];