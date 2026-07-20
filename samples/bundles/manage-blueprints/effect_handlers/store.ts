// The blueprint manager's domain: types, seed data, validation, and named effect handlers.
//
// Under the "everything is JSON" model the manager has no bespoke Orchestrator class. Its UI is a
// JSON document composed from shared primitives; its consequential operations are registered
// NATIVE effect handlers (create/save/validate/promote a profile) that the shared effect
// dispatcher routes `invoke("<name>")` to. Each handler reads the live store (the kernel applies
// reducer ops before effects run) and returns store deltas — the reducer stays pure. Only genuinely
// effectful/derived logic lives here in code; everything above it is data.

import type { CapabilityDescriptor, DocumentPayload, Enveloped, Json, ManifestPayload } from "@gik/kernel";
import {
  createProfileBundle,
  lintLoweringRecipe as lintLoweringRecipeArtifact,
  lintProfileArtifacts,
  loadProfileBundle,
  parseProfileBundleJson,
  isWorkflowToInteractionRecipe,
  planningRecipeOf,
  resolveNamedProfileTemplateFile,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
  runProfile,
  runtimeRecipeOf,
  stringifyProfileBundle,
  traceProfile,
  validateProfileArtifact,
  validateLoweringRecipeArtifact,
  type InteractionKind,
  type InteractionSpec,
  type InteractionTaxonomy,
  type LayerDefinition,
  type LayerRecipe,
  type PresentationContext,
  type ProfileArtifactBundle,
  type StageTrace,
} from "@gik/profile";
import { setOp, type EffectContext, type EffectHandlerMap, type SerializableBundle } from "@gik/react";
import { sampleProfileCatalog, type SampleProfileEntry } from "../../../catalog/profile-catalog";
import { demoDataFor } from "../../workbench/projection_views/bundles/demo";

export type ManageBlueprintsTab = "overview" | "layers" | "preview" | "draft";

interface PreviewInput {
  source: Record<string, unknown>;
  ctx: PresentationContext;
}

interface ValidationResult {
  status: "unknown" | "ok" | "error";
  // `level`/`summary` drive the ui:alert banner (level maps to its good/warn/error/unknown badge tone).
  level: "good" | "warn" | "error" | "unknown";
  summary: string;
  errors: string[];
  warnings: string[];
  errorsText: string;
  warningsText: string;
}

type ProfileSource = "repo" | "local";

