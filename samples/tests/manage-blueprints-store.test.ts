import assert from "node:assert/strict";
import { test } from "vitest";

import type { Json, PatchOp } from "@gik/kernel";
import { openSampleBlueprint } from "../shared/blueprints";
import { manageBlueprintsEffects, manageBlueprintsStorageKey } from "../blueprints/manage-blueprints/native/effect_handlers/manageBlueprintsEffectHandlers";

type JsonRecord = Record<string, Json>;
const initialState = openSampleBlueprint("manage-blueprints").state;

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
  for (const op of ops ?? []) if (op.op === "set") setPath(state, op.path, op.value ?? null);
}

function opValue(ops: readonly PatchOp[] | undefined, path: string): Json {
  const matches = (ops ?? []).filter((op) => op.op === "set" && op.path === path);
  return matches.at(-1)?.value ?? null;
}

function context(state: JsonRecord, payload: JsonRecord = {}) {
  return {
    get: (path: string) => getPath(state, path) ?? null,
    set: (path: string, value: Json) => ({ op: "set" as const, path, value }),
    args: {},
    payload,
    store: { get: (path: string) => getPath(state, path) } as never,
  };
}

test("listBlueprints exposes repository artifacts as read-only", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  const result = await manageBlueprintsEffects.listBlueprints(context(state));
  const rows = opValue(result?.ops, "manageBlueprints.blueprints") as JsonRecord[];

  assert.ok(rows.length > 0);
  assert.equal(rows.some((row) => row.id === "samples-overview" && row.source === "repo" && row.readonly === true), true);
});

test("create, save, reload, challenge, and delete stay inside blueprint-local storage", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  const state = createState();

  const created = await manageBlueprintsEffects.createBlueprint(context(state));
  applyOps(state, created?.ops);
  assert.equal(getPath(state, "manageBlueprints.tab"), "draft");
  assert.equal(getPath(state, "manageBlueprints.validation.previewable"), true);

  const saved = await manageBlueprintsEffects.saveBlueprint(context(state));
  applyOps(state, saved?.ops);
  const localId = String(getPath(state, "manageBlueprints.selectedId"));
  assert.equal(localId, "untitled-blueprint-local");
  assert.ok(storage.getItem(manageBlueprintsStorageKey)?.includes(localId));

  setPath(state, "manageBlueprints.editor.id", "renamed-blueprint-local");
  const renamed = await manageBlueprintsEffects.saveBlueprint(context(state));
  applyOps(state, renamed?.ops);
  const storedAfterRename = storage.getItem(manageBlueprintsStorageKey) ?? "";
  assert.equal(storedAfterRename.includes(`\"${localId}\"`), false);
  assert.equal(storedAfterRename.includes("renamed-blueprint-local"), true);
  const renamedId = "renamed-blueprint-local";

  const reloaded = await manageBlueprintsEffects.listBlueprints(context(createState()));
  const rows = opValue(reloaded?.ops, "manageBlueprints.blueprints") as JsonRecord[];
  assert.equal(rows.some((row) => row.id === renamedId && row.source === "local" && row.readonly === false), true);

  const requested = await manageBlueprintsEffects.requestDeleteBlueprint(context(state));
  assert.equal((opValue(requested?.ops, "manageBlueprints.deleteChallenge") as JsonRecord).open, true);
  assert.match(String((opValue(requested?.ops, "manageBlueprints.deleteChallenge") as JsonRecord).message), /cannot be undone/i);

  const deleted = await manageBlueprintsEffects.deleteBlueprint(context(state));
  assert.equal(deleted?.outcome, "deleted");
  assert.equal(storage.getItem(manageBlueprintsStorageKey), "{}");
  assert.equal(opValue(deleted?.ops, "manageBlueprints.selectedId"), "");
}, 10_000);

test("repository ids cannot be overwritten or deleted", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  const loaded = await manageBlueprintsEffects.getBlueprint(context(state, { id: "samples-overview" }));
  applyOps(state, loaded?.ops);

  const saved = await manageBlueprintsEffects.saveBlueprint(context(state));
  assert.equal(saved?.outcome, "readonly");
  assert.match(String(opValue(saved?.ops, "manageBlueprints.editor.error")), /read-only/i);

  const deleted = await manageBlueprintsEffects.requestDeleteBlueprint(context(state));
  assert.equal(deleted?.outcome, "readonly");
});

test("importBlueprint validates file text and opens an unsaved local draft", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  applyOps(state, (await manageBlueprintsEffects.createBlueprint(context(state)))?.ops);
  const text = String(getPath(state, "manageBlueprints.editor.blueprintText"));

  const imported = await manageBlueprintsEffects.importBlueprint(context(createState(), {
    name: "Incident Review.blueprint.json",
    text,
  }));

  assert.equal(imported?.outcome, "draft-imported");
  assert.equal((opValue(imported?.ops, "manageBlueprints.editor") as JsonRecord).id, "incident-review-local");
  assert.equal(opValue(imported?.ops, "manageBlueprints.tab"), "draft");
});

test("preview exposes a validated structural Blueprint summary", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const portableState = createState();
  applyOps(portableState, (await manageBlueprintsEffects.createBlueprint(context(portableState)))?.ops);

  const portable = await manageBlueprintsEffects.previewBlueprint(context(portableState));
  assert.equal(portable?.outcome, "summary-ready");
  assert.notEqual(opValue(portable?.ops, "manageBlueprints.previewBlueprint"), null);
});

test("preview resolves the canonical tier and recipe chain", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  applyOps(state, (await manageBlueprintsEffects.createBlueprint(context(state)))?.ops);
  const artifact = JSON.parse(String(getPath(state, "manageBlueprints.editor.blueprintText"))) as JsonRecord;
  const payload = artifact.payload as JsonRecord;
  payload.tiers = [
    { id: "intent", kind: "intent" },
    { id: "presentation", kind: "presentation" },
    { id: "runtime-document", kind: "runtime-document" },
  ];
  payload.recipes = [
    { id: "intent-to-presentation", from: "intent", to: "presentation" },
    { id: "presentation-to-runtime", from: "presentation", to: "runtime-document" },
  ];
  setPath(state, "manageBlueprints.editor.blueprintText", JSON.stringify(artifact));

  const preview = await manageBlueprintsEffects.previewBlueprint(context(state));
  const inspection = opValue(preview?.ops, "manageBlueprints.inspection") as JsonRecord;
  const recipes = inspection.recipes as JsonRecord[];
  assert.equal(preview?.outcome, "summary-ready");
  assert.deepEqual(recipes.map((recipe) => [recipe.from, recipe.to]), [
    ["intent", "presentation"],
    ["presentation", "runtime-document"],
  ]);
  assert.equal(inspection.terminalTier, "runtime-document");
  assert.equal(inspection.executionStatus, "lowering-required");
  assert.match(String(inspection.executionReason), /dialect-owned lowering/i);
});
