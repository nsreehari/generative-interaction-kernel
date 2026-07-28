import type {
  AsyncArchiveFactory,
  AsyncAtomicRelayLock,
  AsyncBlobStorage,
  AsyncJSONStorage,
  AsyncJournalStorage,
  AsyncKVStorage,
  AsyncQueueStorage,
  AsyncScratchStorage,
  AsyncStorageProvider,
} from "./contracts";

export interface KindValueRef {
  readonly kind: string;
  readonly value: string;
}

export const STORES_PROXY_REF_KIND = "stores-proxy";

const REF_PREFIX = "b64:";

function toBase64Url(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function serializeRef(ref: KindValueRef): string {
  return `${REF_PREFIX}${toBase64Url(JSON.stringify(ref))}`;
}

export function parseRef(ref: string): KindValueRef {
  if (!ref.startsWith(REF_PREFIX)) {
    throw new Error(`Invalid ref format (expected ${REF_PREFIX}<base64url(json)>): ${ref}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(ref.slice(REF_PREFIX.length)));
  } catch {
    throw new Error(`Invalid ref format (malformed base64url/json): ${ref}`);
  }
  const candidate = parsed as { kind?: unknown; value?: unknown } | null;
  if (!candidate || typeof candidate.kind !== "string" || typeof candidate.value !== "string") {
    throw new Error(`Invalid ref format (expected string kind and value): ${ref}`);
  }
  return { kind: candidate.kind, value: candidate.value };
}

export function createStoresProxyRef(namespace: string): string {
  return createStorageRef(STORES_PROXY_REF_KIND, namespace);
}

export function createStorageRef(kind: string, namespace: string): string {
  if (!kind.trim()) throw new Error("Storage ref kind must not be empty.");
  if (!namespace.trim()) throw new Error("Storage namespace must not be empty.");
  return serializeRef({ kind, value: namespace });
}

export interface RefStorageSource {
  blob(namespace: string): AsyncBlobStorage;
  journal(namespace: string): AsyncJournalStorage;
  queue(namespace: string): AsyncQueueStorage;
  kv(namespace: string): AsyncKVStorage;
  json(namespace: string): AsyncJSONStorage;
  lock(namespace: string): AsyncAtomicRelayLock;
  scratch(namespace: string): AsyncScratchStorage;
  archive(namespace: string): AsyncArchiveFactory;
  provider(namespace: string): AsyncStorageProvider;
}

export interface RefStorageLibrary {
  blobStorageForRef(ref: string): AsyncBlobStorage;
  journalStorageForRef(ref: string): AsyncJournalStorage;
  queueStorageForRef(ref: string, lane?: string): AsyncQueueStorage;
  kvStorageForRef(ref: string): AsyncKVStorage;
  jsonStorageForRef(ref: string): AsyncJSONStorage;
  lockForRef(ref: string): AsyncAtomicRelayLock;
  scratchStorageForRef(ref: string): AsyncScratchStorage;
  archiveFactoryForRef(ref: string): AsyncArchiveFactory;
  storageProviderForRef(ref: string): AsyncStorageProvider;
  namespaceForRef(ref: string): string;
}

export function createRefStorageLibrary(
  source: RefStorageSource,
  supportedKind = STORES_PROXY_REF_KIND,
): RefStorageLibrary {
  function namespaceForRef(ref: string): string {
    const parsed = parseRef(ref);
    if (parsed.kind !== supportedKind) throw new Error(`Unsupported storage ref kind: ${parsed.kind}`);
    if (!parsed.value.trim()) throw new Error("Storage ref value must not be empty.");
    return parsed.value;
  }
  return {
    namespaceForRef,
    blobStorageForRef: (ref) => source.blob(namespaceForRef(ref)),
    journalStorageForRef: (ref) => source.journal(namespaceForRef(ref)),
    queueStorageForRef: (ref, lane) => source.queue(lane ? `${namespaceForRef(ref)}:queue:${lane}` : namespaceForRef(ref)),
    kvStorageForRef: (ref) => source.kv(namespaceForRef(ref)),
    jsonStorageForRef: (ref) => source.json(namespaceForRef(ref)),
    lockForRef: (ref) => source.lock(namespaceForRef(ref)),
    scratchStorageForRef: (ref) => source.scratch(namespaceForRef(ref)),
    archiveFactoryForRef: (ref) => source.archive(namespaceForRef(ref)),
    storageProviderForRef: (ref) => source.provider(namespaceForRef(ref)),
  };
}