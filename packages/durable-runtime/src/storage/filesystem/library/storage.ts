import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";

import type {
  ArchiveFactory,
  AsyncBlobStorage,
  AsyncKvStorage,
  FilesystemQueueStorage,
  FilesystemStorageLibrary,
  FilesystemStorageOptions,
  JsonStorage,
  QueueMessage,
  Release,
  ScratchStorage,
} from "./contracts";

export const FILESYSTEM_REF_KIND = "fs-path";
const REF_PREFIX = "b64:";

type FileError = Error & { code?: string };
type JsonObject = Record<string, unknown>;
type QueueState = "active" | "leased" | "done" | "dead" | "staged";
type QueueRecord = QueueMessage & {
  sequence: number;
  state: QueueState;
  dedupKey?: string;
  leaseToken?: string;
  leaseExpiresAt?: string;
  reason?: string;
};

function hasCode(error: unknown, code: string): boolean {
  return (error as FileError | null)?.code === code;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function serializeFilesystemRef(ref: {
  kind: string;
  value: string;
}): string {
  return `${REF_PREFIX}${toBase64Url(JSON.stringify(ref))}`;
}

export function parseFilesystemRef(ref: string): {
  kind: string;
  value: string;
} {
  if (typeof ref !== "string" || !ref.startsWith(REF_PREFIX)) {
    throw new Error(
      `Invalid ref format (expected ${REF_PREFIX}<base64url(json)>).`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(ref.slice(REF_PREFIX.length)));
  } catch {
    throw new Error("Invalid ref format (malformed base64url/json).");
  }
  if (
    !isObject(parsed) ||
    typeof parsed.kind !== "string" ||
    typeof parsed.value !== "string"
  ) {
    throw new Error("Invalid ref format (expected string kind and value).");
  }
  return { kind: parsed.kind, value: parsed.value };
}

export const parseRef = parseFilesystemRef;
export const serializeRef = serializeFilesystemRef;

function insideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function createFilesystemRef(
  rootDir: string,
  namespace: string,
): string {
  if (typeof namespace !== "string" || !namespace.trim())
    throw new Error("Filesystem namespace must not be empty.");
  const root = path.resolve(rootDir);
  const value = path.resolve(root, namespace);
  if (!insideRoot(root, value))
    throw new Error("Filesystem namespace escapes the configured root.");
  return serializeFilesystemRef({ kind: FILESYSTEM_REF_KIND, value });
}

function namespaceFromRef(rootDir: string, ref: string): string {
  const parsed = parseFilesystemRef(ref);
  if (parsed.kind !== FILESYSTEM_REF_KIND)
    throw new Error(`Unsupported storage ref kind: ${parsed.kind}`);
  const root = path.resolve(rootDir);
  const value = path.resolve(parsed.value);
  if (!insideRoot(root, value))
    throw new Error("Filesystem ref escapes the configured root.");
  return value;
}

function resolveKey(rootDir: string, key: string, suffix = ""): string {
  if (typeof key !== "string" || !key)
    throw new Error("Storage key must not be empty.");
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...key.split("/")) + suffix;
  if (!insideRoot(root, target))
    throw new Error("Storage key escapes its namespace.");
  return target;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    throw error;
  }
}

async function atomicWrite(
  filePath: string,
  content: string | Uint8Array,
): Promise<void> {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function walkFiles(
  rootDir: string,
  current = rootDir,
  output: string[] = [],
): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch (error) {
    if (hasCode(error, "ENOENT")) return output;
    throw error;
  }
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) await walkFiles(rootDir, fullPath, output);
    else if (entry.isFile())
      output.push(path.relative(rootDir, fullPath).replaceAll("\\", "/"));
  }
  return output;
}

