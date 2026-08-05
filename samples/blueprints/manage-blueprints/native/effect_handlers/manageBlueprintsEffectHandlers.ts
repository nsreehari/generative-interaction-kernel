import type { Json } from "@gik/kernel";
import { parseBlueprintJson, resolveBlueprintExecution, type BlueprintArtifact } from "@gik/blueprint";
import { setOp, type EffectContext, type EffectHandlerMap } from "@gik/react";
import { sampleBlueprints } from "../../../../shared/blueprints";
import {
  createLocalBlueprintArtifactStore,
  localBlueprintArtifactStorageKey,
} from "../../../../shared/local-blueprint-artifact-store";

const BUNDLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type JsonRecord = Record<string, Json>;
type BlueprintSource = "repo" | "local";

type CatalogEntry = {
  id: string;
  source: BlueprintSource;
  readonly: boolean;
  blueprint: BlueprintArtifact;
};

type ValidationResult = {
  valid: boolean;
  previewable: boolean;
  summary: string;
  errors: string;
  warnings: string;
  blueprint: BlueprintArtifact | null;
  inspection: JsonRecord | null;
};

function normalizeBlueprint(value: unknown): BlueprintArtifact {
  return parseBlueprintJson(JSON.stringify(value));
}

function readStoredBlueprintMap(): { blueprints: Record<string, BlueprintArtifact>; errors: string[] } {
  return createLocalBlueprintArtifactStore().read();
}

function writeStoredBlueprintMap(blueprints: Record<string, BlueprintArtifact>): void {
  createLocalBlueprintArtifactStore().write(blueprints);
}