interface CatalogEntry extends SampleProfileEntry {
  source: ProfileSource;
  readonly: boolean;
  bundle: ProfileArtifactBundle<LayerRecipe>;
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

type LayerVocabularySource = "outgoingPlanning" | "incomingPlanning" | "incomingRuntime";

type RuleMatchValuesVocabularyGroup = {
  id: string;
  label: string;
  note: string;
  kind: "rule-match-values";
  slot: string;
  field: string;
};

type RuleMatchKeysVocabularyGroup = {
  id: string;
  label: string;
  note: string;
  kind: "rule-match-keys";
  slot: string;
  exclude?: readonly string[];
};

type RuleEmitValuesVocabularyGroup = {
  id: string;
  label: string;
  note: string;
  kind: "rule-emit-values";
  slots: readonly string[];
  field: string;
};

type LayerVocabularyGroupConfig =
  | RuleMatchValuesVocabularyGroup
  | RuleMatchKeysVocabularyGroup
  | RuleEmitValuesVocabularyGroup;

type LayerVocabularyRuleConfig = {
  match: { source: LayerVocabularySource; layerKind?: string };
  groups: readonly LayerVocabularyGroupConfig[];
};

type LayerVocabularyConfig = {
  rules: readonly LayerVocabularyRuleConfig[];
};

type VocabularyProgramRule = {
  slot?: string;
  match?: Record<string, unknown>;
  emit?: Record<string, unknown>;
};

type VocabularyProgram = {
  program: readonly VocabularyProgramRule[];
};

type LayerPositionName = "source" | "intermediate" | "terminal" | "unknown";

type LayerPositionInspectorConfig = {
  label: string;
  role: string;
};

type SampleSeedConfig = {
  match?: { sourceKind?: string };
  kind: "workflow-rules" | "planning-match-values";
  slot: string;
  matchField: string;
  payloadField: string;
  labelPrefix?: string;
};

type RecipeRulePathConfig = {
  kind: "mapping-when" | "path";
  path?: string;
};

type RecipeRegionRulesConfig = {
  fromLabel: string;
  toLabel: string;
  slots: readonly string[];
  from: RecipeRulePathConfig;
  to: { path: string };
};

type RecipeContainerCapabilityConfig = {
  slot: string;
  path: string;
};

type RecipeViewConfig = {
  match: { family: "workflow" | "planning" | "runtime" };
  kind: string;
  kindLabel: string;
  tagline: string;
  purpose: string;
  regionRules: RecipeRegionRulesConfig;
  containerCapability?: RecipeContainerCapabilityConfig;
};

type ManageBlueprintsInspectorConfig = {
  layerPositions: Record<LayerPositionName, LayerPositionInspectorConfig>;
  stageLabelTemplate?: string;
  sampleSeeds: readonly SampleSeedConfig[];
  recipeViews: readonly RecipeViewConfig[];
};

type BlueprintSeed = {
  id: string;
  label: string;
  payload: Record<string, unknown>;
};

const LOCAL_PROFILE_STORAGE_KEY = "gik.manage-blueprints.profileBundles.v1";
const LEGACY_PROFILE_STORAGE_KEY = "gik.console.profileBundles.v1";
const PREVIEW_SURFACES = ["desktop", "web", "mobile", "copilot", "teams"] as const;
const DEFAULT_PREVIEW_CONTEXT_FORM: Record<string, Json> = {
  properties: {
    surface: {
      title: "Surface",
      default: "desktop",
      enum: [...PREVIEW_SURFACES],
    },
  },
  required: ["surface"],
};
const DEFAULT_PREVIEW_CONTEXT: PresentationContext = {
  surface: "desktop",
};

const PREVIEW_CAPABILITIES: Record<string, CapabilityDescriptor> = {
  "ui:board": {
    propsSchema: { type: "object", additionalProperties: true },
    slots: ["children"],
  },
  "ui:panel": {
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
  "ui:timeline": {
    propsSchema: { type: "object", additionalProperties: true },
    dataProp: "items",
  },
  "ui:stats": {
    propsSchema: { type: "object", additionalProperties: true },
    dataProp: "items",
  },
  "ui:diff": {
    propsSchema: { type: "object", additionalProperties: true },
  },
  "ui:form": {
    propsSchema: { type: "object", additionalProperties: true },
    emits: ["save"],
  },
  "ui:editable-table": {
    propsSchema: { type: "object", additionalProperties: true },
    emits: ["save"],
    dataProp: "rows",
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
  layerCount: 0,
  recipeCount: 0,
  summary: "",
  legend: "",
};

const EMPTY_PIPELINE = {
  nodes: [],
};

const EMPTY_LAYER_DETAIL = {
  id: "",
  kind: "",
  schema: "",
  description: "",
  role: "",
  stageLabel: "",
  seeds: [] as string[],
  vocabulary: { groups: [] as Array<{ id: string; label: string; note: string; terms: string[] }> },
  loweringExamples: {
    columns: [] as Array<{ key: string; label: string }>,
    rows: [] as Array<{ id: string; input: string; context: string; output: string }>,
  },
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
};

const EMPTY_RECIPE_DETAIL = {
  id: "",
  kind: "",
  kindLabel: "",
  purpose: "",
  tagline: "",
  from: "",
  to: "",
  summary: "",
  constrainedWhenText: "",
  containerCapability: "",
  fallbackCapability: "",
  fromLayer: { ...EMPTY_LAYER_DETAIL },
  toLayer: { ...EMPTY_LAYER_DETAIL },
  regionRuleFromLabel: "",
  regionRuleToLabel: "",
  regionRuleMappings: [] as Array<{ id: string; from: string; to: string }>,
  ruleGroups: [],
  templates: [],
  templateMappings: [],
  regionMappings: [],
  capabilityMappings: [],
  runtimeRules: [],
  runtimeCapabilities: [],
};

const EMPTY_EDITOR: EditableProfileState = {
  id: "",
  bundleText: "",
  status: "Select a blueprint, or create a local draft to start editing.",
  error: "",
};

const EMPTY_VALIDATION: ValidationResult = {
  status: "unknown",
  level: "unknown",
  summary: "Not validated yet.",
  errors: [],
  warnings: [],
  errorsText: "Select a blueprint to validate.",
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
  return readStr(ctx, "manageBlueprints.selectedId");
}

function readTab(ctx: EffectContext): ManageBlueprintsTab {
  const value = readStr(ctx, "manageBlueprints.tab", "overview");
  return value === "overview" || value === "layers" || value === "preview" || value === "draft"
    ? value
    : "overview";
}

function readSelectedLayerId(ctx: EffectContext): string {
  return readStr(ctx, "manageBlueprints.selectedLayerId");
}

function readSelectedRecipeId(ctx: EffectContext): string {
  return readStr(ctx, "manageBlueprints.selectedRecipeId");
}

function readSourceInput(ctx: EffectContext): Record<string, unknown> {
  const raw = ctx.get("manageBlueprints.sourceInput");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function readPreviewContextValues(ctx: EffectContext): Record<string, unknown> {
  const raw = ctx.get("manageBlueprints.previewContext");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function readPreviewData(values: Record<string, unknown>): Record<string, string> | undefined {
  const raw = values.data;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw as object).length > 0) {
    return raw as Record<string, string>;
  }
  return undefined;
}

function previewContextFromValues(values: Record<string, unknown>): PresentationContext {
  return {
    ...values,
    surface: typeof values.surface === "string" && values.surface ? values.surface : "desktop",
  };
}

function previewInputFromValues(source: Record<string, unknown>, ctx: Record<string, unknown>): PreviewInput {
  const normalized = { ...source };
  const data = readPreviewData(source);
  if (data) normalized.data = data;
  return {
    source: normalized,
    ctx: previewContextFromValues(ctx),
  };
}

function readPreviewInput(ctx: EffectContext): PreviewInput {
  return previewInputFromValues(readSourceInput(ctx), readPreviewContextValues(ctx));
}

function sourceLayerId(entry: CatalogEntry | SampleProfileEntry): string {
  const sourceLayerId = entry.profile.stages[0]?.fromLayer.id ?? entry.artifact.payload.layers[0]?.id;
  return sourceLayerId ?? "";
}

function sourceLayer(entry: CatalogEntry | SampleProfileEntry): LayerDefinition | undefined {
  const layerId = sourceLayerId(entry);
  return layerId ? entry.profile.layersById[layerId] : undefined;
}

function sourceLayerKind(entry: CatalogEntry | SampleProfileEntry): string {
  return sourceLayer(entry)?.kind ?? "";
}

function sourceInputFormFor(entry: CatalogEntry): Record<string, unknown> {
  const layer = sourceLayer(entry);
  const input = layer?.input;
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : { properties: {} };
}

function formDefaults(form: Record<string, unknown>): Record<string, unknown> {
  const props = (form.properties ?? {}) as Record<string, Record<string, unknown>>;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(props)) {
    if (field && field.default !== undefined) out[key] = field.default;
  }
  return out;
}

function sourceInputDefaults(entry: CatalogEntry): Record<string, unknown> {
  return formDefaults(sourceInputFormFor(entry));
}

function previewContextFormFor(entry: CatalogEntry): Record<string, unknown> {
  const declared = entry.artifact.payload.context;
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) {
    return DEFAULT_PREVIEW_CONTEXT_FORM;
  }

  const declaredRecord = declared as Record<string, unknown>;
  const declaredRequired = Array.isArray(declaredRecord.required) ? (declaredRecord.required as string[]) : [];
  const required = new Set<string>(["surface", ...declaredRequired]);

  return {
    ...declaredRecord,
    properties: {
      ...((DEFAULT_PREVIEW_CONTEXT_FORM.properties ?? {}) as Record<string, unknown>),
      ...((declaredRecord.properties ?? {}) as Record<string, unknown>),
    },
    required: [...required],
  };
}

function previewContextDefaults(entry: CatalogEntry): Record<string, unknown> {
  return {
    ...DEFAULT_PREVIEW_CONTEXT,
    ...formDefaults(previewContextFormFor(entry)),
  };
}

function isInteractionLikeSource(entry: CatalogEntry | SampleProfileEntry): boolean {
  return sourceLayerKind(entry).includes("interaction");
}

function interactionPreviewSeed(
  values: Record<string, unknown>,
  taxonomy: InteractionTaxonomy
): InteractionSpec {
  const interaction = typeof values.interaction === "string" && values.interaction ? values.interaction : "investigate";
  const subject = typeof values.subject === "string" && values.subject ? values.subject : "incident";
  const base: InteractionSpec = {
    interaction: interaction as InteractionKind,
    subject,
  };
  const data = readPreviewData(values) ?? demoDataFor(base, taxonomy);
  if (interaction === "configure") {
    return {
      ...base,
      data: {
        ...data,
        settings: "fetched_sources.orders",
      },
      facetViews: {
        settings: {
          capability: "ui:editable-table",
          read: { rows: "{{region.dataPath}}" },
          props: {
            spec: {
              columns: ["id", "amount"],
              addRow: false,
              deleteRow: false,
            },
          },
        },
      },
    };
  }

  return { ...base, data };
}

function catalogRows(entries: readonly CatalogEntry[]) {
  return entries.map((entry) => ({
    id: entry.artifact.payload.id,
    kind: entry.artifact.payload.kind,
    version: entry.artifact.payload.version,
    layers: Object.keys(entry.profile.layersById).length,
    recipes: entry.profile.stages.length,
    source: entry.source,
    readonly: entry.readonly,
    access: entry.readonly ? "read-only" : "editable",
  }));
}

function findEntry(id: string, entries: readonly CatalogEntry[]): CatalogEntry | undefined {
  return entries.find((entry) => entry.artifact.payload.id === id);
}

function profileStorage(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  return globalThis.localStorage ?? null;
}

function readStoredBundleMap(): { bundles: Record<string, ProfileArtifactBundle<LayerRecipe>>; errors: string[] } {
  const storage = profileStorage();
  if (!storage) return { bundles: {}, errors: [] };

  const currentRaw = storage.getItem(LOCAL_PROFILE_STORAGE_KEY);
  const legacyRaw = currentRaw ? null : storage.getItem(LEGACY_PROFILE_STORAGE_KEY);
  const raw = currentRaw ?? legacyRaw;
  if (!raw) return { bundles: {}, errors: [] };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        bundles: {},
        errors: ["Local blueprint storage was ignored because it is not a JSON object."],
      };
    }

    const bundles: Record<string, ProfileArtifactBundle<LayerRecipe>> = {};
    const errors: string[] = [];
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      try {
        const bundle = parseProfileBundleJson<LayerRecipe>(JSON.stringify(value));
        bundles[id] = normalizeBundleId(bundle, id);
      } catch (error) {
        errors.push(`Skipped stored profile '${id}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!currentRaw && legacyRaw) {
      try {
        storage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(bundles));
      } catch (error) {
        errors.push(`Loaded legacy blueprints but could not migrate them: ${error instanceof Error ? error.message : String(error)}`);
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

function writeStoredBundleMap(bundles: Record<string, ProfileArtifactBundle<LayerRecipe>>): void {
  const storage = profileStorage();
  if (!storage) {
    throw new Error("Browser localStorage is unavailable in this host.");
  }
  storage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(bundles));
}

function normalizeBundleId(bundle: ProfileArtifactBundle<LayerRecipe>, id: string): ProfileArtifactBundle<LayerRecipe> {
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

function asCatalogEntry(bundle: ProfileArtifactBundle<LayerRecipe>, source: ProfileSource, readonly: boolean): CatalogEntry {
  return {
    artifact: bundle.profileArtifact,
    recipeArtifacts: bundle.recipeArtifacts,
    profile: loadProfileBundle<LayerRecipe>(bundle, resolveProfileTemplateResource, resolveProfileTemplate),
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
        ? "Read-only sample. Save with a local id to create an editable copy."
        : `Editing local draft '${entry.artifact.payload.id}'.`),
    error,
  };
}

function layerDetailView(layer: LayerDefinition | undefined) {
  return {
    id: layer?.id ?? "",
    kind: layer?.kind ?? "",
    schema: layer?.schema ?? "",
    description: layer?.description ?? "",
  };
}

function manageBlueprintsInspectorConfig(entry: CatalogEntry): ManageBlueprintsInspectorConfig {
  const templateId = profileTemplateId(entry);
  if (!templateId) {
    return {
      layerPositions: {
        source: { label: "Source tier", role: "The external input tier where the blueprint starts before any lowering rules run." },
        intermediate: { label: "Intermediate tier", role: "An internal stage in the lowering pipeline that reshapes the previous tier into a more concrete representation." },
        terminal: { label: "Terminal tier", role: "The final emitted tier after all lowering rules have run." },
        unknown: { label: "Pipeline stage", role: "A stage in this blueprint's lowering pipeline." },
      },
      stageLabelTemplate: "{label} · stage {index} of {total}",
      sampleSeeds: [],
      recipeViews: [],
    };
  }
  const template = resolveProfileTemplate(templateId);
  return resolveNamedProfileTemplateFile(template, "consoleInspector") as unknown as ManageBlueprintsInspectorConfig;
}

function emptyRecipeDetailState() {
  return {
    id: "",
    kind: "",
    kindLabel: "",
    purpose: "",
    tagline: "",
    from: "",
    to: "",
    summary: "",
    constrainedWhenText: "",
    containerCapability: "",
    fallbackCapability: "",
    fromLayer: layerDetailView(undefined),
    toLayer: layerDetailView(undefined),
    regionRuleFromLabel: "",
    regionRuleToLabel: "",
    regionRuleMappings: [] as Array<{ id: string; from: string; to: string }>,
    ruleGroups: [],
    templates: [],
    templateMappings: [],
    regionMappings: [],
    capabilityMappings: [],
    runtimeRules: [],
    runtimeCapabilities: [],
  };
}

function ruleMatchSummary(match: Record<string, unknown>): string {
  const entries = Object.entries(match ?? {});
  return entries.length === 0 ? "default" : entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

// A single, kind-agnostic view of a recipe's per-region rules: each rule as a `match -> emit` row,
// plus the human labels for the two columns. This is the one place that knows the shape of each
// recipe kind, so the UI can render "how each region is handled" for ANY non-terminal layer without
// gating on a specific transition.
function recipeFamily(recipe: LayerRecipe): "workflow" | "planning" | "runtime" | "unknown" {
  if (isWorkflowToInteractionRecipe(recipe)) return "workflow";
  if (planningRecipeOf(recipe)) return "planning";
  if (runtimeRecipeOf(recipe)) return "runtime";
  return "unknown";
}

function recipeViewConfig(entry: CatalogEntry, recipe: LayerRecipe): RecipeViewConfig | undefined {
  const family = recipeFamily(recipe);
  if (family === "unknown") return undefined;
  return manageBlueprintsInspectorConfig(entry).recipeViews.find((config) => config.match.family === family);
}

function ruleDisplayValue(rule: VocabularyProgramRule, config: RecipeRulePathConfig): string {
  if (config.kind === "mapping-when") {
    return mappingWhen((rule.match ?? {}) as Record<string, unknown>);
  }
  return String(readPathValue(rule, config.path ?? "") ?? "");
}

function regionRuleView(entry: CatalogEntry, recipe: LayerRecipe): {
  fromLabel: string;
  toLabel: string;
  mappings: Array<{ id: string; from: string; to: string }>;
} {
  const view = recipeViewConfig(entry, recipe);
  if (!view) return { fromLabel: "When", toLabel: "Does", mappings: [] };

  const program =
    recipeFamily(recipe) === "workflow"
      ? ((recipe as unknown as VocabularyProgram).program ? (recipe as unknown as VocabularyProgram) : undefined)
      : ((planningRecipeOf(recipe) ?? runtimeRecipeOf(recipe)) as unknown as VocabularyProgram | undefined);
  if (!program) return { fromLabel: view.regionRules.fromLabel, toLabel: view.regionRules.toLabel, mappings: [] };

  const mappings = ruleMatches(program, view.regionRules.slots).map((rule, index) => ({
    id: `map-${index}`,
    from: ruleDisplayValue(rule, view.regionRules.from),
    to: String(readPathValue(rule, view.regionRules.to.path) ?? ""),
  }));
  return { fromLabel: view.regionRules.fromLabel, toLabel: view.regionRules.toLabel, mappings };
}

// Reads a rule's match condition as the left-hand side of a lowering mapping ("when …"). An empty
// match is the catch-all, shown as "Otherwise" so the row reads like a fallback branch.
function mappingWhen(match: Record<string, unknown> | undefined): string {
  const entries = Object.entries(match ?? {});
  return entries.length === 0 ? "Otherwise" : entries.map(([key, value]) => `${key} = ${String(value)}`).join(", ");
}

function recipeTypeLabel(recipe: LayerRecipe): string {
  return `${recipe.from} -> ${recipe.to}`;
}

function pipelineState(entry: CatalogEntry) {
  const incomingByNode = new Map<string, Array<{ token: string; label?: string }>>();
  const outgoingByNode = new Map<string, Array<{ token: string; label?: string }>>();

  for (const ref of entry.artifact.payload.recipes) {
    const outgoing = outgoingByNode.get(ref.from) ?? [];
    outgoing.push({ token: ref.id });
    outgoingByNode.set(ref.from, outgoing);

    const incoming = incomingByNode.get(ref.to) ?? [];
    incoming.push({ token: ref.id });
    incomingByNode.set(ref.to, incoming);
  }

  return {
    nodes: entry.artifact.payload.layers.map((layer, index) => ({
      id: layer.id,
      label: layer.id,
      subtitle: layerRoleLabel(entry, layer.id),
      meta: layer.schema ?? `layer ${index + 1}`,
      description: layer.description ?? "",
      requires: incomingByNode.get(layer.id) ?? [],
      provides: outgoingByNode.get(layer.id) ?? [],
    })),
  };
}

function layerRows(entry: CatalogEntry) {
  return entry.artifact.payload.layers.map((layer) => ({
    id: layer.id,
    kind: layer.kind,
    roleLabel: layerRoleLabel(entry, layer.id),
    schema: layer.schema ?? "",
    description: layer.description ?? "",
  }));
}

function defaultLayerId(entry: CatalogEntry): string {
  return entry.artifact.payload.layers[0]?.id ?? "";
}

function resolveLayerId(entry: CatalogEntry, layerId?: string): string {
  const ids = new Set(entry.artifact.payload.layers.map((layer) => layer.id));
  return layerId && ids.has(layerId) ? layerId : defaultLayerId(entry);
}

function resolveRecipeId(entry: CatalogEntry, recipeId?: string): string {
  const ids = new Set(entry.artifact.payload.recipes.map((ref) => ref.id));
  return recipeId && ids.has(recipeId) ? recipeId : "";
}

function layerPosition(entry: CatalogEntry, layerId: string): LayerPositionName {
  const order = orderedLayerIds(entry);
  const index = order.indexOf(layerId);
  if (index < 0) return "unknown";
  if (index === 0) return "source";
  if (index === order.length - 1) return "terminal";
  return "intermediate";
}

function layerRole(entry: CatalogEntry, layerId: string): string {
  return manageBlueprintsInspectorConfig(entry).layerPositions[layerPosition(entry, layerId)].role;
}

function layerRoleLabel(entry: CatalogEntry, layerId: string): string {
  return manageBlueprintsInspectorConfig(entry).layerPositions[layerPosition(entry, layerId)].label;
}

function orderedLayerIds(entry: CatalogEntry): string[] {
  const stages = entry.profile.stages;
  if (stages.length > 0) {
    return [stages[0].fromLayer.id, ...stages.map((stage) => stage.toLayer.id)];
  }
  return entry.artifact.payload.layers.map((layer) => layer.id);
}

function layerStageLabel(entry: CatalogEntry, layerId: string): string {
  const order = orderedLayerIds(entry);
  const index = order.indexOf(layerId);
  const total = order.length;
  if (index < 0 || total === 0) return "";
  const positionLabel = layerRoleLabel(entry, layerId);
  const template = manageBlueprintsInspectorConfig(entry).stageLabelTemplate ?? "{label} · stage {index} of {total}";
  return template
    .replace("{label}", positionLabel)
    .replace("{index}", String(index + 1))
    .replace("{total}", String(total));
}

// Distinct, non-empty term list preserving first-seen order.
function distinctTerms(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const term = (value ?? "").trim();
    if (term && !seen.has(term)) {
      seen.add(term);
      out.push(term);
    }
  }
  return out;
}

function profileTemplateId(entry: CatalogEntry): string | undefined {
  const templateId = entry.artifact.payload["profile-template"];
  return typeof templateId === "string" && templateId.length > 0 ? templateId : undefined;
}

function layerVocabularyConfig(entry: CatalogEntry): LayerVocabularyConfig {
  const templateId = profileTemplateId(entry);
  if (!templateId) return { rules: [] };
  const template = resolveProfileTemplate(templateId);
  return resolveNamedProfileTemplateFile(template, "layerVocabulary") as unknown as LayerVocabularyConfig;
}

function readPathValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function collectVocabularyTerms(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectVocabularyTerms(item, out);
    return;
  }
  if (value != null && typeof value !== "object") {
    out.push(String(value));
  }
}

function configuredTerms(values: readonly unknown[], exclude: readonly string[] = []): string[] {
  const rawTerms: string[] = [];
  for (const value of values) collectVocabularyTerms(value, rawTerms);
  const excluded = new Set(exclude.map(String));
  return distinctTerms(rawTerms.filter((term) => !excluded.has(term)));
}

function defaultSeedPayload(entry: CatalogEntry): Record<string, unknown> {
  return sourceInputDefaults(entry);
}

function seedSourceConfig(entry: CatalogEntry): SampleSeedConfig | undefined {
  const sourceLayer = entry.profile.stages[0]?.fromLayer ?? entry.artifact.payload.layers[0];
  return manageBlueprintsInspectorConfig(entry).sampleSeeds.find((config) => !config.match?.sourceKind || config.match.sourceKind === sourceLayer?.kind);
}

function profileSampleSeeds(entry: CatalogEntry): BlueprintSeed[] {
  const sourceConfig = seedSourceConfig(entry);
  if (!sourceConfig) return [];
  const defaults = defaultSeedPayload(entry);
  const firstStage = entry.profile.stages[0];
  if (!firstStage) return [];

  const addSeed = (labels: string[]) => distinctTerms(labels).map((label) => ({
    id: label,
    label,
    payload: { ...defaults, [sourceConfig.payloadField]: label },
  }));

  if (sourceConfig.kind === "workflow-rules") {
    const recipe = entry.profile.stages[0]?.recipe;
    if (!recipe || !isWorkflowToInteractionRecipe(recipe)) return [];
    const labels = recipe.program
      .filter((rule) => rule.slot === sourceConfig.slot)
      .map((rule) => String((rule.match as Record<string, unknown>)[sourceConfig.matchField] ?? ""));
    return addSeed(labels);
  }

  const planning = planningRecipeOf(firstStage.recipe);
  if (!planning) return [];
  const labels = planning.program
    .filter((rule) => rule.slot === sourceConfig.slot)
    .map((rule) => String((rule.match as Record<string, unknown>)[sourceConfig.matchField] ?? ""));
  return addSeed(labels);
}

function ruleMatches(program: VocabularyProgram, slots: readonly string[]): VocabularyProgramRule[] {
  const allowed = new Set(slots);
  return program.program.filter((rule) => typeof rule.slot === "string" && allowed.has(rule.slot));
}

function extractConfiguredVocabularyTerms(
  program: VocabularyProgram,
  group: LayerVocabularyGroupConfig
): string[] {
  if (group.kind === "rule-match-values") {
    return configuredTerms(
      ruleMatches(program, [group.slot]).map((rule) => readPathValue(rule.match ?? {}, group.field))
    );
  }

  if (group.kind === "rule-match-keys") {
    const excluded = new Set((group.exclude ?? []).map(String));
    return distinctTerms(
      ruleMatches(program, [group.slot]).flatMap((rule) =>
        Object.keys(rule.match ?? {}).filter((key) => !excluded.has(key))
      )
    );
  }

  return configuredTerms(
    ruleMatches(program, group.slots).map((rule) => readPathValue(rule.emit ?? {}, group.field))
  );
}

// The vocabulary panel is template-owned semantics over a generic layer graph: the console chooses
// the selected layer's adjacent lowering program (outgoing planning, incoming planning, or incoming
// runtime), then applies the template's declarative extraction rules to derive the terms it speaks.
function layerVocabulary(entry: CatalogEntry, layerId: string) {
  const layer = entry.artifact.payload.layers.find((candidate) => candidate.id === layerId);
  const groups: Array<{ id: string; label: string; note: string; terms: string[] }> = [];
  if (!layer) return { groups };

  const outgoingRef = entry.artifact.payload.recipes.find((candidate) => candidate.from === layerId);
  const incomingRef = entry.artifact.payload.recipes.find((candidate) => candidate.to === layerId);
  const outgoing = outgoingRef ? entry.profile.recipesById[outgoingRef.id] : undefined;
  const incoming = incomingRef ? entry.profile.recipesById[incomingRef.id] : undefined;
  const outgoingPlanning = outgoing ? planningRecipeOf(outgoing) : undefined;
  const incomingPlanning = incoming ? planningRecipeOf(incoming) : undefined;
  const incomingRuntime = incoming ? runtimeRecipeOf(incoming) : undefined;

  const config = layerVocabularyConfig(entry);
  const sources: Record<LayerVocabularySource, VocabularyProgram | undefined> = {
    outgoingPlanning: outgoingPlanning as VocabularyProgram | undefined,
    incomingPlanning: incomingPlanning as VocabularyProgram | undefined,
    incomingRuntime: incomingRuntime as VocabularyProgram | undefined,
  };

  const matchedRule = config.rules.find((rule) => {
    if (rule.match.layerKind && rule.match.layerKind !== layer.kind) return false;
    return !!sources[rule.match.source];
  });
  const sourceProgram = matchedRule ? sources[matchedRule.match.source] : undefined;
  if (!matchedRule || !sourceProgram) return { groups };

  for (const group of matchedRule.groups) {
    const terms = extractConfiguredVocabularyTerms(sourceProgram, group);
    if (terms.length > 0) {
      groups.push({ id: group.id, label: group.label, note: group.note, terms });
    }
  }

  return { groups };
}

// Representative context surfaces to vary in the worked examples. We run every surface and then
// collapse identical outcomes, so a row that reads "any surface" means context doesn't change that
// interaction's result, while a split into specific surfaces reveals exactly where context matters.
const EXAMPLE_SURFACES = ["desktop", "web", "mobile", "copilot", "teams"] as const;
const EXAMPLE_LIMIT = 10;

// A compact, shape-based summary of ANY stage value, so the worked-examples table can render the
// input and output of any layer transition without knowing which kind it is: a runtime document
// shows its root capability + the components it contains, a presentation spec shows its layout +
// regions, an interaction spec shows its goal.
function summarizeStageValue(value: unknown): string {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.root && typeof v.root === "object") {
      const root = v.root as { capability?: string; edges?: { children?: Array<{ capability?: string }> } };
      const children = (root.edges?.children ?? [])
        .map((child) => String(child.capability ?? ""))
        .filter(Boolean);
      return children.length ? `${root.capability} — ${children.join(", ")}` : String(root.capability ?? "");
    }
    if ("layout" in v && Array.isArray(v.regions)) {
      const regions = (v.regions as Array<{ name?: string }>)
        .map((region) => String(region.name ?? ""))
        .filter(Boolean);
      return regions.length ? `${v.layout} — ${regions.join(", ")}` : String(v.layout ?? "");
    }
    if (typeof v.interaction === "string") return v.interaction;
  }
  return String(value ?? "");
}

// Worked examples: the FIRST N real results of running this profile over sample inputs, read from
// the stage where THIS layer lowers into the next one. Each row is genuine engine output (via
// traceProfile), not an authored rule row — so it shows what the profile actually produces for a
// concrete input. Fully generic: it works for any layer that has an outgoing stage (interaction,
// presentation, or a future layer kind), and a terminal layer simply yields no rows.
function loweringExamples(entry: CatalogEntry, layerId: string) {
  const empty = {
    columns: [] as Array<{ key: string; label: string }>,
    rows: [] as Array<{ id: string; input: string; context: string; output: string }>,
  };
  const profile = entry.profile;
  // The stage where this layer lowers into the next one. Terminal layers have none.
  const stage = profile.stages.find((candidate) => candidate.fromLayer.id === layerId);
  if (!stage) return empty;

  const seeds = profileSampleSeeds(entry);
  if (seeds.length === 0) return empty;

  const columns = [
    { key: "input", label: `From ${stage.fromLayer.kind}` },
    { key: "context", label: "Context (surface)" },
    { key: "output", label: `→ ${stage.toLayer.kind}` },
  ];

  // Run every seed × surface, then group by identical (input, output) outcome so a row that reads
  // "any surface" means context doesn't change that result, while a split reveals where it does.
  const byOutcome = new Map<string, { surfaces: string[]; input: string; output: string }>();
  for (const seed of seeds) {
    for (const surface of EXAMPLE_SURFACES) {
      try {
        const trace: StageTrace[] = traceProfile(
          profile,
          seed.payload,
          { surface },
        );
        const step = trace.find((candidate) => candidate.fromLayerId === layerId);
        if (!step) continue;
        const input = summarizeStageValue(step.input);
        const output = summarizeStageValue(step.output);
        const key = `${input}|${output}`;
        const existing = byOutcome.get(key);
        if (existing) {
          if (surface && !existing.surfaces.includes(surface)) existing.surfaces.push(surface);
        } else {
          byOutcome.set(key, { surfaces: surface ? [surface] : [], input, output });
        }
      } catch {
        // Skip any seed the profile cannot resolve rather than failing the whole panel.
      }
    }
  }

  const rows: Array<{ id: string; input: string; context: string; output: string }> = [];
  for (const [key, outcome] of byOutcome) {
    if (rows.length >= EXAMPLE_LIMIT) break;
    rows.push({
      id: key,
      input: outcome.input,
      context: outcome.surfaces.length === EXAMPLE_SURFACES.length ? "any surface" : outcome.surfaces.join(", "),
      output: outcome.output,
    });
  }
  return { columns, rows };
}

function layerDetailState(entry: CatalogEntry, layerId: string) {
  const layer = entry.artifact.payload.layers.find((candidate) => candidate.id === layerId);
  const outgoingRef = entry.artifact.payload.recipes.find((candidate) => candidate.from === layerId);
  const incomingRef = entry.artifact.payload.recipes.find((candidate) => candidate.to === layerId);
  return {
    ...layerDetailView(layer),
    // Data-first: a layer's own `description` from the profile JSON wins; the kind-keyed sentence is
    // only a fallback for profiles that don't author one (and a generic line for unknown kinds).
    role: layer ? (layer.description?.trim() || layerRole(entry, layerId)) : "",
    stageLabel: layer ? layerStageLabel(entry, layerId) : "",
    seeds: layer ? profileSampleSeeds(entry) : [],
    vocabulary: layer ? layerVocabulary(entry, layerId) : { groups: [] },
    loweringExamples: layer ? loweringExamples(entry, layerId) : { columns: [], rows: [] },
    outgoingRecipe: outgoingRef ? recipeDetailState(entry, outgoingRef.id) : emptyRecipeDetailState(),
    incomingRecipe: incomingRef ? recipeDetailState(entry, incomingRef.id) : emptyRecipeDetailState(),
  };
}

function recipeSourceLayerId(entry: CatalogEntry, recipeId: string): string {
  return entry.artifact.payload.recipes.find((candidate) => candidate.id === recipeId)?.from ?? defaultLayerId(entry);
}

function runtimeCapabilityRows(recipe: LayerRecipe) {
  const runtime = runtimeRecipeOf(recipe);
  if (!runtime) return [];
  const rows: Array<{ id: string; capability: string; source: string }> = [];
  const seen = new Set<string>();
  const push = (capability: string | undefined, source: string) => {
    if (!capability || seen.has(`${capability}:${source}`)) return;
    seen.add(`${capability}:${source}`);
    rows.push({ id: `${source}:${capability}`, capability, source });
  };

  const containerRule = runtime.program.find((rule) => rule.slot === "container");
  const regionRules = runtime.program.filter((rule) => rule.slot === "region");
  push(containerRule?.emit.capability, "container region");
  regionRules.forEach((rule) => push(rule.emit.capability, ruleMatchSummary(rule.match as Record<string, unknown>)));
  return rows;
}

function recipeDetailState(entry: CatalogEntry, recipeId: string) {
  const ref = entry.artifact.payload.recipes.find((candidate) => candidate.id === recipeId);
  if (!ref) return { ...EMPTY_RECIPE_DETAIL };

  const recipe = entry.profile.recipesById[ref.id];
  const fromLayer = entry.profile.layersById[ref.from];
  const toLayer = entry.profile.layersById[ref.to];
  const region = regionRuleView(entry, recipe);
  const view = recipeViewConfig(entry, recipe);
  const base = {
    id: ref.id,
    from: ref.from,
    to: ref.to,
    fromLayer: layerDetailView(fromLayer),
    toLayer: layerDetailView(toLayer),
    regionRuleFromLabel: region.fromLabel,
    regionRuleToLabel: region.toLabel,
    regionRuleMappings: region.mappings,
  };

  if (!view) {
    return {
      ...base,
      kind: recipeTypeLabel(recipe),
      kindLabel: recipeTypeLabel(recipe),
      tagline: "",
      purpose: "",
      summary: "",
      constrainedWhenText: "",
      containerCapability: "",
      fallbackCapability: "",
      ruleGroups: [],
      templates: [],
      templateMappings: [],
      regionMappings: [],
      capabilityMappings: [],
      runtimeRules: [],
      runtimeCapabilities: [],
    };
  }

  const program =
    recipeFamily(recipe) === "workflow"
      ? ((recipe as unknown as VocabularyProgram).program ? (recipe as unknown as VocabularyProgram) : undefined)
      : ((planningRecipeOf(recipe) ?? runtimeRecipeOf(recipe)) as unknown as VocabularyProgram | undefined);
  const containerCapability = view.containerCapability && program
    ? String(
        readPathValue(
          ruleMatches(program, [view.containerCapability.slot])[0] ?? {},
          view.containerCapability.path
        ) ?? ""
      )
    : "";
  return {
    ...base,
    kind: view.kind,
    kindLabel: view.kindLabel,
    tagline: view.tagline,
    purpose: view.purpose,
    summary: "",
    constrainedWhenText: "",
    containerCapability,
    fallbackCapability: "",
    ruleGroups: [],
    templates: [],
    templateMappings: [],
    regionMappings: [],
    capabilityMappings: [],
    runtimeRules: [],
    runtimeCapabilities: [],
  };
}

function profileState(entry: CatalogEntry) {
  const artifact = entry.artifact.payload;
  const kindById = new Map(artifact.layers.map((layer) => [layer.id, layer.kind]));
  const legend = orderedLayerIds(entry)
    .map((id) => layerRoleLabel(entry, id))
    .join("  →  ");
  return {
    id: artifact.id,
    kind: artifact.kind,
    version: artifact.version,
    source: entry.source,
    readonly: entry.readonly,
    layerCount: artifact.layers.length,
    recipeCount: artifact.recipes.length,
    summary: `This blueprint lowers a user's goal into a rendered UI across ${artifact.layers.length} stages, joined by ${artifact.recipes.length} lowering ${artifact.recipes.length === 1 ? "recipe" : "recipes"}.`,
    legend,
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

  const errorLabel = errors.length === 1 ? "error" : "errors";
  const warningLabel = warnings.length === 1 ? "warning" : "warnings";
  return {
    status: errors.length > 0 ? "error" : "ok",
    level: errors.length > 0 ? "error" : warnings.length > 0 ? "warn" : "good",
    summary:
      errors.length > 0
        ? `${errors.length} ${errorLabel}`
        : warnings.length > 0
          ? `Valid \u00b7 ${warnings.length} ${warningLabel}`
          : "Valid",
    errors,
    warnings,
    errorsText: errors.length > 0 ? errors.join("\n") : "No errors.",
    warningsText: warnings.length > 0 ? warnings.join("\n") : "No warnings.",
  };
}

function previewSeed(entry: SampleProfileEntry, input: PreviewInput): unknown {
  if (isInteractionLikeSource(entry)) {
    return interactionPreviewSeed(
      input.source,
      entry.profile.resources.taxonomy as unknown as InteractionTaxonomy
    );
  }

  return input.source;
}

export function buildProfilePreviewBundle(
  entry: SampleProfileEntry,
  input: PreviewInput
): SerializableBundle {
  const document = runProfile(entry.profile, previewSeed(entry, input), input.ctx) as DocumentPayload;
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
    setOp("manageBlueprints.profiles", catalogRows(snapshot.entries) as unknown as Json),
    setOp("manageBlueprints.catalogStatus", catalogStatus(snapshot)),
  ];
}

