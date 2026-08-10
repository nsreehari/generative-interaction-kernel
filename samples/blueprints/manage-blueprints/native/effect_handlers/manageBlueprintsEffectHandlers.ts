import type { Json } from "@gik/kernel";
import { parseBlueprintJson, resolveBlueprintExecution, type BlueprintArtifact } from "@gik/blueprint";
import { setOp, type EffectContext, type EffectHandlerMap } from "@gik/react";
import {
  readUserBlueprintArtifacts,
  writeUserBlueprintArtifacts,
} from "../../../../shared/blueprint-catalog";
import { getSampleBlueprintCatalog, installUserBlueprints } from "../../../../shared/blueprints";

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

async function readStoredBlueprintMap(): Promise<{ blueprints: Record<string, BlueprintArtifact>; errors: string[] }> {
  return readUserBlueprintArtifacts();
}

async function writeStoredBlueprintMap(blueprints: Record<string, BlueprintArtifact>): Promise<void> {
  await writeUserBlueprintArtifacts(blueprints);
  installUserBlueprints(blueprints);
}

function repositoryEntries(): CatalogEntry[] {
  return Object.entries(getSampleBlueprintCatalog().seedEntries).flatMap(([id, value]) => {
    try {
      return [{ id, source: "repo" as const, readonly: true, blueprint: normalizeBlueprint(value) }];
    } catch {
      return [];
    }
  }).sort((left, right) => left.id.localeCompare(right.id));
}