export function createFsBlobStorage(rootDir: string): AsyncBlobStorage {
  return {
    async read(key) {
      try {
        return await fs.readFile(resolveKey(rootDir, key), "utf8");
      } catch (error) {
        if (hasCode(error, "ENOENT")) return null;
        throw error;
      }
    },
    write: (key, content) =>
      atomicWrite(resolveKey(rootDir, key), String(content)),
    exists: (key) => exists(resolveKey(rootDir, key)),
    remove: async (key) => {
      await fs.rm(resolveKey(rootDir, key), { force: true });
    },
    async readBytes(key) {
      try {
        return new Uint8Array(await fs.readFile(resolveKey(rootDir, key)));
      } catch (error) {
        if (hasCode(error, "ENOENT")) return null;
        throw error;
      }
    },
    writeBytes: (key, content) =>
      atomicWrite(resolveKey(rootDir, key), Buffer.from(content)),
    async listKeys(prefix = "") {
      return (await walkFiles(path.resolve(rootDir)))
        .filter((key) => key.startsWith(prefix))
        .sort();
    },
    async stat(key) {
      try {
        const value = await fs.stat(resolveKey(rootDir, key));
        return { key, size: value.size, updatedAt: value.mtime.toISOString() };
      } catch (error) {
        if (hasCode(error, "ENOENT")) return null;
        throw error;
      }
    },
    async renameKey(from, to) {
      const source = resolveKey(rootDir, from);
      if (!(await exists(source))) return false;
      const target = resolveKey(rootDir, to);
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        await fs.rename(source, target);
        return true;
      } catch (error) {
        if (hasCode(error, "ENOENT")) return false;
        throw error;
      }
    },
  };
}

export function createFsKvStorage(rootDir: string): AsyncKvStorage {
  const fileFor = (key: string) => resolveKey(rootDir, key, ".json");
  return {
    async read(key) {
      try {
        return JSON.parse(await fs.readFile(fileFor(key), "utf8"));
      } catch (error) {
        if (hasCode(error, "ENOENT")) return null;
        throw error;
      }
    },
    write: (key, value) =>
      atomicWrite(fileFor(key), JSON.stringify(value ?? null, null, 2)),
    delete: async (key) => {
      await fs.rm(fileFor(key), { force: true });
    },
    async listKeys(prefix = "") {
      return (await walkFiles(path.resolve(rootDir)))
        .filter((key) => key.endsWith(".json"))
        .map((key) => key.slice(0, -5))
        .filter((key) => key.startsWith(prefix))
        .sort();
    },
  };
}

export function createFsJournalStorage(journalPath: string) {
  async function readLines(): Promise<Array<{ id: string; payload: unknown }>> {
    try {
      const content = (await fs.readFile(journalPath, "utf8")).trim();
      return content
        ? content
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [];
    } catch (error) {
      if (hasCode(error, "ENOENT")) return [];
      throw error;
    }
  }
  return {
    async append(payload: unknown) {
      const entry = { id: randomUUID(), payload: payload ?? null };
      await fs.mkdir(path.dirname(journalPath), { recursive: true });
      await fs.appendFile(journalPath, `${JSON.stringify(entry)}\n`, "utf8");
      return entry;
    },
    readAll: readLines,
    async readAfter(cursor: string | null) {
      const all = await readLines();
      const index = cursor ? all.findIndex((entry) => entry.id === cursor) : -1;
      const entries = cursor && index >= 0 ? all.slice(index + 1) : all;
      return { entries, newCursor: entries.at(-1)?.id ?? cursor };
    },
    async clear() {
      await fs.mkdir(path.dirname(journalPath), { recursive: true });
      await fs.writeFile(journalPath, "", "utf8");
    },
  };
}

