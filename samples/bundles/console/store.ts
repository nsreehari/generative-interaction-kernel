// The console's DOMAIN: types, seed data, pure validation, and its named effect handlers.
//
// Under the "everything is JSON" model the console has no bespoke Orchestrator class. Its UI is a
// JSON document composed from shared primitives; its consequential operations are registered
// NATIVE effect handlers (create/save/validate/promote a profile) that the shared effect
// dispatcher routes `invoke("<name>")` to. Each handler reads the live store (the kernel applies
// reducer ops before effects run) and returns store deltas — the reducer stays pure. Only genuinely
// effectful/derived logic lives here in code; everything above it is data.

import type { CapabilityDescriptor, Enveloped, Json, ManifestPayload } from "@gik/kernel";
import { setOp, type EffectContext, type EffectHandlerMap, type SerializableBundle } from "@gik/react";
import {
  createProfileBundle,
  lintLoweringRecipeArtifact,
  lintProfileArtifacts,
  loadProfileBundle,
  parseProfileBundleJson,
  recipeForKinds,
  stringifyProfileBundle,
  validateLoweringRecipeArtifact,
  validateProfileArtifact,
  type PresentationToRuntimeRecipe,
  type ProfileArtifactBundle,
} from "@gik/profile";
import {
  compileInteraction,
  type InteractionKind,
  type InteractionSpec,
  type PresentationContext,
} from "../../../interaction/src/index";
import { sampleProfileCatalog, type SampleProfileEntry } from "../../profiles/registry";
import { demoDataFor } from "../workbench/bundles/demo/demo";

export type ConsoleTab = "overview" | "validation" | "preview" | "artifacts";

interface PreviewInput {
  interaction: InteractionKind;
  subject: string;
  surface: string;
}

interface ValidationResult {
  status: "unknown" | "ok" | "error";
  errors: string[];
  warnings: string[];
  errorsText: string;
  warningsText: string;
}

type ProfileSource = "repo" | "local";

interface CatalogEntry extends SampleProfileEntry {
  source: ProfileSource;
  readonly: boolean;
  bundle: ProfileArtifactBundle;
}

interface CatalogSnapshot {
  entries: readonly CatalogEntry[];
  status: string;
}

interface EditableProfileState {
  id: string;
  bundleText: string;
  status: string;
  error: string;
}

const LOCAL_PROFILE_STORAGE_KEY = "gik.console.profileBundles.v1";

const PREVIEW_CAPABILITIES: Record<string, CapabilityDescriptor> = {
  "ui:board": {
    propsSchema: { type: "object", additionalProperties: true },
    slots: ["children"],
  },
  "ui:metric": {
    propsSchema: { type: "object", additionalProperties: true },
  },
  "ui:table": {
    propsSchema: { type: "object", additionalProperties: true },
    emits: ["rowSelect"],
    dataProp: "rows",
  },
  "ui:actions": {
    propsSchema: { type: "object", additionalProperties: true },
    emits: ["tap"],
  },
  "ui:chart": {
    propsSchema: { type: "object", additionalProperties: true },
    dataProp: "data",
  },
  "ui:markdown": {
    propsSchema: { type: "object", additionalProperties: true },
    dataProp: "value",
  },
  "ui:markup": {
    propsSchema: { type: "object", additionalProperties: true },
    dataProp: "value",
  },
  "ui:todo": {
    propsSchema: { type: "object", additionalProperties: true },
    emits: ["save"],
    dataProp: "items",
  },
};

const PROFILE_PREVIEW_MANIFEST: Enveloped<ManifestPayload> = {
  gik: "0.1",
  type: "manifest",
  payload: {
    version: "genui-profile-preview/1.0",
    expression: "jsonata",
    namespaces: ["card_data", "requires", "fetched_sources", "computed_values"],
    actions: ["assign", "assignFrom", "derive", "invoke", "route", "confirm", "emit"],
    externals: {
      projectionViews: {
        ui: { from: "profile" },
      },
    },
    capabilities: PREVIEW_CAPABILITIES,
  },
};

const PREVIEW_STATE: Record<string, Json> = {
  card_data: {},
  requires: {},
  fetched_sources: {
    orders: [
      { id: "order-42", amount: 120 },
      { id: "order-43", amount: 30 },
    ],
  },
  computed_values: { total: 150 },
};

const EMPTY_PROFILE = {
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
};