async function loadCatalog(): Promise<{ entries: CatalogEntry[]; errors: string[] }> {
  const stored = await readStoredBlueprintMap();
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

function blueprintDetails(blueprint: BlueprintArtifact): JsonRecord {
  let previewable = false;
  try {
    previewable = resolveBlueprintExecution(blueprint).stages.length === 0
      && Object.keys(blueprint.payload.cells ?? {}).length > 0
      && (blueprint.payload.projections?.presentation?.roots.length ?? 0) === 1;
  } catch {
    previewable = false;
  }
  return {
    tabs: [
      { value: "overview", label: "Overview" },
      { value: "draft", label: "JSON" },
      ...(previewable ? [{ value: "preview", label: "Preview" }] : []),
    ],
  };
}

function catalogRows(entries: CatalogEntry[]): Json[] {
  return entries.map((entry) => {
    const payload = entry.blueprint.payload;
    const metadata = payload.metadata as JsonRecord | undefined;
    const declaredScope = metadata?.scope;
    const scope = declaredScope === "backend" || declaredScope === "middleware" || declaredScope === "frontend"
      ? declaredScope
      : entry.source === "repo" ? "frontend" : "custom";
    return {
      id: entry.id,
      label: entry.id,
      source: entry.source,
      sourceLabel: entry.readonly ? "Built-in" : "User",
      scope,
      scopeLabel: scope === "backend" ? "Backend" : scope === "middleware" ? "Middleware" : scope === "frontend" ? "Frontend" : "Custom",
      readonly: entry.readonly,
      detail: String(payload.version ?? "Unknown version"),
    } as Json;
  });
}

function selectedState(entry: CatalogEntry): JsonRecord {
  const payload = entry.blueprint.payload;
  return {
    id: entry.id,
    source: entry.source,
    sourceLabel: entry.readonly ? "Built-in" : "User",
    readonly: entry.readonly,
    version: payload.version,
    structureMode: payload.structureMode ?? "fixed",
    tiers: payload.tiers.map((tier) => tier.id).join(", "),
    recipeCount: payload.recipes.length,
    ...blueprintDetails(entry.blueprint),
  };
}

function editorState(entry: CatalogEntry): JsonRecord {
  return {
    id: entry.id,
    blueprintText: JSON.stringify(entry.blueprint, null, 2),
    formValue: { id: entry.id, blueprint: entry.blueprint as unknown as Json },
    persisted: true,
    status: entry.readonly
      ? "Built-in Blueprint is read-only. Use Clone to edit to create your own copy."
      : "Your Blueprint is ready to edit.",
    error: "",
  };
}

function catalogOps(entries: CatalogEntry[], errors: string[]) {
  return [
    setOp("manageBlueprints.blueprints", catalogRows(entries)),
    setOp(
      "manageBlueprints.catalogStatus",
      errors.length > 0
        ? `${entries.length} Blueprints loaded; ${errors.length} user Blueprint error(s).`
        : `${entries.length} Blueprints loaded. Built-ins are read-only; your copies are editable.`
    ),
  ];
}

async function findEntry(id: string): Promise<CatalogEntry | undefined> {
  return (await loadCatalog()).entries.find((entry) => entry.id === id);
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

async function nextLocalId(baseId: string): Promise<string> {
  const ids = new Set((await loadCatalog()).entries.map((entry) => entry.id));
  const base = `${baseId.replace(/-local(?:-\d+)?$/, "")}-local`;
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

async function importedId(fileName: string): Promise<string> {
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
    setOp("manageBlueprints.selectedId", ""),
    setOp("manageBlueprints.selected", {
      id,
      source: "local",
      sourceLabel: "User draft",
      readonly: false,
      version: identified.payload.version,
      structureMode: identified.payload.structureMode ?? "fixed",
      tiers: identified.payload.tiers.map((tier) => tier.id).join(", "),
      recipeCount: identified.payload.recipes.length,
      ...blueprintDetails(identified),
    }),
    setOp("manageBlueprints.tab", "draft"),
    setOp("manageBlueprints.editor", {
      id,
      blueprintText: JSON.stringify(identified, null, 2),
      formValue: { id, blueprint: identified as unknown as Json },
      persisted: false,
      status,
      error: "",
    }),
    setOp("manageBlueprints.validation", validationState(result)),
    setOp("manageBlueprints.previewBlueprint", null),
    setOp("manageBlueprints.previewReference", ""),
    setOp("manageBlueprints.previewError", ""),
  ];
}

async function previewResult(ctx: EffectContext) {
  const result = parseEditor(ctx);
  if (!result.valid || !result.blueprint) {
    return { outcome: "invalid", ops: [setOp("manageBlueprints.validation", validationState(result)), setOp("manageBlueprints.previewError", result.errors)] };
  }
  const persisted = await findEntry(result.blueprint.payload.id);
  const reference = persisted && JSON.stringify(persisted.blueprint) === JSON.stringify(result.blueprint)
    ? `blueprint:${persisted.id}@${persisted.blueprint.payload.version}`
    : "";
  return {
    outcome: "summary-ready",
    ops: [
      setOp("manageBlueprints.validation", validationState(result)),
      setOp("manageBlueprints.previewBlueprint", result.blueprint as unknown as Json),
      setOp("manageBlueprints.previewReference", reference),
      setOp("manageBlueprints.inspection", inspectionState(result)),
      setOp("manageBlueprints.previewError", ""),
      setOp("manageBlueprints.tab", "preview"),
    ],
  };
}

export const manageBlueprintsEffects: EffectHandlerMap = {
  async listBlueprints() {
    const catalog = await loadCatalog();
    return { ops: catalogOps(catalog.entries, catalog.errors) };
  },

  async getBlueprint(ctx) {
    const id = String(Array.isArray(ctx.payload.values) ? ctx.payload.values[0] ?? "" : "");
    const entry = await findEntry(id);
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
        setOp("manageBlueprints.previewReference", ""),
        setOp("manageBlueprints.previewError", ""),
        setOp("manageBlueprints.tab", "overview"),
      ],
    };
  },

  async createBlueprint() {
    const blueprint = portableStarterBlueprint();
    const id = await nextLocalId("untitled-blueprint");
    return { outcome: "draft-created", ops: draftOps(id, blueprint, "New Blueprint. Save when you are ready.") };
  },

  async importBlueprint(ctx) {
    const candidate = ctx.payload.file;
    const file = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as JsonRecord
      : null;
    if (
      !file
      || typeof file.name !== "string"
      || typeof file.type !== "string"
      || typeof file.size !== "number"
      || !Number.isFinite(file.size)
      || typeof file.lastModified !== "number"
      || !Number.isFinite(file.lastModified)
      || file.encoding !== "text"
      || typeof file.text !== "string"
    ) {
      const message = "The selected file did not match the primitive:file-input normalized text contract.";
      return {
        outcome: "invalid",
        ops: [
          setOp("manageBlueprints.tab", "draft"),
          setOp("manageBlueprints.editor.error", message),
          setOp("manageBlueprints.validation", { valid: false, previewable: false, summary: "Blueprint file input is invalid.", errors: message, warnings: "" }),
        ],
      };
    }
    const fileName = file.name;
    const text = file.text;
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
    const id = await importedId(fileName);
    return { outcome: "draft-imported", ops: draftOps(id, result.blueprint, `Imported ${fileName}. Save to persist locally.`) };
  },

  async cloneBlueprint(ctx) {
    const selectedId = String(ctx.get("manageBlueprints.selectedId") ?? "");
    const entry = await findEntry(selectedId);
    if (!entry) {
      return { outcome: "not-found", ops: [setOp("manageBlueprints.editor.error", "Select a blueprint to clone.")] };
    }
    const id = await nextLocalId(entry.id);
    return { outcome: "draft-created", ops: draftOps(id, entry.blueprint, `Editable copy of ${entry.id}. Save when you are ready.`) };
  },

  async saveBlueprint(ctx) {
    const submitted = ctx.payload.values;
    const values = submitted && typeof submitted === "object" && !Array.isArray(submitted)
      ? submitted as JsonRecord
      : null;
    const id = String(values?.id ?? ctx.get("manageBlueprints.editor.id") ?? "").trim();
    if (!BUNDLE_ID_PATTERN.test(id)) {
      return { outcome: "invalid", ops: [setOp("manageBlueprints.editor.error", "Blueprint id must use lowercase kebab-case.")] };
    }
    if (repositoryEntries().some((entry) => entry.id === id)) {
      return { outcome: "readonly", ops: [setOp("manageBlueprints.editor.error", `Repository blueprint '${id}' is read-only. Choose a new local id.`)] };
    }
    const result = values ? validate(values.blueprint) : parseEditor(ctx);
    if (!result.valid || !result.blueprint) {
      return {
        outcome: "invalid",
        ops: [
          setOp("manageBlueprints.validation", validationState(result)),
          setOp("manageBlueprints.editor.error", result.errors),
        ],
      };
    }
    const stored = await readStoredBlueprintMap();
    const selectedId = String(ctx.get("manageBlueprints.selectedId") ?? "");
    const selected = await findEntry(selectedId);
    if (selected?.source === "local" && selectedId !== id) {
      delete stored.blueprints[selectedId];
    }
    const identified = withBlueprintId(result.blueprint, id);
    stored.blueprints[id] = identified;
    try {
      await writeStoredBlueprintMap(stored.blueprints);
    } catch (error) {
      return { outcome: "error", ops: [setOp("manageBlueprints.editor.error", error instanceof Error ? error.message : String(error))] };
    }
    const catalog = await loadCatalog();
    const entry = catalog.entries.find((candidate) => candidate.id === id)!;
    return {
      outcome: "saved",
      ops: [
        ...catalogOps(catalog.entries, catalog.errors),
        setOp("manageBlueprints.selectedId", id),
        setOp("manageBlueprints.selected", selectedState(entry)),
        setOp("manageBlueprints.editor", {
          id,
          blueprintText: JSON.stringify(identified, null, 2),
          formValue: { id, blueprint: identified as unknown as Json },
          persisted: true,
          status: `Saved ${id} in this browser.`,
          error: "",
        }),
        setOp("manageBlueprints.validation", validationState(result)),
      ],
    };
  },

  async selectBlueprintTab(ctx) {
    const tab = String(ctx.payload.value ?? "overview");
    if (tab === "preview") return previewResult(ctx);
    return { ops: [setOp("manageBlueprints.tab", tab)] };
  },

  async requestDeleteBlueprint(ctx) {
    const id = String(ctx.get("manageBlueprints.selectedId") ?? "");
    const entry = await findEntry(id);
    if (!entry) return { outcome: "not-found", ops: [setOp("manageBlueprints.editor.error", "Select a local blueprint to delete.")] };
    if (entry.readonly) return { outcome: "readonly", ops: [setOp("manageBlueprints.editor.error", "Built-in Blueprints cannot be deleted. Clone it to create an editable copy.")] };
    return {
      outcome: "confirmation-required",
      ops: [setOp("manageBlueprints.deleteChallenge", { open: true, message: `Delete local blueprint '${id}'? This cannot be undone.` })],
    };
  },

  cancelDeleteBlueprint() {
    return { outcome: "cancelled", ops: [setOp("manageBlueprints.deleteChallenge", { open: false, message: "" })] };
  },

  async deleteBlueprint(ctx) {
    const id = String(ctx.get("manageBlueprints.selectedId") ?? "");
    const entry = await findEntry(id);
    if (!entry) return { outcome: "not-found", ops: [setOp("manageBlueprints.editor.error", "Select a local blueprint to delete.")] };
    if (entry.readonly) return { outcome: "readonly", ops: [setOp("manageBlueprints.editor.error", "Built-in Blueprints cannot be deleted. Clone it to create an editable copy.")] };
    const stored = await readStoredBlueprintMap();
    delete stored.blueprints[id];
    await writeStoredBlueprintMap(stored.blueprints);
    const catalog = await loadCatalog();
    return {
      outcome: "deleted",
      ops: [
        ...catalogOps(catalog.entries, catalog.errors),
        setOp("manageBlueprints.selectedId", ""),
        setOp("manageBlueprints.selected", { id: "", source: "", sourceLabel: "", readonly: true, version: "", structureMode: "fixed", tiers: "", recipeCount: 0 }),
        setOp("manageBlueprints.editor", { id: "", blueprintText: "", formValue: {}, persisted: true, status: `Deleted local blueprint ${id}.`, error: "" }),
        setOp("manageBlueprints.validation", { valid: false, previewable: false, summary: "Not validated.", errors: "", warnings: "" }),
        setOp("manageBlueprints.previewBlueprint", null),
        setOp("manageBlueprints.previewReference", ""),
        setOp("manageBlueprints.previewError", ""),
        setOp("manageBlueprints.deleteChallenge", { open: false, message: "" }),
      ],
    };
  },
};

export default manageBlueprintsEffects;