function clearSelectionOps(snapshot: CatalogSnapshot, message = "") {
  return [
    ...baseCatalogOps(snapshot),
    setOp("manageBlueprints.selectedId", ""),
    setOp("manageBlueprints.profile", EMPTY_PROFILE as unknown as Json),
    setOp("manageBlueprints.pipeline", EMPTY_PIPELINE as unknown as Json),
    setOp("manageBlueprints.layers", [] as unknown as Json),
    setOp("manageBlueprints.selectedLayerId", ""),
    setOp("manageBlueprints.layerDetail", EMPTY_LAYER_DETAIL as unknown as Json),
    setOp("manageBlueprints.selectedRecipeId", ""),
    setOp("manageBlueprints.recipeDetail", EMPTY_RECIPE_DETAIL as unknown as Json),
    setOp("manageBlueprints.validation", EMPTY_VALIDATION as unknown as Json),
    setOp("manageBlueprints.artifacts", { ...EMPTY_EDITOR, profileText: "", recipesText: "", resolvedText: "", bundleText: "" } as unknown as Json),
    setOp("manageBlueprints.sourceInputForm", { properties: {} } as unknown as Json),
    setOp("manageBlueprints.sourceInput", {} as unknown as Json),
    setOp("manageBlueprints.previewContextForm", DEFAULT_PREVIEW_CONTEXT_FORM as unknown as Json),
    setOp("manageBlueprints.previewContext", DEFAULT_PREVIEW_CONTEXT as unknown as Json),
    setOp("manageBlueprints.previewBundle", null as unknown as Json),
    setOp("manageBlueprints.previewError", message),
    setOp("manageBlueprints.editor", { ...EMPTY_EDITOR, status: message || EMPTY_EDITOR.status } as unknown as Json),
  ];
}