function repositoryEntries(): CatalogEntry[] {
  return Object.entries(sampleBlueprints).flatMap(([id, value]) => {
    try {
      return [{ id, source: "repo" as const, readonly: true, blueprint: normalizeBlueprint(value) }];
    } catch {
      return [];
    }
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function loadCatalog(): { entries: CatalogEntry[]; errors: string[] } {
  const stored = readStoredBlueprintMap();
  const localEntries = Object.entries(stored.blueprints).map(([id, blueprint]) => ({
    id,
    source: "local" as const,
    readonly: false,
    blueprint,
  }));
  return {
    entries: [...repositoryEntries(), ...localEntries].sort((left, right) => left.id.localeCompare(right.id)),
    errors: stored.errors,
  };
}

function validate(value: unknown): ValidationResult {
  try {
    const blueprint = normalizeBlueprint(value);
    const resolved = resolveBlueprintExecution(blueprint);
    return {
      valid: true,
      previewable: true,
      summary: "Blueprint JSON is structurally and semantically valid.",
      errors: "",
      warnings: "",
      blueprint,
      inspection: {
        tiers: blueprint.payload.tiers.map((tier) => ({
          id: tier.id,
          kind: tier.kind,
          description: tier.description ?? "",
        })),
        recipes: resolved.stages.map((stage, index) => ({
          order: index + 1,
          id: stage.recipe.id,
          from: stage.fromTier.id,
          to: stage.toTier.id,
        })),
        terminalTier: resolved.stages.at(-1)?.toTier.id ?? blueprint.payload.tiers[0]?.id ?? "",
        executionStatus: resolved.stages.length > 0 ? "lowering-required" : "runtime-ready",
        executionReason: resolved.stages.length > 0
          ? "This authored Blueprint requires a dialect-owned lowering implementation before runtime execution."
          : "This Blueprint contains a terminal runtime definition.",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      previewable: false,
      summary: "Blueprint JSON is invalid.",
      errors: message,
      warnings: "",
      blueprint: null,
      inspection: null,
    };
  }
}

function parseEditor(ctx: EffectContext): ValidationResult {
  const text = String(ctx.get("manageBlueprints.editor.blueprintText") ?? "");
  try {
    return validate(JSON.parse(text));
  } catch (error) {
    return {
      valid: false,
      previewable: false,
      summary: "Blueprint JSON is invalid.",
      errors: error instanceof Error ? error.message : String(error),
      warnings: "",
      blueprint: null,
      inspection: null,
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

function inspectionState(result: ValidationResult): Json {
  return result.inspection ?? { tiers: [], recipes: [], terminalTier: "", executionStatus: "invalid", executionReason: "" };
}

function catalogRows(entries: CatalogEntry[]): Json[] {
  return entries.map((entry) => {
    const payload = entry.blueprint.payload;
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
  const payload = entry.blueprint.payload;
  return {
    id: entry.id,
    source: entry.source,
    readonly: entry.readonly,
    version: payload.version,
    structureMode: payload.structureMode ?? "fixed",
    tiers: payload.tiers.map((tier) => tier.id).join(", "),
    recipeCount: payload.recipes.length,
  };
}

function editorState(entry: CatalogEntry): JsonRecord {
  return {
    id: entry.id,
    blueprintText: JSON.stringify(entry.blueprint, null, 2),
    status: entry.readonly
      ? "Repository blueprint is read-only. Clone it to create a browser-local draft."
      : "Browser-local blueprint loaded and editable.",
    error: "",
  };
}

function catalogOps(entries: CatalogEntry[], errors: string[]) {
  return [
    setOp("manageBlueprints.blueprints", catalogRows(entries)),
    setOp(
      "manageBlueprints.catalogStatus",
      errors.length > 0
        ? `${entries.length} blueprints loaded; ${errors.length} local artifact error(s).`
        : `${entries.length} blueprints loaded: repository artifacts are read-only, local artifacts are editable.`
    ),
  ];
}

function findEntry(id: string): CatalogEntry | undefined {
  return loadCatalog().entries.find((entry) => entry.id === id);
}

function portableStarterBlueprint(): BlueprintArtifact {
  return normalizeBlueprint({
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "untitled-blueprint-local",
      kind: "runtime-blueprint",
      version: "1.0.0",
      structureMode: "fixed",
      tiers: [{ id: "runtime-document", kind: "runtime-document" }],
      recipes: [],
      runtime: { version: "local-blueprint/1.0", capabilities: {}, state: {} },
    },
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
    .replace(/\.blueprint\.json$/i, "")
    .replace(/\.json$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return nextLocalId(base || "imported-blueprint");
}

function withBlueprintId(blueprint: BlueprintArtifact, id: string): BlueprintArtifact {
  return normalizeBlueprint({ ...blueprint, payload: { ...blueprint.payload, id } });
}

function draftOps(id: string, blueprint: BlueprintArtifact, status: string) {
  const identified = withBlueprintId(blueprint, id);
  const result = validate(identified);
  return [
    setOp("manageBlueprints.tab", "draft"),
    setOp("manageBlueprints.editor", { id, blueprintText: JSON.stringify(identified, null, 2), status, error: "" }),
    setOp("manageBlueprints.validation", validationState(result)),
    setOp("manageBlueprints.previewBlueprint", null),
    setOp("manageBlueprints.previewError", ""),
  ];
}

export const manageBlueprintsEffects: EffectHandlerMap = {
  $init() {
    const catalog = loadCatalog();
    return { ops: catalogOps(catalog.entries, catalog.errors) };
  },

  listBlueprints() {
    const catalog = loadCatalog();
    return { ops: catalogOps(catalog.entries, catalog.errors) };
  },

  getBlueprint(ctx) {
    const id = String(ctx.payload.id ?? "");
    const entry = findEntry(id);
    if (!entry) {
      return { outcome: "not-found", ops: [setOp("manageBlueprints.editor.error", `Blueprint '${id}' was not found.`)] };
    }
    const result = validate(entry.blueprint);
    return {
      outcome: "loaded",
      ops: [
        setOp("manageBlueprints.selectedId", id),
        setOp("manageBlueprints.selected", selectedState(entry)),
        setOp("manageBlueprints.editor", editorState(entry)),
        setOp("manageBlueprints.validation", validationState(result)),
        setOp("manageBlueprints.inspection", inspectionState(result)),
        setOp("manageBlueprints.previewBlueprint", null),
        setOp("manageBlueprints.previewError", ""),
        setOp("manageBlueprints.tab", "overview"),
      ],
    };
  },

  createBlueprint() {
    const blueprint = portableStarterBlueprint();
    const id = nextLocalId("untitled-blueprint");
    return { outcome: "draft-created", ops: draftOps(id, blueprint, "New browser-local blueprint draft.") };
  },

  importBlueprint(ctx) {
    const fileName = String(ctx.payload.name ?? "imported-blueprint.json");
    const text = String(ctx.payload.text ?? "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        outcome: "invalid",
        ops: [
          setOp("manageBlueprints.tab", "draft"),
          setOp("manageBlueprints.editor.error", message),
          setOp("manageBlueprints.validation", { valid: false, previewable: false, summary: "Blueprint JSON is invalid.", errors: message, warnings: "" }),
        ],
      };
    }
    const result = validate(parsed);
    if (!result.valid || !result.blueprint) {
      return {
        outcome: "invalid",
        ops: [
          setOp("manageBlueprints.tab", "draft"),
          setOp("manageBlueprints.editor.error", result.errors),
          setOp("manageBlueprints.validation", validationState(result)),
        ],
      };
    }
    const id = importedId(fileName);
    return { outcome: "draft-imported", ops: draftOps(id, result.blueprint, `Imported ${fileName}. Save to persist locally.`) };
  },

  cloneBlueprint(ctx) {
    const selectedId = String(ctx.get("manageBlueprints.selectedId") ?? "");
    const entry = findEntry(selectedId);
    if (!entry) {
      return { outcome: "not-found", ops: [setOp("manageBlueprints.editor.error", "Select a blueprint to clone.")] };
    }
    const id = nextLocalId(entry.id);
    return { outcome: "draft-created", ops: draftOps(id, entry.blueprint, `New local draft cloned from ${entry.id}.`) };
  },

  saveBlueprint(ctx) {
    const id = String(ctx.get("manageBlueprints.editor.id") ?? "").trim();
    if (!BUNDLE_ID_PATTERN.test(id)) {
      return { outcome: "invalid", ops: [setOp("manageBlueprints.editor.error", "Blueprint id must use lowercase kebab-case.")] };
    }
    if (repositoryEntries().some((entry) => entry.id === id)) {
      return { outcome: "readonly", ops: [setOp("manageBlueprints.editor.error", `Repository blueprint '${id}' is read-only. Choose a new local id.`)] };
    }
    const result = parseEditor(ctx);
    if (!result.valid || !result.blueprint) {
      return {
        outcome: "invalid",
        ops: [
          setOp("manageBlueprints.validation", validationState(result)),
          setOp("manageBlueprints.editor.error", result.errors),
        ],
      };
    }
    const stored = readStoredBlueprintMap();
    const selectedId = String(ctx.get("manageBlueprints.selectedId") ?? "");
    const selected = findEntry(selectedId);
    if (selected?.source === "local" && selectedId !== id) {
      delete stored.blueprints[selectedId];
    }
    const identified = withBlueprintId(result.blueprint, id);
    stored.blueprints[id] = identified;
    try {
      writeStoredBlueprintMap(stored.blueprints);
    } catch (error) {
      return { outcome: "error", ops: [setOp("manageBlueprints.editor.error", error instanceof Error ? error.message : String(error))] };
    }
    const catalog = loadCatalog();
    const entry = catalog.entries.find((candidate) => candidate.id === id)!;
    return {
      outcome: "saved",
      ops: [
        ...catalogOps(catalog.entries, catalog.errors),
        setOp("manageBlueprints.selectedId", id),
        setOp("manageBlueprints.selected", selectedState(entry)),
        setOp("manageBlueprints.editor", { id, blueprintText: JSON.stringify(identified, null, 2), status: `Saved ${id} locally.`, error: "" }),
        setOp("manageBlueprints.validation", validationState(result)),
      ],
    };
  },

  validateBlueprint(ctx) {
    const result = parseEditor(ctx);
    return {
      outcome: result.valid ? "valid" : "invalid",
      ops: [
        setOp("manageBlueprints.validation", validationState(result)),
        setOp("manageBlueprints.editor.error", result.errors),
      ],
    };
  },

  previewBlueprint(ctx) {
    const result = parseEditor(ctx);
    if (!result.valid || !result.blueprint) {
      return { outcome: "invalid", ops: [setOp("manageBlueprints.validation", validationState(result)), setOp("manageBlueprints.previewError", result.errors)] };
    }
    return {
      outcome: "summary-ready",
      ops: [
        setOp("manageBlueprints.validation", validationState(result)),
        setOp("manageBlueprints.previewBlueprint", result.blueprint as unknown as Json),
        setOp("manageBlueprints.inspection", inspectionState(result)),
        setOp("manageBlueprints.previewError", ""),
        setOp("manageBlueprints.tab", "preview"),
      ],
    };
  },

  exportBlueprint(ctx) {
    const result = parseEditor(ctx);
    if (!result.valid || !result.blueprint) {
      return { outcome: "invalid", ops: [setOp("manageBlueprints.editor.error", result.errors)] };
    }
    const id = String(ctx.get("manageBlueprints.editor.id") ?? "blueprint").trim() || "blueprint";
    if (typeof document === "undefined" || typeof URL === "undefined") {
      return { outcome: "unavailable", ops: [setOp("manageBlueprints.editor.error", "Download is unavailable in this host.")] };
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.blueprint, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${id}.blueprint.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return { outcome: "exported", ops: [setOp("manageBlueprints.editor.status", `Exported ${anchor.download}.`), setOp("manageBlueprints.editor.error", "")] };
  },

  requestDeleteBlueprint(ctx) {
    const id = String(ctx.get("manageBlueprints.selectedId") ?? "");
    const entry = findEntry(id);
    if (!entry) return { outcome: "not-found", ops: [setOp("manageBlueprints.editor.error", "Select a local blueprint to delete.")] };
    if (entry.readonly) return { outcome: "readonly", ops: [setOp("manageBlueprints.editor.error", "Repository blueprints cannot be deleted.")] };
    return {
      outcome: "confirmation-required",
      ops: [setOp("manageBlueprints.deleteChallenge", { open: true, message: `Delete local blueprint '${id}'? This cannot be undone.` })],
    };
  },

  cancelDeleteBlueprint() {
    return { outcome: "cancelled", ops: [setOp("manageBlueprints.deleteChallenge", { open: false, message: "" })] };
  },

  deleteBlueprint(ctx) {
    const id = String(ctx.get("manageBlueprints.selectedId") ?? "");
    const entry = findEntry(id);
    if (!entry) return { outcome: "not-found", ops: [setOp("manageBlueprints.editor.error", "Select a local blueprint to delete.")] };
    if (entry.readonly) return { outcome: "readonly", ops: [setOp("manageBlueprints.editor.error", "Repository blueprints cannot be deleted.")] };
    const stored = readStoredBlueprintMap();
    delete stored.blueprints[id];
    writeStoredBlueprintMap(stored.blueprints);
    const catalog = loadCatalog();
    return {
      outcome: "deleted",
      ops: [
        ...catalogOps(catalog.entries, catalog.errors),
        setOp("manageBlueprints.selectedId", ""),
        setOp("manageBlueprints.selected", { id: "", source: "", readonly: true, version: "", structureMode: "fixed", tiers: "", recipeCount: 0 }),
        setOp("manageBlueprints.editor", { id: "", blueprintText: "", status: `Deleted local blueprint ${id}.`, error: "" }),
        setOp("manageBlueprints.validation", { valid: false, previewable: false, summary: "Not validated.", errors: "", warnings: "" }),
        setOp("manageBlueprints.previewBlueprint", null),
        setOp("manageBlueprints.previewError", ""),
        setOp("manageBlueprints.deleteChallenge", { open: false, message: "" }),
      ],
    };
  },
};

export const manageBlueprintsStorageKey = localBlueprintArtifactStorageKey;

export default manageBlueprintsEffects;
