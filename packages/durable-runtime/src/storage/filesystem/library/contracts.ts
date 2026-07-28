import type {
  EngineWakeStorage,
  JournalStorage,
  QueueLaneStorage,
} from "../../contracts";

export type Release = () => Promise<void>;

export interface AsyncBlobStorage {
  read(key: string): Promise<string | null>;
  write(key: string, content: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  readBytes(key: string): Promise<Uint8Array | null>;
  writeBytes(key: string, content: Uint8Array): Promise<void>;
  listKeys(prefix?: string): Promise<string[]>;
  stat(
    key: string,
  ): Promise<{ key: string; size: number; updatedAt: string } | null>;
  renameKey(from: string, to: string): Promise<boolean>;
}

export interface AsyncKvStorage {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys(prefix?: string): Promise<string[]>;
}

export interface JsonStorage extends AsyncKvStorage {
  get(key: string, jsonPath: string): Promise<unknown>;
  shallowMerge(key: string, patch: unknown): Promise<void>;
  deepMerge(key: string, patch: unknown): Promise<void>;
  patch(key: string, jsonPath: string, value: unknown): Promise<void>;
}

export interface QueueMessage<T = unknown> {
  id: string;
  body: T;
  enqueuedAt: string;
  attempt: number;
}

export interface FilesystemQueueStorage extends QueueLaneStorage {
  enqueue(body: unknown): Promise<QueueMessage>;
  enqueueMany(bodies: unknown[]): Promise<QueueMessage[]>;
  enqueueIfAbsent(
    body: unknown,
    dedupKey: string,
  ): Promise<QueueMessage | null>;
  peekActive(prefix?: string): Promise<QueueMessage[]>;
  peekDeadLetter(
    prefix?: string,
  ): Promise<Array<QueueMessage & { reason?: string }>>;
  stage(
    body: unknown,
    options?: { dedupKey?: string },
  ): Promise<QueueMessage | null>;
  commitStaged(messageId: string): Promise<boolean>;
  discardStaged(messageId: string, reason?: string): Promise<boolean>;
  peekStaged(prefix?: string): Promise<QueueMessage[]>;
}

export interface ScratchStorage extends AsyncBlobStorage {
  getUniqueKey(prefix?: string, suffix?: string): Promise<string>;
  create(data: string, prefix?: string, suffix?: string): Promise<string>;
  config: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
  };
}

export interface ArchiveFactory {
  stream(
    name: string,
  ): JournalStorage & {
    readAll(): Promise<Array<{ id: string; payload: unknown }>>;
    clear(): Promise<void>;
  };
  blob(name: string): AsyncBlobStorage;
  listStreams(prefix?: string): Promise<string[]>;
  listBlobs(prefix?: string): Promise<string[]>;
  config: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
  };
}

export interface FilesystemStorageLibrary {
  rootDir: string;
  createRef(name: string): string;
  namespaceForRef(ref: string): string;
  blobStorageForRef(ref: string): AsyncBlobStorage;
  kvStorageForRef(ref: string): AsyncKvStorage;
  jsonStorageForRef(ref: string): JsonStorage;
  journalStorageForRef(
    ref: string,
  ): ReturnType<typeof import("./storage").createFsJournalStorage>;
  engineWakeStorageForRef(ref: string): EngineWakeStorage;
  queueStorageForRef(ref: string, lane?: string): FilesystemQueueStorage;
  lockForRef(ref: string): { tryAcquire(): Promise<Release | null> };
  scratchStorageForRef(ref: string): ScratchStorage;
  archiveFactoryForRef(ref: string): ArchiveFactory;
  storageProviderForRef(ref: string): {
    blob: AsyncBlobStorage;
    journal: JournalStorage;
    kv: AsyncKvStorage;
  };
  clearNamespace(ref: string): Promise<void>;
}

export interface FilesystemStorageOptions {
  rootDir: string;
  defaultQueueLane?: string;
}
