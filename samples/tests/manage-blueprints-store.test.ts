import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";

import type { Json, PatchOp } from "@gik/kernel";
import { openSampleBlueprint } from "../shared/blueprints";
import { readUserBlueprintArtifacts } from "../shared/blueprint-catalog";
import { manageBlueprintsEffects } from "../blueprints/manage-blueprints/native/effect_handlers/manageBlueprintsEffectHandlers";

type JsonRecord = Record<string, Json>;
const managerBlueprint = openSampleBlueprint("manage-blueprints");
const initialState = managerBlueprint.state;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("gik-samples-host");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

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

test("listBlueprints exposes built-in artifacts as read-only", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  const result = await manageBlueprintsEffects.listBlueprints(context(state));
  const rows = opValue(result?.ops, "manageBlueprints.blueprints") as JsonRecord[];

  assert.ok(rows.length > 0);
  assert.equal(rows.some((row) => row.id === "samples-overview" && row.source === "repo" && row.readonly === true), true);
  assert.equal(rows.some((row) => row.id === "samples-overview" && row.sourceLabel === "Built-in"), true);
  assert.equal(rows.some((row) => row.id === "samples-overview" && row.scopeLabel === "Frontend"), true);
  assert.equal(rows.some((row) => row.id === "backend-order-processing" && row.scopeLabel === "Backend"), true);
  assert.equal(rows.some((row) => row.id === "middleware-continuity" && row.scopeLabel === "Middleware"), true);

  const backend = await manageBlueprintsEffects.getBlueprint(context(state, { values: ["backend-order-processing"] }));
  const selected = opValue(backend?.ops, "manageBlueprints.selected") as JsonRecord;
  assert.deepEqual(selected.tabs, [
    { value: "overview", label: "Overview" },
    { value: "draft", label: "JSON" },
  ]);

  const headless = await manageBlueprintsEffects.getBlueprint(context(state, { values: ["portfolio-tracker-2tiers-headless"] }));
  assert.deepEqual((opValue(headless?.ops, "manageBlueprints.selected") as JsonRecord).tabs, [
    { value: "overview", label: "Overview" },
    { value: "draft", label: "JSON" },
  ]);

  const projected = await manageBlueprintsEffects.getBlueprint(context(state, { values: ["samples-overview"] }));
  assert.deepEqual((opValue(projected?.ops, "manageBlueprints.selected") as JsonRecord).tabs, [
    { value: "overview", label: "Overview" },
    { value: "draft", label: "JSON" },
    { value: "preview", label: "Preview" },
  ]);
});

test("JSON editing uses a locally stateful declarative form", () => {
  const cells = managerBlueprint.definition.payload.cells as unknown as Record<string, JsonRecord>;
  const runtime = managerBlueprint.definition.payload.runtime as unknown as JsonRecord;
  const capabilities = runtime.capabilities as JsonRecord;
  const effectHandlers = (runtime.externals as JsonRecord).effectHandlers as Json[];
  const formView = cells["editor-form"].view as JsonRecord;
  const fields = (formView.props as JsonRecord).fields as JsonRecord;
  const validators = fields.validators as JsonRecord[];

  assert.equal(formView.capability, "primitive:form");
  assert.equal(validators[0].kind, "ajv-schema");
  assert.equal(validators[1].code, "blueprint-id-unique");
  assert.ok((formView.bindings as JsonRecord).validationContext);
  assert.deepEqual((formView.bindings as JsonRecord).readOnly, { from: "manageBlueprints.selected.readonly" });
  assert.equal(formView.visibility, undefined);
  assert.equal(cells["editor-id"], undefined);
  assert.equal(cells["editor-json"], undefined);
  assert.equal(cells["editor-status"], undefined);
  assert.equal(cells["validation-summary"], undefined);
  assert.equal(cells["validation-errors"], undefined);
  assert.equal(cells["validation-warnings"], undefined);
  assert.equal(cells["validate-blueprint"], undefined);
  assert.equal(cells["save-blueprint"], undefined);
  assert.equal(cells["preview-blueprint"], undefined);
  assert.equal((cells["import-blueprint"].view as JsonRecord).capability, "primitive:file-input");
  assert.equal((cells["export-blueprint"].view as JsonRecord).capability, "primitive:file-download");
  assert.equal(((cells["blueprint-list"].view as JsonRecord).props as JsonRecord).selectionMode, "single");
  assert.equal(capabilities["manage-blueprints:blueprint-import"], undefined);
  assert.equal(effectHandlers.includes("exportBlueprint"), false);
});

