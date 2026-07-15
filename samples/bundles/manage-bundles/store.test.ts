import assert from "node:assert/strict";
import { test } from "vitest";

import type { Json, PatchOp } from "@gik/kernel";
import initialState from "./state.json";
import { manageBundlesEffects, manageBundlesStorageKey } from "./store";

type JsonRecord = Record<string, Json>;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function createState(): JsonRecord {
  return JSON.parse(JSON.stringify(initialState)) as JsonRecord;
}

function getPath(root: JsonRecord, path: string): Json | undefined {
  let current: Json | undefined = root;
  for (const segment of path.split(".")) {
    if (!current || Array.isArray(current) || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

function setPath(root: JsonRecord, path: string, value: Json): void {
  const segments = path.split(".");
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!next || Array.isArray(next) || typeof next !== "object") current[segment] = {};
    current = current[segment] as JsonRecord;
  }
  current[segments.at(-1)!] = value;
}

function applyOps(state: JsonRecord, ops: readonly PatchOp[] | undefined): void {
  for (const op of ops ?? []) if (op.op === "set") setPath(state, op.path, op.value);
}

function opValue(ops: readonly PatchOp[] | undefined, path: string): Json {
  const matches = (ops ?? []).filter((op) => op.op === "set" && op.path === path);
  return matches.at(-1)?.value ?? null;
}

function context(state: JsonRecord, payload: JsonRecord = {}) {
  return {
    get: (path: string) => getPath(state, path),
    set: (path: string, value: Json) => ({ op: "set" as const, path, value }),
    args: {},
    payload,
    store: { get: (path: string) => getPath(state, path) } as never,
  };
}

test("listBundles exposes repository artifacts as read-only", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  const result = await manageBundlesEffects.listBundles(context(state));
  const rows = opValue(result?.ops, "manageBundles.bundles") as JsonRecord[];

  assert.ok(rows.length > 0);
  assert.equal(rows.some((row) => row.id === "reactive-demo" && row.source === "repo" && row.readonly === true), true);
});

test("create, save, reload, challenge, and delete stay inside bundle-local storage", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  const state = createState();

  const created = await manageBundlesEffects.createBundle(context(state));
  applyOps(state, created?.ops);
  assert.equal(getPath(state, "manageBundles.tab"), "draft");
  assert.equal(getPath(state, "manageBundles.validation.previewable"), true);

  const saved = await manageBundlesEffects.saveBundle(context(state));
  applyOps(state, saved?.ops);
  const localId = String(getPath(state, "manageBundles.selectedId"));
  assert.equal(localId, "untitled-bundle-local");
  assert.ok(storage.getItem(manageBundlesStorageKey)?.includes(localId));

  setPath(state, "manageBundles.editor.id", "renamed-bundle-local");
  const renamed = await manageBundlesEffects.saveBundle(context(state));
  applyOps(state, renamed?.ops);
  const storedAfterRename = storage.getItem(manageBundlesStorageKey) ?? "";
  assert.equal(storedAfterRename.includes(`\"${localId}\"`), false);
  assert.equal(storedAfterRename.includes("renamed-bundle-local"), true);
  const renamedId = "renamed-bundle-local";

  const reloaded = await manageBundlesEffects.listBundles(context(createState()));
  const rows = opValue(reloaded?.ops, "manageBundles.bundles") as JsonRecord[];
  assert.equal(rows.some((row) => row.id === renamedId && row.source === "local" && row.readonly === false), true);

  const requested = await manageBundlesEffects.requestDeleteBundle(context(state));
  assert.equal((opValue(requested?.ops, "manageBundles.deleteChallenge") as JsonRecord).open, true);
  assert.match(String((opValue(requested?.ops, "manageBundles.deleteChallenge") as JsonRecord).message), /cannot be undone/i);

  const deleted = await manageBundlesEffects.deleteBundle(context(state));
  assert.equal(deleted?.outcome, "deleted");
  assert.equal(storage.getItem(manageBundlesStorageKey), "{}");
  assert.equal(opValue(deleted?.ops, "manageBundles.selectedId"), "");
});

test("repository ids cannot be overwritten or deleted", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  const loaded = await manageBundlesEffects.getBundle(context(state, { id: "reactive-demo" }));
  applyOps(state, loaded?.ops);

  const saved = await manageBundlesEffects.saveBundle(context(state));
  assert.equal(saved?.outcome, "readonly");
  assert.match(String(opValue(saved?.ops, "manageBundles.editor.error")), /read-only/i);

  const deleted = await manageBundlesEffects.requestDeleteBundle(context(state));
  assert.equal(deleted?.outcome, "readonly");
});

test("importBundle validates file text and opens an unsaved local draft", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  applyOps(state, (await manageBundlesEffects.createBundle(context(state)))?.ops);
  const text = String(getPath(state, "manageBundles.editor.bundleText"));

  const imported = await manageBundlesEffects.importBundle(context(createState(), {
    name: "Incident Review.bundle.json",
    text,
  }));

  assert.equal(imported?.outcome, "draft-imported");
  assert.equal((opValue(imported?.ops, "manageBundles.editor") as JsonRecord).id, "incident-review-local");
  assert.equal(opValue(imported?.ops, "manageBundles.tab"), "draft");
});

test("portable preview succeeds while native-dependent bundles report blockers", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const portableState = createState();
  applyOps(portableState, (await manageBundlesEffects.createBundle(context(portableState)))?.ops);

  const portable = await manageBundlesEffects.previewBundle(context(portableState));
  assert.equal(portable?.outcome, "preview-ready");
  assert.notEqual(opValue(portable?.ops, "manageBundles.previewBundle"), null);

  const nativeState = createState();
  applyOps(nativeState, (await manageBundlesEffects.getBundle(context(nativeState, { id: "reactive-demo" })))?.ops);
  const blocked = await manageBundlesEffects.previewBundle(context(nativeState));
  assert.equal(blocked?.outcome, "native-dependencies");
  assert.match(String(opValue(blocked?.ops, "manageBundles.previewError")), /projection provider demo:self/);
});
