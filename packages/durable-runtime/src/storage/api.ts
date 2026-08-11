export type StorageApiRequest = {
  ref: string;
  capability: "kv";
  operation: "read" | "write" | "delete" | "listKeys";
  args?: unknown[];
};

export interface StorageApi {
  dispatch(request: StorageApiRequest): Promise<unknown>;
}

export function createStorageRef(kind: string, namespace: string): string {
  if (!kind.trim()) throw new Error("Storage ref kind must not be empty.");
  if (!namespace.trim()) throw new Error("Storage namespace must not be empty.");
  const bytes = new TextEncoder().encode(JSON.stringify({ kind, value: namespace }));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `b64:${encoded}`;
}