test("create, save, reload, challenge, and delete stay inside the user Blueprint catalog", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();

  const created = await manageBlueprintsEffects.createBlueprint(context(state));
  applyOps(state, created?.ops);
  assert.equal(getPath(state, "manageBlueprints.tab"), "draft");
  assert.equal(getPath(state, "manageBlueprints.validation.previewable"), true);

  const createdValues = getPath(state, "manageBlueprints.editor.formValue") as JsonRecord;
  const saved = await manageBlueprintsEffects.saveBlueprint(context(state, { values: createdValues }));
  applyOps(state, saved?.ops);
  const localId = String(getPath(state, "manageBlueprints.selectedId"));
  assert.equal(localId, "untitled-blueprint-local");
  assert.ok((await readUserBlueprintArtifacts()).blueprints[localId]);

  const renamedValues = { ...createdValues, id: "renamed-blueprint-local" };
  const renamed = await manageBlueprintsEffects.saveBlueprint(context(state, { values: renamedValues }));
  applyOps(state, renamed?.ops);
  const storedAfterRename = (await readUserBlueprintArtifacts()).blueprints;
  assert.equal(localId in storedAfterRename, false);
  assert.equal("renamed-blueprint-local" in storedAfterRename, true);
  const renamedId = "renamed-blueprint-local";

  const reloaded = await manageBlueprintsEffects.listBlueprints(context(createState()));
  const rows = opValue(reloaded?.ops, "manageBlueprints.blueprints") as JsonRecord[];
  assert.equal(rows.some((row) => row.id === renamedId && row.source === "local" && row.readonly === false), true);

  const requested = await manageBlueprintsEffects.requestDeleteBlueprint(context(state));
  assert.equal((opValue(requested?.ops, "manageBlueprints.deleteChallenge") as JsonRecord).open, true);
  assert.match(String((opValue(requested?.ops, "manageBlueprints.deleteChallenge") as JsonRecord).message), /cannot be undone/i);

  const deleted = await manageBlueprintsEffects.deleteBlueprint(context(state));
  assert.equal(deleted?.outcome, "deleted");
  assert.deepEqual((await readUserBlueprintArtifacts()).blueprints, {});
  assert.equal(opValue(deleted?.ops, "manageBlueprints.selectedId"), "");
}, 20_000);

test("repository ids cannot be overwritten or deleted", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  const loaded = await manageBlueprintsEffects.getBlueprint(context(state, { values: ["samples-overview"] }));
  applyOps(state, loaded?.ops);

  const saved = await manageBlueprintsEffects.saveBlueprint(context(state));
  assert.equal(saved?.outcome, "readonly");
  assert.match(String(opValue(saved?.ops, "manageBlueprints.editor.error")), /read-only/i);

  const deleted = await manageBlueprintsEffects.requestDeleteBlueprint(context(state));
  assert.equal(deleted?.outcome, "readonly");
});

