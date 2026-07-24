import type { Json } from "@gik/kernel";
import {
  bundleFromJson,
  setOp,
  type EffectContext,
  type EffectHandlerMap,
  type SerializableBundle,
} from "@gik/react";

const LOCAL_BUNDLE_STORAGE_KEY = "gik.manage-bundles.bundles.v1";
const BUNDLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type JsonRecord = Record<string, Json>;
type BundleSource = "repo" | "local";

type CatalogEntry = {
  id: string;
  source: BundleSource;
  readonly: boolean;
  bundle: SerializableBundle;
};

type ValidationResult = {
  valid: boolean;
  previewable: boolean;
  summary: string;
  errors: string;
  warnings: string;
  nativeDependencies: string[];
  bundle: SerializableBundle | null;
};

const rawManifests = import.meta.glob("../../*/vocabulary.json", { eager: true, import: "default" }) as Record<string, unknown>;
const rawDocuments = import.meta.glob("../../*/program.json", { eager: true, import: "default" }) as Record<string, unknown>;
const rawStates = import.meta.glob("../../*/state.json", { eager: true, import: "default" }) as Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byBundleId(glob: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(glob)) {
    const id = path.match(/\.\.\/\.\.\/([^/]+)\//)?.[1];
    if (id) values[id] = value;
  }
  return values;
}

const manifests = byBundleId(rawManifests);
const documents = byBundleId(rawDocuments);
const states = byBundleId(rawStates);

function getStorage(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  return globalThis.localStorage ?? null;
}

function normalizeBundle(value: unknown): SerializableBundle {
  const bundle = bundleFromJson(value);
  return {
    vocabulary: bundle.vocabulary,
    program: bundle.program,
    ...(bundle.state ? { state: bundle.state } : {}),
  };
}