export function createFsEngineWakeStorage(directory: string) {
  const requestedPath = path.join(directory, "engine-wake-requested.file");
  const processedPath = path.join(directory, "engine-wake-processed.file");
  async function modifiedAt(filePath: string): Promise<string | null> {
    try {
      return (await fs.stat(filePath)).mtime.toISOString();
    } catch (error) {
      if (hasCode(error, "ENOENT")) return null;
      throw error;
    }
  }
  async function touch(
    filePath: string,
    timestamp = new Date(),
  ): Promise<void> {
    await fs.mkdir(directory, { recursive: true });
    const handle = await fs.open(filePath, "a");
    await handle.close();
    await fs.utimes(filePath, timestamp, timestamp);
  }
  return {
    async request() {
      await touch(requestedPath);
      return (await modifiedAt(requestedPath))!;
    },
    async read() {
      const [requestedAt, processedAt] = await Promise.all([
        modifiedAt(requestedPath),
        modifiedAt(processedPath),
      ]);
      return { requestedAt, processedAt };
    },
    async markProcessed(processedAt: string) {
      const timestamp = new Date(processedAt);
      if (Number.isNaN(timestamp.valueOf()))
        throw new Error("processedAt must be a valid timestamp.");
      const current = await modifiedAt(processedPath);
      if (!current || current < processedAt)
        await touch(processedPath, timestamp);
    },
  };
}

export function createFsAtomicRelayLock(
  lockTargetPath: string,
  staleMs = 30_000,
) {
  return {
    async tryAcquire(): Promise<Release | null> {
      await fs.mkdir(path.dirname(lockTargetPath), { recursive: true });
      if (!(await exists(lockTargetPath))) {
        try {
          await fs.writeFile(lockTargetPath, "{}", { flag: "wx" });
        } catch (error) {
          if (!hasCode(error, "EEXIST")) throw error;
        }
      }
      try {
        const release = await lockfile.lock(lockTargetPath, {
          retries: 0,
          stale: staleMs,
          realpath: false,
        });
        let released = false;
        return async () => {
          if (!released) {
            released = true;
            await release();
          }
        };
      } catch (error) {
        if (hasCode(error, "ELOCKED")) return null;
        throw error;
      }
    },
  };
}

async function withLock<T>(
  lock: { tryAcquire(): Promise<Release | null> },
  work: () => Promise<T>,
): Promise<T> {
  const release = await lock.tryAcquire();
  if (!release) throw new Error("Filesystem storage is busy.");
  try {
    return await work();
  } finally {
    await release();
  }
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return null;
    throw error;
  }
}