function selectionOps(
  entry: CatalogEntry,
  input: PreviewInput,
  tab: ManageBlueprintsTab,
  snapshot: CatalogSnapshot,
  selection?: { layerId?: string; recipeId?: string }
) {
  const validation = validateSampleProfile(entry);
  const preview = previewState(entry, input);
  const layerId = resolveLayerId(entry, selection?.layerId);
  const recipeId = resolveRecipeId(entry, selection?.recipeId);
  return [
    ...baseCatalogOps(snapshot),
    setOp("manageBlueprints.selectedId", entry.artifact.payload.id),
    setOp("manageBlueprints.profile", profileState(entry) as unknown as Json),
    setOp("manageBlueprints.pipeline", pipelineState(entry) as unknown as Json),
    setOp("manageBlueprints.layers", layerRows(entry) as unknown as Json),
    setOp("manageBlueprints.selectedLayerId", layerId),
    setOp("manageBlueprints.layerDetail", layerDetailState(entry, layerId) as unknown as Json),
    setOp("manageBlueprints.selectedRecipeId", recipeId),
    setOp("manageBlueprints.recipeDetail", recipeDetailState(entry, recipeId) as unknown as Json),
    setOp("manageBlueprints.validation", validation as unknown as Json),
    setOp("manageBlueprints.artifacts", artifactState(entry) as unknown as Json),
    setOp("manageBlueprints.sourceInputForm", sourceInputFormFor(entry) as unknown as Json),
    setOp("manageBlueprints.previewContextForm", previewContextFormFor(entry) as unknown as Json),
    setOp("manageBlueprints.previewBundle", preview.bundle as unknown as Json),
    setOp("manageBlueprints.previewError", preview.error),
    setOp("manageBlueprints.editor", editorState(entry) as unknown as Json),
    setOp("manageBlueprints.tab", tab),
  ];
}