function readStoredBundleMap(): { bundles: Record<string, SerializableBundle>; errors: string[] } {
  const storage = getStorage();
  if (!storage) return { bundles: {}, errors: [] };
  const raw = storage.getItem(LOCAL_BUNDLE_STORAGE_KEY);
  if (!raw) return { bundles: {}, errors: [] };

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error("stored value must be an object keyed by bundle id");
    const bundles: Record<string, SerializableBundle> = {};
    const errors: string[] = [];
    for (const [id, value] of Object.entries(parsed)) {
      try {
        bundles[id] = normalizeBundle(value);
      } catch (error) {
        errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { bundles, errors };
  } catch (error) {
    return { bundles: {}, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

function writeStoredBundleMap(bundles: Record<string, SerializableBundle>): void {
  const storage = getStorage();
  if (!storage) throw new Error("Browser localStorage is unavailable in this host.");
  storage.setItem(LOCAL_BUNDLE_STORAGE_KEY, JSON.stringify(bundles));
}

function repositoryEntries(): CatalogEntry[] {
  return Object.keys(manifests)
    .sort()
    .flatMap((id) => {
      if (!manifests[id] || !documents[id] || !isRecord(states[id])) return [];
      try {
        return [{
          id,
          source: "repo" as const,
          readonly: true,
          bundle: normalizeBundle({ vocabulary: manifests[id], program: documents[id], state: states[id] }),
        }];
      } catch {
        return [];
      }
    });
}

function loadCatalog(): { entries: CatalogEntry[]; errors: string[] } {
  const stored = readStoredBundleMap();
  const localEntries = Object.entries(stored.bundles).map(([id, bundle]) => ({
    id,
    source: "local" as const,
    readonly: false,
    bundle,
  }));
  return {
    entries: [...repositoryEntries(), ...localEntries].sort((left, right) => left.id.localeCompare(right.id)),
    errors: stored.errors,
  };
}

function manifestPayload(bundle: SerializableBundle): Record<string, unknown> {
  return (bundle.vocabulary as unknown as { payload: Record<string, unknown> }).payload;
}

function nativeDependencies(bundle: SerializableBundle): string[] {
  const externals = manifestPayload(bundle).externals;
  if (!isRecord(externals)) return [];
  const dependencies: string[] = [];
  const providers = externals.projectionViews;
  if (isRecord(providers)) {
    for (const [alias, descriptor] of Object.entries(providers)) {
      const from = isRecord(descriptor) ? String(descriptor.from ?? "") : "";
      if (from && from !== "floor") dependencies.push(`projection provider ${alias}:${from}`);
    }
  }
  const effects = externals.effectHandlers;
  if (Array.isArray(effects)) {
    dependencies.push(...effects.map((name) => `effect handler ${String(name)}`));
  }
  return dependencies;
}

function validate(value: unknown): ValidationResult {
  try {
    const bundle = normalizeBundle(value);
    const dependencies = nativeDependencies(bundle);
    const previewable = dependencies.length === 0;
    return {
      valid: true,
      previewable,
      summary: previewable
        ? "Bundle JSON is valid and portable preview is available."
        : "Bundle JSON is valid; portable preview is blocked by native dependencies.",
      errors: "",
      warnings: dependencies.length > 0 ? dependencies.join("\n") : "",
      nativeDependencies: dependencies,
      bundle,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      previewable: false,
      summary: "Bundle JSON is invalid.",
      errors: message,
      warnings: "",
      nativeDependencies: [],
      bundle: null,
    };
  }
}

function parseEditor(ctx: EffectContext): ValidationResult {
  const text = String(ctx.get("manageBundles.editor.bundleText") ?? "");
  try {
    return validate(JSON.parse(text));
  } catch (error) {
    return {
      valid: false,
      previewable: false,
      summary: "Bundle JSON is invalid.",
      errors: error instanceof Error ? error.message : String(error),
      warnings: "",
      nativeDependencies: [],
      bundle: null,
    };
  }
}

function validationState(result: ValidationResult): JsonRecord {
  return {
    valid: result.valid,
    previewable: result.previewable,
    summary: result.summary,
    errors: result.errors,
    warnings: result.warnings,
  };
}

function catalogRows(entries: CatalogEntry[]): Json[] {
  return entries.map((entry) => {
    const payload = manifestPayload(entry.bundle);
    return {
      id: entry.id,
      label: entry.id,
      source: entry.source,
      readonly: entry.readonly,
      detail: `${entry.source} | ${String(payload.version ?? "unknown version")}`,
    } as Json;
  });
}

function selectedState(entry: CatalogEntry): JsonRecord {
  const payload = manifestPayload(entry.bundle);
  const capabilities = isRecord(payload.capabilities) ? Object.keys(payload.capabilities) : [];
  const namespaces = Array.isArray(payload.namespaces) ? payload.namespaces.map(String) : [];
  return {
    id: entry.id,
    source: entry.source,
    readonly: entry.readonly,
    version: String(payload.version ?? ""),
    namespaces: namespaces.join(", "),
    capabilityCount: capabilities.length,
    nativeDependencies: nativeDependencies(entry.bundle).join("\n"),
  };
}

function editorState(entry: CatalogEntry): JsonRecord {
  return {
    id: entry.id,
    bundleText: JSON.stringify(entry.bundle, null, 2),
    status: entry.readonly
      ? "Repository bundle is read-only. Clone it to create a browser-local draft."
      : "Browser-local bundle loaded and editable.",
    error: "",
  };
}

function catalogOps(entries: CatalogEntry[], errors: string[]) {
  return [
    setOp("manageBundles.bundles", catalogRows(entries)),
    setOp(
      "manageBundles.catalogStatus",
      errors.length > 0
        ? `${entries.length} bundles loaded; ${errors.length} local artifact error(s).`
        : `${entries.length} bundles loaded: repository artifacts are read-only, local artifacts are editable.`
    ),
  ];
}

function findEntry(id: string): CatalogEntry | undefined {
  return loadCatalog().entries.find((entry) => entry.id === id);
}

function portableStarterBundle(): SerializableBundle {
  return normalizeBundle({
    vocabulary: {
      gik: "0.1",
      type: "vocabulary",
      payload: {
        version: "local-bundle/1.0",
        expression: "jsonata",
        namespaces: ["app"],
        actions: [],
        capabilities: {
          "ui:screen": { propsSchema: { type: "object", additionalProperties: true }, slots: ["children"] },
          "ui:note": { propsSchema: { type: "object", additionalProperties: true } },
        },
        externals: { projectionViews: { ui: { from: "floor" } } },
      },
    },
    program: {
      gik: "0.1",
      type: "program",
      payload: {
        root: {
          capability: "ui:screen",
          id: "local-bundle-root",
          props: { title: "Local bundle" },
          edges: {
            children: [{ capability: "ui:note", id: "welcome", props: { value: "Edit this portable bundle." } }],
          },
        },
      },
    },
    state: { app: {} },
  });
}

function nextLocalId(baseId: string): string {
  const ids = new Set(loadCatalog().entries.map((entry) => entry.id));
  const base = `${baseId.replace(/-local(?:-\d+)?$/, "")}-local`;
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function importedId(fileName: string): string {
  const base = fileName
    .replace(/\.bundle\.json$/i, "")
    .replace(/\.json$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return nextLocalId(base || "imported-bundle");
}

function draftOps(id: string, bundle: SerializableBundle, status: string) {
  const result = validate(bundle);
  return [
    setOp("manageBundles.tab", "draft"),
    setOp("manageBundles.editor", { id, bundleText: JSON.stringify(bundle, null, 2), status, error: "" }),
    setOp("manageBundles.validation", validationState(result)),
    setOp("manageBundles.previewBundle", null),
    setOp("manageBundles.previewError", ""),
  ];
}

export const manageBundlesEffects: EffectHandlerMap = {
  $init() {
    const catalog = loadCatalog();
    return { ops: catalogOps(catalog.entries, catalog.errors) };
  },

  listBundles() {
    const catalog = loadCatalog();
    return { ops: catalogOps(catalog.entries, catalog.errors) };
  },

  getBundle(ctx) {
    const id = String(ctx.payload.id ?? "");
    const entry = findEntry(id);
    if (!entry) {
      return { outcome: "not-found", ops: [setOp("manageBundles.editor.error", `Bundle '${id}' was not found.`)] };
    }
    const result = validate(entry.bundle);
    return {
      outcome: "loaded",
      ops: [
        setOp("manageBundles.selectedId", id),
        setOp("manageBundles.selected", selectedState(entry)),
        setOp("manageBundles.editor", editorState(entry)),
        setOp("manageBundles.validation", validationState(result)),
        setOp("manageBundles.previewBundle", null),
        setOp("manageBundles.previewError", ""),
        setOp("manageBundles.tab", "overview"),
      ],
    };
  },

  createBundle() {
    const bundle = portableStarterBundle();
    const id = nextLocalId("untitled-bundle");
    return { outcome: "draft-created", ops: draftOps(id, bundle, "New browser-local bundle draft.") };
  },

  importBundle(ctx) {
    const fileName = String(ctx.payload.name ?? "imported-bundle.json");
    const text = String(ctx.payload.text ?? "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        outcome: "invalid",
        ops: [
          setOp("manageBundles.tab", "draft"),
          setOp("manageBundles.editor.error", message),
          setOp("manageBundles.validation", { valid: false, previewable: false, summary: "Bundle JSON is invalid.", errors: message, warnings: "" }),
        ],
      };
    }
    const result = validate(parsed);
    if (!result.valid || !result.bundle) {
      return {
        outcome: "invalid",
        ops: [
          setOp("manageBundles.tab", "draft"),
          setOp("manageBundles.editor.error", result.errors),
          setOp("manageBundles.validation", validationState(result)),
        ],
      };
    }
    const id = importedId(fileName);
    return { outcome: "draft-imported", ops: draftOps(id, result.bundle, `Imported ${fileName}. Save to persist locally.`) };
  },

  cloneBundle(ctx) {
    const selectedId = String(ctx.get("manageBundles.selectedId") ?? "");
    const entry = findEntry(selectedId);
    if (!entry) {
      return { outcome: "not-found", ops: [setOp("manageBundles.editor.error", "Select a bundle to clone.")] };
    }
    const id = nextLocalId(entry.id);
    return { outcome: "draft-created", ops: draftOps(id, entry.bundle, `New local draft cloned from ${entry.id}.`) };
  },

  saveBundle(ctx) {
    const id = String(ctx.get("manageBundles.editor.id") ?? "").trim();
    if (!BUNDLE_ID_PATTERN.test(id)) {
      return { outcome: "invalid", ops: [setOp("manageBundles.editor.error", "Bundle id must use lowercase kebab-case.")] };
    }
    if (repositoryEntries().some((entry) => entry.id === id)) {
      return { outcome: "readonly", ops: [setOp("manageBundles.editor.error", `Repository bundle '${id}' is read-only. Choose a new local id.`)] };
    }
    const result = parseEditor(ctx);
    if (!result.valid || !result.bundle) {
      return {
        outcome: "invalid",
        ops: [
          setOp("manageBundles.validation", validationState(result)),
          setOp("manageBundles.editor.error", result.errors),
        ],
      };
    }
    const stored = readStoredBundleMap();
    const selectedId = String(ctx.get("manageBundles.selectedId") ?? "");
    const selected = findEntry(selectedId);
    if (selected?.source === "local" && selectedId !== id) {
      delete stored.bundles[selectedId];
    }
    stored.bundles[id] = result.bundle;
    try {
      writeStoredBundleMap(stored.bundles);
    } catch (error) {
      return { outcome: "error", ops: [setOp("manageBundles.editor.error", error instanceof Error ? error.message : String(error))] };
    }
    const catalog = loadCatalog();
    const entry = catalog.entries.find((candidate) => candidate.id === id)!;
    return {
      outcome: "saved",
      ops: [
        ...catalogOps(catalog.entries, catalog.errors),
        setOp("manageBundles.selectedId", id),
        setOp("manageBundles.selected", selectedState(entry)),
        setOp("manageBundles.editor", { id, bundleText: JSON.stringify(result.bundle, null, 2), status: `Saved ${id} locally.`, error: "" }),
        setOp("manageBundles.validation", validationState(result)),
      ],
    };
  },

  validateBundle(ctx) {
    const result = parseEditor(ctx);
    return {
      outcome: result.valid ? "valid" : "invalid",
      ops: [
        setOp("manageBundles.validation", validationState(result)),
        setOp("manageBundles.editor.error", result.errors),
      ],
    };
  },

  previewBundle(ctx) {
    const result = parseEditor(ctx);
    if (!result.valid || !result.bundle) {
      return { outcome: "invalid", ops: [setOp("manageBundles.validation", validationState(result)), setOp("manageBundles.previewError", result.errors)] };
    }
    if (!result.previewable) {
      return {
        outcome: "native-dependencies",
        ops: [
          setOp("manageBundles.validation", validationState(result)),
          setOp("manageBundles.previewBundle", null),
          setOp("manageBundles.previewError", `Portable preview cannot supply:\n${result.nativeDependencies.join("\n")}`),
          setOp("manageBundles.tab", "preview"),
        ],
      };
    }
    return {
      outcome: "preview-ready",
      ops: [
        setOp("manageBundles.validation", validationState(result)),
        setOp("manageBundles.previewBundle", result.bundle as unknown as Json),
        setOp("manageBundles.previewError", ""),
        setOp("manageBundles.tab", "preview"),
      ],
    };
  },

  exportBundle(ctx) {
    const result = parseEditor(ctx);
    if (!result.valid || !result.bundle) {
      return { outcome: "invalid", ops: [setOp("manageBundles.editor.error", result.errors)] };
    }
    const id = String(ctx.get("manageBundles.editor.id") ?? "bundle").trim() || "bundle";
    if (typeof document === "undefined" || typeof URL === "undefined") {
      return { outcome: "unavailable", ops: [setOp("manageBundles.editor.error", "Download is unavailable in this host.")] };
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.bundle, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${id}.bundle.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return { outcome: "exported", ops: [setOp("manageBundles.editor.status", `Exported ${anchor.download}.`), setOp("manageBundles.editor.error", "")] };
  },

  requestDeleteBundle(ctx) {
    const id = String(ctx.get("manageBundles.selectedId") ?? "");
    const entry = findEntry(id);
    if (!entry) return { outcome: "not-found", ops: [setOp("manageBundles.editor.error", "Select a local bundle to delete.")] };
    if (entry.readonly) return { outcome: "readonly", ops: [setOp("manageBundles.editor.error", "Repository bundles cannot be deleted.")] };
    return {
      outcome: "confirmation-required",
      ops: [setOp("manageBundles.deleteChallenge", { open: true, message: `Delete local bundle '${id}'? This cannot be undone.` })],
    };
  },

  cancelDeleteBundle() {
    return { outcome: "cancelled", ops: [setOp("manageBundles.deleteChallenge", { open: false, message: "" })] };
  },

  deleteBundle(ctx) {
    const id = String(ctx.get("manageBundles.selectedId") ?? "");
    const entry = findEntry(id);
    if (!entry) return { outcome: "not-found", ops: [setOp("manageBundles.editor.error", "Select a local bundle to delete.")] };
    if (entry.readonly) return { outcome: "readonly", ops: [setOp("manageBundles.editor.error", "Repository bundles cannot be deleted.")] };
    const stored = readStoredBundleMap();
    delete stored.bundles[id];
    writeStoredBundleMap(stored.bundles);
    const catalog = loadCatalog();
    return {
      outcome: "deleted",
      ops: [
        ...catalogOps(catalog.entries, catalog.errors),
        setOp("manageBundles.selectedId", ""),
        setOp("manageBundles.selected", { id: "", source: "", readonly: true, version: "", namespaces: "", capabilityCount: 0, nativeDependencies: "" }),
        setOp("manageBundles.editor", { id: "", bundleText: "", status: `Deleted local bundle ${id}.`, error: "" }),
        setOp("manageBundles.validation", { valid: false, previewable: false, summary: "Not validated.", errors: "", warnings: "" }),
        setOp("manageBundles.previewBundle", null),
        setOp("manageBundles.previewError", ""),
        setOp("manageBundles.deleteChallenge", { open: false, message: "" }),
      ],
    };
  },
};

export const manageBundlesStorageKey = LOCAL_BUNDLE_STORAGE_KEY;
