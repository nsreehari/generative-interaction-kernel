import assert from "node:assert/strict";
import { test } from "vitest";

import type { Json, PatchOp } from "@gik/kernel";
import { createProfileBundle, stringifyProfileBundle } from "@gik/profile";
import { buildProfilePreviewBundle, consoleEffects } from "./store";
import { sampleProfileCatalog } from "../../catalog/profile-catalog";

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
        layerCount: 0,
        recipeCount: 0,
      },
      pipeline: {
        nodes: [],
      },
      layers: [],
      selectedLayerId: "",
      layerDetail: {
        id: "",
        kind: "",
        schema: "",
        description: "",
        outgoingRecipe: {
          id: "",
          kind: "",
          kindLabel: "",
          from: "",
          to: "",
          summary: "",
          constrainedWhenText: "",
          containerCapability: "",
          fallbackCapability: "",
          fromLayer: { id: "", kind: "", schema: "", description: "" },
          toLayer: { id: "", kind: "", schema: "", description: "" },
          ruleGroups: [],
          templates: [],
          runtimeRules: [],
          runtimeCapabilities: [],
        },
        incomingRecipe: {
          id: "",
          kind: "",
          kindLabel: "",
          from: "",
          to: "",
          summary: "",
          constrainedWhenText: "",
          containerCapability: "",
          fallbackCapability: "",
          fromLayer: { id: "", kind: "", schema: "", description: "" },
          toLayer: { id: "", kind: "", schema: "", description: "" },
          ruleGroups: [],
          templates: [],
          runtimeRules: [],
          runtimeCapabilities: [],
        },
      },
      selectedRecipeId: "",
      recipeDetail: {
        id: "",
        kind: "",
        kindLabel: "",
        from: "",
        to: "",
        summary: "",
        constrainedWhenText: "",
        containerCapability: "",
        fallbackCapability: "",
        fromLayer: { id: "", kind: "", schema: "", description: "" },
        toLayer: { id: "", kind: "", schema: "", description: "" },
        ruleGroups: [],
        templates: [],
        runtimeRules: [],
        runtimeCapabilities: [],
      },
      validation: {
        status: "unknown",
        level: "unknown",
        summary: "",
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
      sourceInputForm: { properties: {} },
      sourceInput: {},
      previewContextForm: {
        properties: {
          surface: {
            title: "Surface",
            default: "desktop",
            enum: ["desktop", "web", "mobile", "copilot", "teams"],
          },
        },
        required: ["surface"],
      },
      previewContext: { surface: "desktop" },
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
  assert.match(String(opRecord(result?.ops, "console.editor").status), /read-only/i);
  assert.equal(opValue(result?.ops, "console.selectedLayerId"), sampleProfileCatalog[0].artifact.payload.layers[0].id);
  assert.equal(opValue(result?.ops, "console.selectedRecipeId"), "");
  assert.equal((opRecord(result?.ops, "console.sourceInput") as JsonRecord).interaction, "investigate");
  assert.equal((opRecord(result?.ops, "console.previewContext") as JsonRecord).surface, "desktop");
});