export function createFsQueueStorage(rootDir: string): FilesystemQueueStorage {
  const directories = Object.fromEntries(
    ["active", "leased", "done", "dead", "staged"].map((state) => [
      state,
      path.join(rootDir, state),
    ]),
  ) as Record<QueueState, string>;
  const queueLock = createFsAtomicRelayLock(path.join(rootDir, ".queue-lock"));
  const statePath = (state: QueueState, id: string) =>
    path.join(directories[state], `${id}.json`);
  async function initialize() {
    await Promise.all(
      Object.values(directories).map((directory) =>
        fs.mkdir(directory, { recursive: true }),
      ),
    );
  }
  async function records(state: QueueState): Promise<QueueRecord[]> {
    await initialize();
    const names = (await fs.readdir(directories[state]))
      .filter((name) => name.endsWith(".json"))
      .sort();
    return (
      await Promise.all(
        names.map((name) =>
          readJson<QueueRecord>(path.join(directories[state], name)),
        ),
      )
    )
      .filter((record): record is QueueRecord => record !== null)
      .sort((left, right) => left.sequence - right.sequence);
  }
  async function nextSequence(): Promise<number> {
    const counterPath = path.join(rootDir, ".sequence");
    const current = Number(
      await fs.readFile(counterPath, "utf8").catch((error) => {
        if (hasCode(error, "ENOENT")) return "0";
        throw error;
      }),
    );
    const next = Number.isFinite(current) ? current + 1 : 1;
    await atomicWrite(counterPath, String(next));
    return next;
  }
  async function reviveExpired() {
    const now = Date.now();
    for (const record of await records("leased")) {
      if (Date.parse(record.leaseExpiresAt || "") > now) continue;
      const revived = {
        ...record,
        state: "active" as const,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
      };
      await atomicWrite(
        statePath("active", record.id),
        JSON.stringify(revived),
      );
      await fs.rm(statePath("leased", record.id), { force: true });
    }
  }
  async function dedupExists(dedupKey: string) {
    for (const state of ["active", "leased", "staged"] as const)
      if ((await records(state)).some((record) => record.dedupKey === dedupKey))
        return true;
    return false;
  }
  const message = (record: QueueRecord): QueueMessage => ({
    id: record.id,
    body: record.body,
    enqueuedAt: record.enqueuedAt,
    attempt: record.attempt,
  });
  async function enqueueState(
    body: unknown,
    state: "active" | "staged",
    dedupKey?: string,
  ): Promise<QueueMessage | null> {
    return withLock(queueLock, async () => {
      await initialize();
      await reviveExpired();
      if (dedupKey && (await dedupExists(dedupKey))) return null;
      const record: QueueRecord = {
        id: randomUUID(),
        body: body ?? null,
        enqueuedAt: new Date().toISOString(),
        attempt: 0,
        sequence: await nextSequence(),
        state,
        ...(dedupKey ? { dedupKey } : {}),
      };
      await atomicWrite(statePath(state, record.id), JSON.stringify(record));
      return message(record);
    });
  }
  return {
    enqueue: async (body) => (await enqueueState(body, "active"))!,
    async enqueueMany(bodies) {
      const output: QueueMessage[] = [];
      for (const body of bodies) output.push(await this.enqueue(body));
      return output;
    },
    enqueueIfAbsent: (body, dedupKey) => enqueueState(body, "active", dedupKey),
    async lease<T>(options: { max?: number; visibilityMs?: number } = {}) {
      return withLock(queueLock, async () => {
        await reviveExpired();
        const max = Math.max(1, Math.floor(options.max ?? 1));
        const visibilityMs = Math.max(
          1,
          Math.floor(options.visibilityMs ?? 60_000),
        );
        const leased = [];
        for (const record of (await records("active")).slice(0, max)) {
          const claimed = {
            ...record,
            state: "leased" as const,
            attempt: record.attempt + 1,
            leaseToken: randomUUID(),
            leaseExpiresAt: new Date(Date.now() + visibilityMs).toISOString(),
          };
          try {
            await fs.rename(
              statePath("active", record.id),
              statePath("leased", record.id),
            );
          } catch (error) {
            if (hasCode(error, "ENOENT")) continue;
            throw error;
          }
          await atomicWrite(
            statePath("leased", record.id),
            JSON.stringify(claimed),
          );
          leased.push({
            ...message(claimed),
            body: claimed.body as T,
            leaseToken: claimed.leaseToken,
            leaseExpiresAt: claimed.leaseExpiresAt,
          });
        }
        return leased;
      });
    },
    async ack(messageId, leaseToken) {
      return withLock(queueLock, async () => {
        const record = await readJson<QueueRecord>(
          statePath("leased", messageId),
        );
        if (!record || record.leaseToken !== leaseToken) return false;
        await atomicWrite(
          statePath("done", messageId),
          JSON.stringify({
            ...record,
            state: "done",
            leaseToken: undefined,
            leaseExpiresAt: undefined,
          }),
        );
        await fs.rm(statePath("leased", messageId), { force: true });
        return true;
      });
    },
    async nack(messageId, leaseToken, options = {}) {
      return withLock(queueLock, async () => {
        const record = await readJson<QueueRecord>(
          statePath("leased", messageId),
        );
        if (!record || record.leaseToken !== leaseToken) return false;
        const state = options.dead ? "dead" : "active";
        await atomicWrite(
          statePath(state, messageId),
          JSON.stringify({
            ...record,
            state,
            leaseToken: undefined,
            leaseExpiresAt: undefined,
            ...(options.dead && options.reason !== undefined
              ? { reason: options.reason }
              : {}),
          }),
        );
        await fs.rm(statePath("leased", messageId), { force: true });
        return true;
      });
    },
    async peekActive(prefix = "") {
      return withLock(queueLock, async () => {
        await reviveExpired();
        return (await records("active"))
          .filter((record) => record.id.startsWith(prefix))
          .map(message);
      });
    },
    async peekDeadLetter(prefix = "") {
      return (await records("dead"))
        .filter((record) => record.id.startsWith(prefix))
        .map((record) => ({
          ...message(record),
          ...(record.reason !== undefined ? { reason: record.reason } : {}),
        }));
    },
    stage: (body, options = {}) =>
      enqueueState(body, "staged", options.dedupKey),
    async commitStaged(messageId) {
      return withLock(queueLock, async () => {
        const record = await readJson<QueueRecord>(
          statePath("staged", messageId),
        );
        if (!record) return false;
        const promoted = {
          ...record,
          state: "active" as const,
          attempt: 0,
          enqueuedAt: new Date().toISOString(),
          sequence: await nextSequence(),
        };
        await atomicWrite(
          statePath("active", messageId),
          JSON.stringify(promoted),
        );
        await fs.rm(statePath("staged", messageId), { force: true });
        return true;
      });
    },
    async discardStaged(messageId, reason) {
      return withLock(queueLock, async () => {
        const record = await readJson<QueueRecord>(
          statePath("staged", messageId),
        );
        if (!record) return false;
        await atomicWrite(
          statePath("dead", messageId),
          JSON.stringify({ ...record, state: "dead", reason }),
        );
        await fs.rm(statePath("staged", messageId), { force: true });
        return true;
      });
    },
    async peekStaged(prefix = "") {
      return (await records("staged"))
        .filter((record) => record.id.startsWith(prefix))
        .map(message);
    },
  };
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function deepMergeValue(current: unknown, patch: unknown): unknown {
  if (!isObject(current) || !isObject(patch)) return patch;
  const output = { ...current };
  for (const [key, value] of Object.entries(patch))
    output[key] = deepMergeValue(output[key], value);
  return output;
}

export function createJsonStorage(kv: AsyncKvStorage): JsonStorage {
  return {
    read: (key) => kv.read(key),
    write: (key, value) => kv.write(key, value),
    delete: (key) => kv.delete(key),
    listKeys: (prefix) => kv.listKeys(prefix),
    async get(key, jsonPath) {
      let current = await kv.read(key);
      for (const segment of jsonPath.split(".").filter(Boolean)) {
        if (!isObject(current) || !(segment in current)) return null;
        current = current[segment];
      }
      return current ?? null;
    },
    async shallowMerge(key, patch) {
      const current = await kv.read(key);
      await kv.write(key, {
        ...(isObject(current) ? current : {}),
        ...(isObject(patch) ? patch : {}),
      });
    },
    async deepMerge(key, patch) {
      await kv.write(key, deepMergeValue(await kv.read(key), patch));
    },
    async patch(key, jsonPath, value) {
      const current = await kv.read(key);
      const root: JsonObject = isObject(current) ? current : {};
      const segments = jsonPath.split(".").filter(Boolean);
      let cursor = root;
      for (const segment of segments.slice(0, -1)) {
        const next = cursor[segment];
        cursor = cursor[segment] = isObject(next) ? next : {};
      }
      const last = segments.at(-1);
      if (last !== undefined) cursor[last] = value;
      await kv.write(key, root);
    },
  };
}

export function createFilesystemStorageLibrary(
  options: FilesystemStorageOptions,
): FilesystemStorageLibrary {
  const rootDir = path.resolve(options.rootDir);
  const namespace = (ref: string) => namespaceFromRef(rootDir, ref);
  const blob = (directory: string) =>
    createFsBlobStorage(path.join(directory, "blob"));
  const kv = (directory: string) =>
    createFsKvStorage(path.join(directory, "kv"));
  const journal = (directory: string) =>
    createFsJournalStorage(path.join(directory, "journal.jsonl"));
  const queue = (
    directory: string,
    lane = options.defaultQueueLane ?? "default",
  ) => createFsQueueStorage(resolveKey(path.join(directory, "queue"), lane));
  function scratch(directory: string): ScratchStorage {
    const storage = createFsBlobStorage(
      path.join(directory, "scratch", "blob"),
    );
    const config = createFsKvStorage(path.join(directory, "scratch", "config"));
    return {
      ...storage,
      async getUniqueKey(prefix = "scratch", suffix = ".json") {
        const safePrefix = prefix.replace(/[^A-Za-z0-9._-]/g, "_") || "scratch";
        const safeSuffix = suffix.replace(/[^A-Za-z0-9._-]/g, "_") || ".json";
        return `${safePrefix}-${Date.now()}-${randomUUID()}${safeSuffix.startsWith(".") ? safeSuffix : `.${safeSuffix}`}`;
      },
      async create(data, prefix, suffix) {
        const key = await this.getUniqueKey(prefix, suffix);
        await this.write(key, data);
        return key;
      },
      config: {
        get: (key) => config.read(key),
        async set(key, value) {
          if (value === null || value === undefined) await config.delete(key);
          else await config.write(key, value);
        },
      },
    };
  }
  function archive(directory: string): ArchiveFactory {
    const archiveRoot = path.join(directory, "archive");
    const registry = createFsKvStorage(path.join(archiveRoot, "registry"));
    return {
      stream(name) {
        const storage = createFsJournalStorage(
          resolveKey(path.join(archiveRoot, "streams"), name, ".jsonl"),
        );
        return {
          ...storage,
          async append(payload) {
            await registry.write(`stream/${name}`, true);
            return storage.append(payload);
          },
        };
      },
      blob(name) {
        const storage = createFsBlobStorage(
          resolveKey(path.join(archiveRoot, "blobs"), name),
        );
        return {
          ...storage,
          async write(key, content) {
            await registry.write(`blob/${name}`, true);
            await storage.write(key, content);
          },
          async writeBytes(key, content) {
            await registry.write(`blob/${name}`, true);
            await storage.writeBytes(key, content);
          },
        };
      },
      async listStreams(prefix = "") {
        return (await registry.listKeys(`stream/${prefix}`)).map((key) =>
          key.slice(7),
        );
      },
      async listBlobs(prefix = "") {
        return (await registry.listKeys(`blob/${prefix}`)).map((key) =>
          key.slice(5),
        );
      },
      config: {
        get: (key) => registry.read(`config/${key}`),
        async set(key, value) {
          if (value === null || value === undefined)
            await registry.delete(`config/${key}`);
          else await registry.write(`config/${key}`, value);
        },
      },
    };
  }
  return {
    rootDir,
    createRef: (name) => createFilesystemRef(rootDir, name),
    namespaceForRef: namespace,
    blobStorageForRef: (ref) => blob(namespace(ref)),
    kvStorageForRef: (ref) => kv(namespace(ref)),
    jsonStorageForRef: (ref) => createJsonStorage(kv(namespace(ref))),
    journalStorageForRef: (ref) => journal(namespace(ref)),
    engineWakeStorageForRef: (ref) => createFsEngineWakeStorage(namespace(ref)),
    queueStorageForRef: (ref, lane) => queue(namespace(ref), lane),
    lockForRef: (ref) =>
      createFsAtomicRelayLock(path.join(namespace(ref), ".relay-lock")),
    scratchStorageForRef: (ref) => scratch(namespace(ref)),
    archiveFactoryForRef: (ref) => archive(namespace(ref)),
    storageProviderForRef: (ref) => ({
      blob: blob(namespace(ref)),
      journal: journal(namespace(ref)),
      kv: kv(namespace(ref)),
    }),
    async clearNamespace(ref) {
      await fs.rm(namespace(ref), { recursive: true, force: true });
    },
  };
}

export const filesystemInternals = {
  atomicWrite,
  namespaceFromRef,
  resolveKey,
  walkFiles,
};
