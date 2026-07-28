import type { JournalEntry, QueueLeasedMessage, QueueMessage } from "../../../contracts";

export type { JournalEntry, QueueLeasedMessage, QueueMessage };

export interface BlobStat {
  key: string;
  size: number;
  updatedAt?: string;
  contentType?: string;
}

export interface JournalReadResult<T = unknown> {
  entries: JournalEntry<T>[];
  newCursor: string | null;
}

export interface QueueDeadLetterMessage<T = unknown> extends QueueMessage<T> {
  reason?: string;
}

export interface AsyncBlobStorage {
  read(key: string): Promise<string | null>;
  write(key: string, content: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  readBytes?(key: string): Promise<Uint8Array | null>;
  writeBytes?(key: string, content: Uint8Array): Promise<void>;
  listKeys(prefix?: string): Promise<string[]>;
  stat?(key: string): Promise<BlobStat | null>;
  renameKey(from: string, to: string): Promise<boolean>;
}

export interface AsyncJournalStorage {
  append(payload: unknown): Promise<JournalEntry>;
  readAll(): Promise<JournalEntry[]>;
  readAfter(cursor: string | null): Promise<JournalReadResult>;
  clear?(): Promise<void>;
}

export interface AsyncQueueStorage {
  enqueue<T>(body: T): Promise<QueueMessage<T>>;
  enqueueMany<T>(bodies: T[]): Promise<QueueMessage<T>[]>;
  enqueueIfAbsent?<T>(body: T, dedupKey: string): Promise<QueueMessage<T> | null>;
  lease<T>(options?: { max?: number; visibilityMs?: number }): Promise<QueueLeasedMessage<T>[]>;
  ack(messageId: string, leaseToken: string): Promise<boolean>;
  nack(messageId: string, leaseToken: string, options?: { dead?: boolean; reason?: string }): Promise<boolean>;
  peekActive<T>(prefix?: string): Promise<QueueMessage<T>[]>;
  peekDeadLetter<T>(prefix?: string): Promise<QueueDeadLetterMessage<T>[]>;
  stage<T>(body: T, options?: { dedupKey?: string }): Promise<QueueMessage<T> | null>;
  commitStaged(messageId: string): Promise<boolean>;
  discardStaged(messageId: string, reason?: string): Promise<boolean>;
  peekStaged<T>(prefix?: string): Promise<QueueMessage<T>[]>;
}

export interface AsyncKVStorage {
  read(key: string): Promise<unknown | null>;
  write(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys(prefix?: string): Promise<string[]>;
}

export interface AsyncJSONStorage extends AsyncKVStorage {
  get(key: string, jsonPath: string): Promise<unknown | null>;
  shallowMerge(key: string, patch: Record<string, unknown>): Promise<void>;
  deepMerge(key: string, patch: Record<string, unknown>): Promise<void>;
  patch(key: string, jsonPath: string, value: unknown): Promise<void>;
}

export interface AsyncScratchStorage extends AsyncBlobStorage {
  getUniqueKey(prefix?: string, suffix?: string): Promise<string>;
  create(data: string, prefix?: string, suffix?: string): Promise<string>;
  config: {
    get(key: string): Promise<unknown> | unknown;
    set(key: string, value: unknown): Promise<void> | void;
  };
}

export interface AsyncArchiveFactory {
  stream(name: string): AsyncJournalStorage;
  blob(name: string): AsyncBlobStorage;
  listStreams(prefix?: string): Promise<string[]>;
  listBlobs(prefix?: string): Promise<string[]>;
  config: {
    get(key: string): Promise<unknown> | unknown;
    set(key: string, value: unknown): Promise<void> | void;
  };
}

export interface AsyncStorageProvider {
  blob: AsyncBlobStorage;
  journal: AsyncJournalStorage;
  kv: AsyncKVStorage;
}

export interface AsyncStorageLibrary {
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

export interface AsyncAtomicRelayLock {
  tryAcquire(): Promise<(() => Promise<void> | void) | null>;
}

export interface AsyncTokenizedRelayLock extends AsyncAtomicRelayLock {
  tryAcquireToken(): Promise<string | null>;
  releaseToken(token: string): Promise<void>;
}

export async function withAsyncRelayLock(
  lock: AsyncAtomicRelayLock,
  work: () => Promise<void>,
  continuation?: () => Promise<void> | void,
): Promise<boolean> {
  const release = await lock.tryAcquire();
  if (!release) return false;
  try {
    await work();
  } finally {
    await release();
  }
  await continuation?.();
  return true;
}