export const manageBlueprintsEffects: EffectHandlerMap = {
  $init() {
    const snapshot = loadCatalog();
    return { ops: baseCatalogOps(snapshot) };
  },

  listBlueprints(ctx) {
    const snapshot = loadCatalog();
    const selected = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!selected) return { ops: baseCatalogOps(snapshot) };
    return {
      ops: selectionOps(selected, readPreviewInput(ctx), readTab(ctx), snapshot, {
        layerId: readSelectedLayerId(ctx),
        recipeId: readSelectedRecipeId(ctx),
      }),
    };
  },

  getBlueprint(ctx) {
    const snapshot = loadCatalog();
    const entry = findEntry(String(ctx.payload.id ?? ""), snapshot.entries);
    if (!entry) {
      return {
        ops: clearSelectionOps(snapshot, `Profile '${String(ctx.payload.id ?? "")}' not found.`),
      };
    }
    const sourceDefaults = sourceInputDefaults(entry);
    const ctxDefaults = previewContextDefaults(entry);
    const input = previewInputFromValues(sourceDefaults, ctxDefaults);
    return {
      ops: [
        ...selectionOps(entry, input, "overview", snapshot),
        setOp("manageBlueprints.sourceInput", sourceDefaults as unknown as Json),
        setOp("manageBlueprints.previewContext", ctxDefaults as unknown as Json),
      ],
    };
  },

  validateProfile(ctx) {
    const snapshot = loadCatalog();
    const entry = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!entry) return { ops: [] };
    const validation = validateSampleProfile(entry);
    return {
      ops: [
        ...baseCatalogOps(snapshot),
        setOp("manageBlueprints.validation", validation as unknown as Json),
      ],
    };
  },

  selectLayer(ctx) {
    const snapshot = loadCatalog();
    const entry = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!entry) return { ops: [] };
    return {
      ops: selectionOps(entry, readPreviewInput(ctx), readTab(ctx), snapshot, {
        layerId: String(ctx.payload.id ?? ""),
        recipeId: "",
      }),
    };
  },

  selectRecipe(ctx) {
    const snapshot = loadCatalog();
    const entry = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!entry) return { ops: [] };
    const recipeId = String(ctx.payload.id ?? "");
    return {
      ops: selectionOps(entry, readPreviewInput(ctx), readTab(ctx), snapshot, {
        layerId: recipeSourceLayerId(entry, recipeId),
        recipeId,
      }),
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
        setOp("manageBlueprints.previewBundle", preview.bundle as unknown as Json),
        setOp("manageBlueprints.previewError", preview.error),
        setOp("manageBlueprints.tab", "preview"),
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
        ...selectionOps(selected, readPreviewInput(ctx), "draft", snapshot),
        setOp(
          "manageBlueprints.editor",
          {
            id: localId,
            bundleText: stringifyProfileBundle(draft),
            status: `New draft from '${selected.artifact.payload.id}'. Save to persist.`,
            error: "",
          } as unknown as Json
        ),
      ],
    };
  },

  saveBlueprint(ctx) {
    const snapshot = loadCatalog();
    try {
      const rawId = readStr(ctx, "manageBlueprints.editor.id").trim();
      const rawBundle = readStr(ctx, "manageBlueprints.editor.bundleText").trim();
      if (!rawBundle) throw new Error("Blueprint bundle JSON is empty.");

      const parsed = parseProfileBundleJson<LayerRecipe>(rawBundle);
      const nextId = (rawId || parsed.profileArtifact.payload.id).trim();
      if (!nextId) throw new Error("Local blueprint id is required.");
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
          ...selectionOps(saved, readPreviewInput(ctx), "draft", fresh),
          setOp(
            "manageBlueprints.editor",
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
            "manageBlueprints.editor",
            {
              id: readStr(ctx, "manageBlueprints.editor.id"),
              bundleText: readStr(ctx, "manageBlueprints.editor.bundleText"),
              status: readStr(ctx, "manageBlueprints.editor.status", EMPTY_EDITOR.status),
              error: error instanceof Error ? error.message : String(error),
            } as unknown as Json
          ),
          setOp("manageBlueprints.tab", "draft"),
        ],
      };
    }
  },

  requestDeleteBlueprint(ctx) {
    const snapshot = loadCatalog();
    const selected = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!selected || selected.readonly || selected.source !== "local") {
      return {
        ops: [
          ...baseCatalogOps(snapshot),
          setOp("manageBlueprints.editor.error", "Only a local blueprint can be deleted."),
          setOp("manageBlueprints.deleteChallenge", { open: false, message: "" }),
          setOp("manageBlueprints.tab", "draft"),
        ],
      };
    }
    return {
      outcome: "confirmation-required",
      ops: [setOp("manageBlueprints.deleteChallenge", {
        open: true,
        message: `Delete local blueprint '${selected.artifact.payload.id}'? This cannot be undone.`,
      })],
    };
  },

  cancelDeleteBlueprint() {
    return { outcome: "cancelled", ops: [setOp("manageBlueprints.deleteChallenge", { open: false, message: "" })] };
  },

  deleteBlueprint(ctx) {
    const snapshot = loadCatalog();
    const selected = findEntry(readSelectedId(ctx), snapshot.entries);
    if (!selected) {
      return {
        ops: [
          ...baseCatalogOps(snapshot),
          setOp(
            "manageBlueprints.editor",
            {
              ...EMPTY_EDITOR,
              error: "Select a local blueprint before deleting it.",
            } as unknown as Json
          ),
          setOp("manageBlueprints.tab", "draft"),
        ],
      };
    }
    if (selected.readonly || selected.source !== "local") {
      return {
        ops: [
          ...selectionOps(selected, readPreviewInput(ctx), "draft", snapshot),
          setOp(
            "manageBlueprints.editor",
            {
              ...editorState(selected),
              error: "Repo sample blueprints are read-only and cannot be deleted from browser storage.",
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
        setOp("manageBlueprints.deleteChallenge", { open: false, message: "" }),
        setOp(
          "manageBlueprints.editor",
          {
            ...EMPTY_EDITOR,
            status: `Deleted local profile '${selected.artifact.payload.id}' from browser storage.`,
          } as unknown as Json
        ),
        setOp("manageBlueprints.tab", "draft"),
      ],
    };
  },
};
