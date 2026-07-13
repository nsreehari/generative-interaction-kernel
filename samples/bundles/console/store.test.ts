import assert from "node:assert/strict";
import { test } from "vitest";

import type { Json, PatchOp } from "@gik/kernel";
import { createProfileBundle, stringifyProfileBundle } from "@gik/profile";
import { consoleEffects } from "./store";
import { sampleProfileCatalog } from "../../profiles/registry";

type JsonRecord = Record<string, Json>;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createState(): Record<string, Json> {
  return {
    console: {
      profiles: [],
      catalogStatus: "",
      selectedId: "",
      profile: {
        id: "",
        kind: "",
        version: "",
        source: "",
        readonly: true,
        sourceKind: "",
        targetKind: "",
        layerCount: 0,
        stageCount: 0,
        layers: [],
        stages: [],
        capabilities: [],
      },
      validation: {
        status: "unknown",
        errors: [],
        warnings: [],
        errorsText: "",
        warningsText: "",
      },
      artifacts: {
        profileText: "",
        recipesText: "",
        resolvedText: "",
        bundleText: "",
      },
      editor: {
        id: "",
        bundleText: "",
        status: "",
        error: "",
      },
      tab: "overview",
      previewInteraction: "investigate",
      previewSubject: "incident",
      previewSurface: "desktop",
      previewBundle: null,
      previewError: "",
    },
  } as unknown as Record<string, Json>;
}

function getPath(state: Record<string, Json>, path: string): Json {
  return path.split(".").reduce<Json>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    return ((current as JsonRecord)[segment] ?? null) as Json;
  }, state as unknown as Json);
}

function setPath(state: Record<string, Json>, path: string, value: Json): void {
  const segments = path.split(".");
  let cursor = state as JsonRecord;
  for (const segment of segments.slice(0, -1)) {
    const next = cursor[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[segment] = {} as Json;
    }
    cursor = cursor[segment] as JsonRecord;
  }
  cursor[segments[segments.length - 1]] = value;
}

function applyOps(state: Record<string, Json>, ops: readonly PatchOp[] | undefined): void {
  for (const op of ops ?? []) {
    if (op.op === "set") setPath(state, op.path, op.value as Json);
  }
}

function opValue(ops: readonly PatchOp[] | undefined, path: string): Json {
  const matches = (ops ?? []).filter((op) => op.op === "set" && op.path === path);
  return (matches[matches.length - 1]?.value ?? null) as Json;
}

function opRecord(ops: readonly PatchOp[] | undefined, path: string): JsonRecord {
  return opValue(ops, path) as JsonRecord;
}

test("loadProfile marks repo sample entries as read-only and seeds the editor bundle", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

  const state = createState();
  const result = await consoleEffects.loadProfile({
    get: (path) => getPath(state, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: { id: "live-cards" },
    store: { get: (path: string) => getPath(state, path) } as never,
  });

  assert.equal(opRecord(result?.ops, "console.profile").readonly, true);
  assert.equal(typeof opRecord(result?.ops, "console.editor").bundleText, "string");
  assert.match(String(opRecord(result?.ops, "console.editor").status), /read-only/);
});

test("$init hydrates the console catalog from localStorage on first load", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

  const sample = sampleProfileCatalog[0];
  const localId = "live-cards-local";
  storage.setItem(
    "gik.console.profileBundles.v1",
    JSON.stringify({
      [localId]: createProfileBundle(
        {
          ...sample.artifact,
          payload: {
            ...sample.artifact.payload,
            id: localId,
          },
        },
        sample.recipeArtifacts
      ),
    })
  );

  const state = createState();
  const result = await consoleEffects.$init?.({
    get: (path) => getPath(state, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: {},
    store: { get: (path: string) => getPath(state, path) } as never,
  });

  const rows = opValue(result?.ops, "console.profiles") as Array<Record<string, Json>>;
  assert.equal(rows.some((row) => row.id === localId && row.source === "local"), true);
});

test("seedLocalDraft creates a visible local draft flow even when nothing was selected", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

  const state = createState();
  const result = await consoleEffects.seedLocalDraft({
    get: (path) => getPath(state, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: {},
    store: { get: (path: string) => getPath(state, path) } as never,
  });

  assert.equal(opValue(result?.ops, "console.selectedId"), "live-cards");
  assert.equal(opValue(result?.ops, "console.tab"), "artifacts");
  assert.equal(opRecord(result?.ops, "console.editor").id, "live-cards-local");
  assert.match(String(opRecord(result?.ops, "console.editor").status), /New local profile draft started/);
});

test("saveLocalProfile persists a local bundle and syncCatalog exposes it as editable", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

  const sample = sampleProfileCatalog[0];
  const bundle = createProfileBundle(sample.artifact, sample.recipeArtifacts);
  const localId = "live-cards-local";
  const localText = stringifyProfileBundle({
    ...bundle,
    profileArtifact: {
      ...bundle.profileArtifact,
      payload: {
        ...bundle.profileArtifact.payload,
        id: localId,
      },
    },
  });

  const state = createState();
  setPath(state, "console.selectedId", "live-cards");
  setPath(state, "console.editor.id", localId);
  setPath(state, "console.editor.bundleText", localText);
  setPath(state, "console.editor.status", "draft");

  const saved = await consoleEffects.saveLocalProfile({
    get: (path) => getPath(state, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: {},
    store: { get: (path: string) => getPath(state, path) } as never,
  });
  applyOps(state, saved?.ops as PatchOp[] | undefined);

  const raw = storage.getItem("gik.console.profileBundles.v1");
  assert.ok(raw, "saved profile should be written to localStorage");
  assert.ok(raw?.includes(localId));
  assert.equal(opValue(saved?.ops, "console.selectedId"), localId);
  assert.equal(opRecord(saved?.ops, "console.profile").readonly, false);

  const synced = await consoleEffects.syncCatalog({
    get: (path) => getPath(state, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: {},
    store: { get: (path: string) => getPath(state, path) } as never,
  });
  const rows = opValue(synced?.ops, "console.profiles") as Array<Record<string, Json>>;
  assert.equal(rows.some((row) => row.id === localId && row.readonly === false && row.source === "local"), true);
});

test("deleteLocalProfile removes the stored local profile and clears the selection", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

  const sample = sampleProfileCatalog[0];
  const localId = "live-cards-local";
  storage.setItem(
    "gik.console.profileBundles.v1",
    JSON.stringify({
      [localId]: {
        ...createProfileBundle(
          {
            ...sample.artifact,
            payload: {
              ...sample.artifact.payload,
              id: localId,
            },
          },
          sample.recipeArtifacts
        ),
      },
    })
  );

  const state = createState();
  setPath(state, "console.selectedId", localId);

  const result = await consoleEffects.deleteLocalProfile({
    get: (path) => getPath(state, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: {},
    store: { get: (path: string) => getPath(state, path) } as never,
  });

  assert.equal(storage.getItem("gik.console.profileBundles.v1"), "{}");
  assert.equal(opValue(result?.ops, "console.selectedId"), "");
  assert.match(String(opRecord(result?.ops, "console.editor").status), /Deleted local profile/);
});