test("repository blueprints can be cloned, edited, saved, and deleted locally", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  applyOps(state, (await manageBlueprintsEffects.getBlueprint(context(state, { values: ["samples-overview"] })))?.ops);

  const cloned = await manageBlueprintsEffects.cloneBlueprint(context(state));
  applyOps(state, cloned?.ops);
  assert.equal(cloned?.outcome, "draft-created");
  assert.equal(getPath(state, "manageBlueprints.editor.id"), "samples-overview-local");
  assert.equal(getPath(state, "manageBlueprints.tab"), "draft");

  const artifact = JSON.parse(String(getPath(state, "manageBlueprints.editor.blueprintText"))) as JsonRecord;
  assert.equal((artifact.payload as JsonRecord).id, "samples-overview-local");
  (artifact.payload as JsonRecord).version = "1.0.1-local";
  setPath(state, "manageBlueprints.editor.blueprintText", JSON.stringify(artifact));

  const saved = await manageBlueprintsEffects.saveBlueprint(context(state));
  applyOps(state, saved?.ops);
  assert.equal(saved?.outcome, "saved");
  const stored = (await readUserBlueprintArtifacts()).blueprints["samples-overview-local"];
  assert.equal(stored?.payload.version, "1.0.1-local");

  const requested = await manageBlueprintsEffects.requestDeleteBlueprint(context(state));
  assert.equal(requested?.outcome, "confirmation-required");
  const deleted = await manageBlueprintsEffects.deleteBlueprint(context(state));
  assert.equal(deleted?.outcome, "deleted");
  assert.equal((await readUserBlueprintArtifacts()).blueprints["samples-overview-local"], undefined);
}, 20_000);

test("importBlueprint validates file text and opens an unsaved local draft", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const state = createState();
  applyOps(state, (await manageBlueprintsEffects.createBlueprint(context(state)))?.ops);
  const text = String(getPath(state, "manageBlueprints.editor.blueprintText"));

  const imported = await manageBlueprintsEffects.importBlueprint(context(createState(), {
    file: {
      name: "Incident Review.blueprint.json",
      type: "application/json",
      size: text.length,
      lastModified: 0,
      text,
      encoding: "text",
    },
  }));

  assert.equal(imported?.outcome, "draft-imported");
  assert.equal((opValue(imported?.ops, "manageBlueprints.editor") as JsonRecord).id, "incident-review-local");
  assert.equal(opValue(imported?.ops, "manageBlueprints.tab"), "draft");
});

test("importBlueprint rejects payloads outside the normalized text-file contract", async () => {
  const imported = await manageBlueprintsEffects.importBlueprint(context(createState(), {
    file: {
      name: "incomplete.blueprint.json",
      type: "application/json",
      size: 10,
      text: "{}",
      encoding: "text",
    },
  }));

  assert.equal(imported?.outcome, "invalid");
  assert.match(String(opValue(imported?.ops, "manageBlueprints.editor.error")), /normalized text contract/);
});

test("preview exposes a validated structural Blueprint summary", async () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const portableState = createState();
  applyOps(portableState, (await manageBlueprintsEffects.createBlueprint(context(portableState)))?.ops);

  const portable = await manageBlueprintsEffects.selectBlueprintTab(context(portableState, { value: "preview" }));
  assert.equal(portable?.outcome, "summary-ready");
  assert.notEqual(opValue(portable?.ops, "manageBlueprints.previewBlueprint"), null);
  assert.equal(opValue(portable?.ops, "manageBlueprints.previewReference"), "");
});

test("preview references an unchanged persisted Blueprint", async () => {
  const state = createState();
  applyOps(state, (await manageBlueprintsEffects.getBlueprint(context(state, { values: ["samples-overview"] })))?.ops);

  const preview = await manageBlueprintsEffects.selectBlueprintTab(context(state, { value: "preview" }));

  assert.equal(opValue(preview?.ops, "manageBlueprints.previewReference"), "blueprint:samples-overview@2.0");
});

test("selecting the Preview tab renders the current Blueprint", async () => {
  const state = createState();
  applyOps(state, (await manageBlueprintsEffects.getBlueprint(context(state, { values: ["samples-overview"] })))?.ops);

  const preview = await manageBlueprintsEffects.selectBlueprintTab(context(state, { value: "preview" }));

  assert.equal(opValue(preview?.ops, "manageBlueprints.tab"), "preview");
  assert.notEqual(opValue(preview?.ops, "manageBlueprints.previewBlueprint"), null);
  assert.equal(opValue(preview?.ops, "manageBlueprints.previewReference"), "blueprint:samples-overview@2.0");
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

  const preview = await manageBlueprintsEffects.selectBlueprintTab(context(state, { value: "preview" }));
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