const EMPTY_EDITOR: EditableProfileState = {
  id: "",
  bundleText: "",
  status: "Add a new local profile or select an existing one to edit and save it in browser storage.",
  error: "",
};

const EMPTY_VALIDATION: ValidationResult = {
  status: "unknown",
  errors: [],
  warnings: [],
  errorsText: "Select a profile to validate.",
  warningsText: "",
};

function readRepoCatalog(): readonly CatalogEntry[] {
  return sampleProfileCatalog.map((entry) => ({
    ...entry,
    source: "repo" as const,
    readonly: true,
    bundle: createProfileBundle(entry.artifact, entry.recipeArtifacts),
  }));
}

function readStr(ctx: EffectContext, path: string, fallback = ""): string {
  const value = ctx.get(path);
  return value == null ? fallback : String(value);
}

function readSelectedId(ctx: EffectContext): string {
  return readStr(ctx, "console.selectedId");
}

function readTab(ctx: EffectContext): ConsoleTab {
  const value = readStr(ctx, "console.tab", "overview");
  return value === "overview" || value === "validation" || value === "preview" || value === "artifacts"
    ? value
    : "overview";
}

function readPreviewInput(ctx: EffectContext): PreviewInput {
  return {
    interaction: readStr(ctx, "console.previewInteraction", "investigate") as InteractionKind,
    subject: readStr(ctx, "console.previewSubject", "incident"),
    surface: readStr(ctx, "console.previewSurface", "desktop"),
  };
}

function catalogRows(entries: readonly CatalogEntry[]) {
  return entries.map((entry) => ({
    id: entry.artifact.payload.id,
    kind: entry.artifact.payload.kind,
    version: entry.artifact.payload.version,
    layers: entry.artifact.payload.layers.length,
    stages: entry.profile.stages.length,
    source: entry.source,
    readonly: entry.readonly,
  }));
}

function findEntry(id: string, entries: readonly CatalogEntry[]): CatalogEntry | undefined {
  return entries.find((entry) => entry.artifact.payload.id === id);
}

function profileStorage(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  return globalThis.localStorage ?? null;
}