test("layer vocabulary is derived from template metadata for both source and presentation layers", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

  const sourceState = createState();
  const liveCards = await consoleEffects.loadProfile({
    get: (path) => getPath(sourceState, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: { id: "live-cards" },
    store: { get: (path: string) => getPath(sourceState, path) } as never,
  });
  const liveCardsGroups = (opRecord(liveCards?.ops, "console.layerDetail").vocabulary as JsonRecord).groups as JsonRecord[];
  assert.deepEqual(liveCardsGroups.map((group) => group.id), ["interactions", "roles", "context"]);

  const presentationState = createState();
  const fourLayers = await consoleEffects.loadProfile({
    get: (path) => getPath(presentationState, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: { id: "4layers" },
    store: { get: (path: string) => getPath(presentationState, path) } as never,
  });
  applyOps(presentationState, fourLayers?.ops as PatchOp[] | undefined);

  const presentationLayer = await consoleEffects.selectLayer({
    get: (path) => getPath(presentationState, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: { id: "presentation" },
    store: { get: (path: string) => getPath(presentationState, path) } as never,
  });
  const presentationGroups = (opRecord(presentationLayer?.ops, "console.layerDetail").vocabulary as JsonRecord).groups as JsonRecord[];
  assert.deepEqual(presentationGroups.map((group) => group.id), ["layouts", "presentations"]);
});

test("console inspector metadata drives workflow recipe labels and sample seeds", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

  const state = createState();
  const result = await consoleEffects.loadProfile({
    get: (path) => getPath(state, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: { id: "4layers" },
    store: { get: (path: string) => getPath(state, path) } as never,
  });

  const detail = opRecord(result?.ops, "console.layerDetail");
  const seeds = detail.seeds as JsonRecord[];
  assert.equal((detail.outgoingRecipe as JsonRecord).kindLabel, "Workflow → Interaction");
  assert.equal((detail.outgoingRecipe as JsonRecord).tagline, "selects the interaction");
  assert.deepEqual(seeds.map((seed) => seed.label), [
    "incident-triage",
    "portfolio-review",
    "operations-monitoring",
    "change-approval",
  ]);
  assert.equal(((seeds[0]?.payload as JsonRecord)?.workflow), "incident-triage");
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
  assert.equal(opValue(result?.ops, "console.tab"), "draft");
  assert.equal(opRecord(result?.ops, "console.editor").id, "live-cards-local");
  assert.match(String(opRecord(result?.ops, "console.editor").status), /New draft from/);
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

test("selectLayer and selectRecipe update the focused detail models", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

  const sample = sampleProfileCatalog[0];
  const state = createState();
  setPath(state, "console.selectedId", sample.artifact.payload.id);
  setPath(state, "console.selectedLayerId", sample.artifact.payload.layers[0].id);
  setPath(state, "console.selectedRecipeId", sample.artifact.payload.recipes[0].id);

  const selectedLayer = sample.artifact.payload.layers[1].id;
  const layerResult = await consoleEffects.selectLayer({
    get: (path) => getPath(state, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: { id: selectedLayer },
    store: { get: (path: string) => getPath(state, path) } as never,
  });

  assert.equal(opValue(layerResult?.ops, "console.selectedLayerId"), selectedLayer);
  assert.equal(opRecord(layerResult?.ops, "console.layerDetail").id, selectedLayer);
  assert.equal(opValue(layerResult?.ops, "console.selectedRecipeId"), "");

  const selectedRecipe = sample.artifact.payload.recipes[1].id;
  const recipeResult = await consoleEffects.selectRecipe({
    get: (path) => getPath(state, path),
    set: (path, value) => ({ op: "set", path, value }),
    args: {},
    payload: { id: selectedRecipe },
    store: { get: (path: string) => getPath(state, path) } as never,
  });

  assert.equal(opValue(recipeResult?.ops, "console.selectedLayerId"), sample.artifact.payload.recipes[1].from);
  assert.equal(opValue(recipeResult?.ops, "console.selectedRecipeId"), selectedRecipe);
  assert.equal(opRecord(recipeResult?.ops, "console.recipeDetail").id, selectedRecipe);
  assert.equal((opRecord(recipeResult?.ops, "console.layerDetail").outgoingRecipe as JsonRecord).id, selectedRecipe);
});

test("configure preview for live-cards emits the frontend editable-table kind end-to-end", () => {
  const liveCards = sampleProfileCatalog.find((entry) => entry.artifact.payload.id === "live-cards");
  assert.ok(liveCards, "live-cards sample profile should be registered");

  const bundle = buildProfilePreviewBundle(liveCards, {
    source: {
      interaction: "configure",
      subject: "incident",
    },
    ctx: {
      surface: "desktop",
    },
  });

  const document = (bundle.document as { payload: { root: { edges?: { children?: Array<Record<string, unknown>> } } } }).payload;
  const settings = document.root.edges?.children?.find((child) => child.id === "settings-region") as
    | { capability?: string; edges?: { read?: Record<string, unknown> }; props?: Record<string, unknown> }
    | undefined;

  assert.equal(settings?.capability, "ui:editable-table");
  assert.deepEqual(settings?.edges?.read, { rows: "fetched_sources.orders" });
  assert.deepEqual(settings?.props?.spec, {
    columns: ["id", "amount"],
    addRow: false,
    deleteRow: false,
  });
});

test("workflow source preview runs from the source layer form instead of assuming interaction fields", () => {
  const fourLayers = sampleProfileCatalog.find((entry) => entry.artifact.payload.id === "4layers");
  assert.ok(fourLayers, "4layers sample profile should be registered");

  const bundle = buildProfilePreviewBundle(fourLayers, {
    source: {
      workflow: "change-approval",
      subject: "incident",
    },
    ctx: {
      surface: "desktop",
    },
  });

  const document = (bundle.document as unknown as { payload: { root: Record<string, unknown> } }).payload;
  assert.equal(typeof document.root.id, "string");
});