function readStoredBundleMap(): { bundles: Record<string, ProfileArtifactBundle>; errors: string[] } {
  const storage = profileStorage();
  if (!storage) return { bundles: {}, errors: [] };

  const raw = storage.getItem(LOCAL_PROFILE_STORAGE_KEY);
  if (!raw) return { bundles: {}, errors: [] };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        bundles: {},
        errors: ["Local profile storage was ignored because it is not a JSON object."],
      };
    }

    const bundles: Record<string, ProfileArtifactBundle> = {};
    const errors: string[] = [];
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      try {
        const bundle = parseProfileBundleJson(JSON.stringify(value));
        bundles[id] = normalizeBundleId(bundle, id);
      } catch (error) {
        errors.push(`Skipped stored profile '${id}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { bundles, errors };
  } catch (error) {
    return {
      bundles: {},
      errors: [
        `Local profile storage could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function writeStoredBundleMap(bundles: Record<string, ProfileArtifactBundle>): void {
  const storage = profileStorage();
  if (!storage) {
    throw new Error("Browser localStorage is unavailable in this host.");
  }
  storage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(bundles));
}

function normalizeBundleId(bundle: ProfileArtifactBundle, id: string): ProfileArtifactBundle {
  if (bundle.profileArtifact.payload.id === id) return bundle;
  return createProfileBundle(
    {
      ...bundle.profileArtifact,
      payload: {
        ...bundle.profileArtifact.payload,
        id,
      },
    },
    bundle.recipeArtifacts
  );
}

function asCatalogEntry(bundle: ProfileArtifactBundle, source: ProfileSource, readonly: boolean): CatalogEntry {
  return {
    artifact: bundle.profileArtifact,
    recipeArtifacts: bundle.recipeArtifacts,
    profile: loadProfileBundle(bundle),
    source,
    readonly,
    bundle,
  };
}

function loadCatalog(): CatalogSnapshot {
  const repoCatalog = readRepoCatalog();
  const { bundles, errors } = readStoredBundleMap();
  const localEntries: CatalogEntry[] = [];
  for (const [id, bundle] of Object.entries(bundles)) {
    try {
      localEntries.push(asCatalogEntry(normalizeBundleId(bundle, id), "local", false));
    } catch (error) {
      errors.push(`Skipped local profile '${id}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  localEntries.sort((left, right) => left.artifact.payload.id.localeCompare(right.artifact.payload.id));
  return {
    entries: [...repoCatalog, ...localEntries],
    status: errors.join("\n"),
  };
}

function catalogStatus(snapshot: CatalogSnapshot): string {
  if (snapshot.status) return snapshot.status;
  const localCount = snapshot.entries.filter((entry) => entry.source === "local").length;
  return localCount > 0 ? `${localCount} local profile${localCount === 1 ? "" : "s"} loaded from browser storage.` : "";
}

function nextDraftId(baseId: string, entries: readonly CatalogEntry[]): string {
  const taken = new Set(entries.map((entry) => entry.artifact.payload.id));
  if (!taken.has(baseId)) return baseId;
  let index = 2;
  while (taken.has(`${baseId}-${index}`)) index += 1;
  return `${baseId}-${index}`;
}

function editorState(entry: CatalogEntry, statusOverride?: string, error = ""): EditableProfileState {
  return {
    id: entry.readonly ? nextDraftId(`${entry.artifact.payload.id}-local`, loadCatalog().entries) : entry.artifact.payload.id,
    bundleText: stringifyProfileBundle(entry.bundle),
    status:
      statusOverride ??
      (entry.readonly
        ? "Repo sample profiles are read-only. Change the local id and save to browser storage to make an editable copy."
        : `Editing browser-stored profile '${entry.artifact.payload.id}'. Save to persist changes or delete to remove it.`),
    error,
  };
}

function runtimeRecipeOf(entry: SampleProfileEntry): PresentationToRuntimeRecipe {
  return recipeForKinds(entry.profile, "presentation", "runtime-document") as PresentationToRuntimeRecipe;
}

function capabilityRows(entry: SampleProfileEntry) {
  const recipe = runtimeRecipeOf(entry);
  const seen = new Set<string>();
  const values = [
    recipe.container.capability,
    ...recipe.rules.map((rule) => rule.emit.capability).filter((value): value is string => !!value),
    ...(recipe.fallback?.capability ? [recipe.fallback.capability] : []),
  ].filter((value, index, all) => all.indexOf(value) === index);

  return values.map((capability) => {
    seen.add(capability);
    return { id: capability, capability };
  });
}

function profileState(entry: CatalogEntry) {
  const artifact = entry.artifact.payload;
  const firstStage = entry.profile.stages[0];
  const lastStage = entry.profile.stages[entry.profile.stages.length - 1];
  return {
    id: artifact.id,
    kind: artifact.kind,
    version: artifact.version,
    source: entry.source,
    readonly: entry.readonly,
    sourceKind: firstStage?.fromLayer.kind ?? "",
    targetKind: lastStage?.toLayer.kind ?? "",
    layerCount: artifact.layers.length,
    stageCount: entry.profile.stages.length,
    layers: artifact.layers.map((layer) => ({
      id: layer.id,
      kind: layer.kind,
      schema: layer.schema ?? "",
    })),
    stages: entry.profile.stages.map((stage) => ({
      id: stage.ref.id,
      from: stage.fromLayer.kind,
      to: stage.toLayer.kind,
    })),
    capabilities: capabilityRows(entry),
  };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function artifactState(entry: CatalogEntry) {
  const bundle = entry.bundle;
  return {
    profileText: formatJson(entry.artifact),
    recipesText: entry.recipeArtifacts.map((artifact) => formatJson(artifact)).join("\n\n"),
    resolvedText: formatJson({
      id: entry.artifact.payload.id,
      stages: entry.profile.stages.map((stage) => ({
        recipe: stage.ref.id,
        fromLayer: stage.fromLayer,
        toLayer: stage.toLayer,
      })),
    }),
    bundleText: stringifyProfileBundle(bundle),
  };
}

export function validateSampleProfile(entry: SampleProfileEntry): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    validateProfileArtifact(entry.artifact);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const recipe of entry.recipeArtifacts) {
    try {
      validateLoweringRecipeArtifact(recipe);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  warnings.push(...lintProfileArtifacts(entry.artifact, entry.recipeArtifacts).map((warning) => warning.detail));
  for (const recipe of entry.recipeArtifacts) {
    warnings.push(
      ...lintLoweringRecipeArtifact(recipe, PREVIEW_CAPABILITIES).map((warning) => warning.detail)
    );
  }

  return {
    status: errors.length > 0 ? "error" : "ok",
    errors,
    warnings,
    errorsText: errors.length > 0 ? errors.join("\n") : "No errors.",
    warningsText: warnings.length > 0 ? warnings.join("\n") : "No warnings.",
  };
}

function previewSpec(input: PreviewInput): InteractionSpec {
  const base: InteractionSpec = {
    interaction: input.interaction,
    subject: input.subject.trim() || "incident",
  };
  return { ...base, data: demoDataFor(base) };
}

export function buildProfilePreviewBundle(
  entry: SampleProfileEntry,
  input: PreviewInput
): SerializableBundle {
  const spec = previewSpec(input);
  const ctx: PresentationContext = {
    surface: (input.surface || "desktop") as PresentationContext["surface"],
  };
  const document = compileInteraction(spec, ctx, entry.profile);
  return {
    manifest: PROFILE_PREVIEW_MANIFEST,
    document: { gik: "0.1", type: "document", payload: document },
    state: PREVIEW_STATE,
  };
}

function previewState(entry: SampleProfileEntry, input: PreviewInput) {
  try {
    return {
      bundle: buildProfilePreviewBundle(entry, input),
      error: "",
    };
  } catch (error) {
    return {
      bundle: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function baseCatalogOps(snapshot: CatalogSnapshot) {
  return [
    setOp("console.profiles", catalogRows(snapshot.entries) as unknown as Json),
    setOp("console.catalogStatus", catalogStatus(snapshot)),
  ];
}

function clearSelectionOps(snapshot: CatalogSnapshot, message = "") {
  return [
    ...baseCatalogOps(snapshot),
    setOp("console.selectedId", ""),
    setOp("console.profile", EMPTY_PROFILE as unknown as Json),
    setOp("console.validation", EMPTY_VALIDATION as unknown as Json),
    setOp("console.artifacts", { ...EMPTY_EDITOR, profileText: "", recipesText: "", resolvedText: "", bundleText: "" } as unknown as Json),
    setOp("console.previewBundle", null as unknown as Json),
    setOp("console.previewError", message),
    setOp("console.editor", { ...EMPTY_EDITOR, status: message || EMPTY_EDITOR.status } as unknown as Json),
  ];
}

function selectionOps(entry: CatalogEntry, input: PreviewInput, tab: ConsoleTab, snapshot: CatalogSnapshot) {
  const validation = validateSampleProfile(entry);
  const preview = previewState(entry, input);
  return [
    ...baseCatalogOps(snapshot),
    setOp("console.selectedId", entry.artifact.payload.id),
    setOp("console.profile", profileState(entry) as unknown as Json),
    setOp("console.validation", validation as unknown as Json),
    setOp("console.artifacts", artifactState(entry) as unknown as Json),
    setOp("console.previewBundle", preview.bundle as unknown as Json),
    setOp("console.previewError", preview.error),
    setOp("console.editor", editorState(entry) as unknown as Json),
    setOp("console.tab", tab),
  ];
}

export const consoleEffects: EffectHandlerMap = {
  $init() {
    const snapshot = loadCatalog();
    return { ops: baseCatalogOps(snapshot) };
  },

  syncCatalog(ctx) {
    const snapshot = loadCatalog();
    const selected = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!selected) return { ops: baseCatalogOps(snapshot) };
    return { ops: selectionOps(selected, readPreviewInput(ctx), readTab(ctx), snapshot) };
  },

  loadProfile(ctx) {
    const snapshot = loadCatalog();
    const entry = findEntry(String(ctx.payload.id ?? ""), snapshot.entries);
    if (!entry) {
      return {
        ops: clearSelectionOps(snapshot, `Profile '${String(ctx.payload.id ?? "")}' not found.`),
      };
    }
    return { ops: selectionOps(entry, readPreviewInput(ctx), "overview", snapshot) };
  },

  validateProfile(ctx) {
    const snapshot = loadCatalog();
    const entry = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!entry) return { ops: [] };
    const validation = validateSampleProfile(entry);
    return {
      ops: [
        ...baseCatalogOps(snapshot),
        setOp("console.validation", validation as unknown as Json),
        setOp("console.tab", "validation"),
      ],
    };
  },

  refreshPreview(ctx) {
    const snapshot = loadCatalog();
    const entry = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!entry) return { ops: [] };
    const preview = previewState(entry, readPreviewInput(ctx));
    return {
      ops: [
        ...baseCatalogOps(snapshot),
        setOp("console.previewBundle", preview.bundle as unknown as Json),
        setOp("console.previewError", preview.error),
        setOp("console.tab", "preview"),
      ],
    };
  },

  seedLocalDraft(ctx) {
    const snapshot = loadCatalog();
    const selected = findEntry(readSelectedId(ctx), snapshot.entries) ?? snapshot.entries[0];
    if (!selected) return { ops: baseCatalogOps(snapshot) };

    const localId = nextDraftId(`${selected.artifact.payload.id}-local`, snapshot.entries);
    const draft = normalizeBundleId(selected.bundle, localId);
    return {
      ops: [
        ...selectionOps(selected, readPreviewInput(ctx), "artifacts", snapshot),
        setOp(
          "console.editor",
          {
            id: localId,
            bundleText: stringifyProfileBundle(draft),
            status: `New local profile draft started from '${selected.artifact.payload.id}'. Save it to browser storage to create an editable local profile.`,
            error: "",
          } as unknown as Json
        ),
      ],
    };
  },

  saveLocalProfile(ctx) {
    const snapshot = loadCatalog();
    try {
      const rawId = readStr(ctx, "console.editor.id").trim();
      const rawBundle = readStr(ctx, "console.editor.bundleText").trim();
      if (!rawBundle) throw new Error("Profile bundle JSON is empty.");

      const parsed = parseProfileBundleJson(rawBundle);
      const nextId = (rawId || parsed.profileArtifact.payload.id).trim();
      if (!nextId) throw new Error("Local profile id is required.");
      if (readRepoCatalog().some((entry) => entry.artifact.payload.id === nextId)) {
        throw new Error(`'${nextId}' is a repo sample profile id. Save with a different local id.`);
      }

      const normalized = normalizeBundleId(parsed, nextId);
      const selected = findEntry(readSelectedId(ctx), snapshot.entries);
      const { bundles } = readStoredBundleMap();
      if (selected?.source === "local" && selected.artifact.payload.id !== nextId) {
        delete bundles[selected.artifact.payload.id];
      }
      bundles[nextId] = normalized;
      writeStoredBundleMap(bundles);

      const fresh = loadCatalog();
      const saved = findEntry(nextId, fresh.entries);
      if (!saved) throw new Error(`Saved local profile '${nextId}' could not be reloaded.`);

      return {
        ops: [
          ...selectionOps(saved, readPreviewInput(ctx), "artifacts", fresh),
          setOp(
            "console.editor",
            {
              ...editorState(saved),
              status: `Saved local profile '${nextId}' to browser storage.`,
              error: "",
            } as unknown as Json
          ),
        ],
      };
    } catch (error) {
      return {
        ops: [
          ...baseCatalogOps(snapshot),
          setOp(
            "console.editor",
            {
              id: readStr(ctx, "console.editor.id"),
              bundleText: readStr(ctx, "console.editor.bundleText"),
              status: readStr(ctx, "console.editor.status", EMPTY_EDITOR.status),
              error: error instanceof Error ? error.message : String(error),
            } as unknown as Json
          ),
          setOp("console.tab", "artifacts"),
        ],
      };
    }
  },

  deleteLocalProfile(ctx) {
    const snapshot = loadCatalog();
    const selected = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!selected) {
      return {
        ops: [
          ...baseCatalogOps(snapshot),
          setOp(
            "console.editor",
            {
              ...EMPTY_EDITOR,
              error: "Select a local profile before deleting it.",
            } as unknown as Json
          ),
          setOp("console.tab", "artifacts"),
        ],
      };
    }
    if (selected.readonly || selected.source !== "local") {
      return {
        ops: [
          ...selectionOps(selected, readPreviewInput(ctx), "artifacts", snapshot),
          setOp(
            "console.editor",
            {
              ...editorState(selected),
              error: "Repo sample profiles are read-only and cannot be deleted from browser storage.",
            } as unknown as Json
          ),
        ],
      };
    }

    const { bundles } = readStoredBundleMap();
    delete bundles[selected.artifact.payload.id];
    writeStoredBundleMap(bundles);
    const fresh = loadCatalog();
    return {
      ops: [
        ...clearSelectionOps(fresh, ""),
        setOp(
          "console.editor",
          {
            ...EMPTY_EDITOR,
            status: `Deleted local profile '${selected.artifact.payload.id}' from browser storage.`,
          } as unknown as Json
        ),
        setOp("console.tab", "artifacts"),
      ],
    };
  },
};
