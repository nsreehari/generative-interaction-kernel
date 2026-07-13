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
  type InteractionToPresentationRecipe,
  type LayerDefinition,
  lintLoweringRecipeArtifact,
  lintProfileArtifacts,
  loadProfileBundle,
  parseProfileBundleJson,
  stringifyProfileBundle,
  type LoweringRecipe,
  validateLoweringRecipeArtifact,
  validateProfileArtifact,
  type PresentationToRuntimeRecipe,
  type ProfileArtifactBundle,
} from "@gik/profile-genui";
import {
  compileInteraction,
  type InteractionKind,
  type InteractionSpec,
  type PresentationContext,
  type ProfileStageTrace,
  traceProfile,
} from "@gik/profile-genui";
import { sampleProfileCatalog, type SampleProfileEntry } from "../../profiles/registry";
import { demoDataFor } from "../workbench/bundles/demo/demo";

export type ConsoleTab = "overview" | "layers" | "preview" | "draft";

interface PreviewInput {
  interaction: InteractionKind;
  subject: string;
  surface: string;
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
  status: "Select a profile, or create a local draft to start editing.",
  error: "",
};

const EMPTY_VALIDATION: ValidationResult = {
  status: "unknown",
  level: "unknown",
  summary: "Not validated yet.",
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
  return value === "overview" || value === "layers" || value === "preview" || value === "draft"
    ? value
    : "overview";
}

function readSelectedLayerId(ctx: EffectContext): string {
  return readStr(ctx, "console.selectedLayerId");
}

function readSelectedRecipeId(ctx: EffectContext): string {
  return readStr(ctx, "console.selectedRecipeId");
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
    recipes: entry.artifact.payload.recipes.length,
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
function regionRuleView(recipe: LoweringRecipe): {
  fromLabel: string;
  toLabel: string;
  mappings: Array<{ id: string; from: string; to: string }>;
} {
  if (recipe.from === "interaction" && recipe.to === "presentation") {
    const typed = recipe as InteractionToPresentationRecipe;
    return {
      fromLabel: "A region whose role is",
      toLabel: "Is presented as",
      mappings: (typed.regionRules ?? []).map((rule, index) => ({
        id: `rgn-${index}`,
        from: mappingWhen(rule.match as Record<string, unknown>),
        to: String((rule.emit as Record<string, unknown>).presentation ?? ""),
      })),
    };
  }
  const typed = recipe as PresentationToRuntimeRecipe;
  const mappings = typed.rules.map((rule, index) => ({
    id: `cap-${index}`,
    from: mappingWhen(rule.match as Record<string, unknown>),
    to: String(rule.emit.capability ?? ""),
  }));
  if (typed.fallback?.capability) {
    mappings.push({ id: "cap-fallback", from: "Otherwise", to: String(typed.fallback.capability) });
  }
  return { fromLabel: "A region / role", toLabel: "Renders as", mappings };
}

// Reads a rule's match condition as the left-hand side of a lowering mapping ("when …"). An empty
// match is the catch-all, shown as "Otherwise" so the row reads like a fallback branch.
function mappingWhen(match: Record<string, unknown> | undefined): string {
  const entries = Object.entries(match ?? {});
  return entries.length === 0 ? "Otherwise" : entries.map(([key, value]) => `${key} = ${String(value)}`).join(", ");
}

function recipeTypeLabel(recipe: LoweringRecipe): string {
  return `${recipe.from} -> ${recipe.to}`;
}

function pipelineState(entry: CatalogEntry) {
  const incomingByNode = new Map<string, Array<{ token: string; label: string }>>();
  const outgoingByNode = new Map<string, Array<{ token: string; label: string }>>();

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
      subtitle: layerRoleLabel(layer.kind),
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
    roleLabel: layerRoleLabel(layer.kind),
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

const LAYER_ROLES: Record<string, string> = {
  interaction:
    "What the user is trying to accomplish — a domain-neutral goal pattern (investigate, compare, review…). No layout or UI is decided here yet.",
  presentation:
    "How that goal should appear for the current context — its regions, each with a priority and a disclosure choice, arranged by a layout template.",
  "runtime-document":
    "The final, validated UI document — the concrete kernel capabilities a renderer actually draws.",
};

const LAYER_ROLE_LABELS: Record<string, string> = {
  interaction: "The user's goal",
  presentation: "The layout plan",
  "runtime-document": "The rendered UI",
};

function layerRole(kind: string): string {
  return LAYER_ROLES[kind] ?? "A stage in this profile's lowering pipeline.";
}

function layerRoleLabel(kind: string): string {
  return LAYER_ROLE_LABELS[kind] ?? "Pipeline stage";
}

function recipeTagline(kind: string): string {
  if (kind === "interaction-to-presentation") return "decides the layout";
  if (kind === "presentation-to-runtime") return "picks the components";
  return "";
}

function recipePurpose(kind: string): string {
  if (kind === "interaction-to-presentation") {
    return "Picks a layout template for the interaction and orders each region by priority and disclosure for the target context.";
  }
  if (kind === "presentation-to-runtime") {
    return "Binds each presentation region to a concrete UI capability the kernel can render.";
  }
  return "";
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
  const position = index === 0 ? "Source" : index === total - 1 ? "Terminal" : "Intermediate";
  return `${position} · stage ${index + 1} of ${total}`;
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

// The closed grammar each layer speaks, DERIVED FROM THE LOADED PROFILE DATA (no imported
// taxonomy): the interaction layer's terms come from its outgoing recipe's rule matches, the
// presentation layer's from what that recipe emits, and the runtime layer's from the concrete
// capabilities its incoming recipe binds. So the panel always reflects the profile on screen.
function layerVocabulary(entry: CatalogEntry, layerId: string) {
  const layer = entry.artifact.payload.layers.find((candidate) => candidate.id === layerId);
  const groups: Array<{ id: string; label: string; note: string; terms: string[] }> = [];
  if (!layer) return { groups };

  const outgoingRef = entry.artifact.payload.recipes.find((candidate) => candidate.from === layerId);
  const incomingRef = entry.artifact.payload.recipes.find((candidate) => candidate.to === layerId);
  const outgoing = outgoingRef ? entry.profile.recipesById[outgoingRef.id] : undefined;
  const incoming = incomingRef ? entry.profile.recipesById[incomingRef.id] : undefined;

  if (layer.kind === "interaction" && outgoing) {
    const rec = outgoing as InteractionToPresentationRecipe;
    const interactions = distinctTerms(
      rec.templateRules.map((rule) => String((rule.match as Record<string, unknown>).interaction ?? "")),
    );
    const roles = distinctTerms(
      (rec.regionRules ?? []).map((rule) => String((rule.match as Record<string, unknown>).role ?? "")),
    );
    const contextKeys = distinctTerms(
      rec.templateRules.flatMap((rule) => Object.keys(rule.match ?? {}).filter((key) => key !== "interaction")),
    );
    groups.push({ id: "interactions", label: "Interactions", note: "the goal patterns this layer routes on", terms: interactions });
    groups.push({ id: "roles", label: "Facet roles", note: "the semantic role a region can carry", terms: roles });
    groups.push({ id: "context", label: "Context signals", note: "situational keys that can steer the layout", terms: contextKeys });
  } else if (layer.kind === "presentation" && incoming) {
    const rec = incoming as InteractionToPresentationRecipe;
    const layouts = distinctTerms(rec.templateRules.map((rule) => String((rule.emit as Record<string, unknown>).template ?? "")));
    const presentations = distinctTerms((rec.regionRules ?? []).map((rule) => String((rule.emit as Record<string, unknown>).presentation ?? "")));
    groups.push({ id: "layouts", label: "Layouts", note: "arrangements this layer can produce", terms: layouts });
    groups.push({ id: "presentations", label: "Region presentations", note: "how a region can be shown", terms: presentations });
  } else if (layer.kind === "runtime-document" && incoming) {
    const rec = incoming as PresentationToRuntimeRecipe;
    const capabilities = distinctTerms([
      rec.container?.capability,
      ...rec.rules.map((rule) => String(rule.emit.capability ?? "")),
      rec.fallback?.capability,
    ]);
    groups.push({ id: "capabilities", label: "UI capabilities", note: "the concrete components a renderer can draw", terms: capabilities });
  }

  return { groups: groups.filter((group) => group.terms.length > 0) };
}

// Representative context surfaces to vary in the worked examples. We run every surface and then
// collapse identical outcomes, so a row that reads "any surface" means context doesn't change that
// interaction's result, while a split into specific surfaces reveals exactly where context matters.
const EXAMPLE_SURFACES: Array<PresentationContext["surface"]> = ["desktop", "web", "mobile", "copilot", "teams"];
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

  // The pipeline's only external input is an interaction goal, so sample inputs come from the very
  // first stage's rules — the same seed set for every layer. Each seed is run through the whole
  // profile; we then read the input/output of THIS layer's stage from the trace.
  const firstStage = profile.stages[0];
  const seedRecipe =
    firstStage && firstStage.fromLayer.kind === "interaction"
      ? (firstStage.recipe as InteractionToPresentationRecipe)
      : undefined;
  const interactions = seedRecipe
    ? distinctTerms(seedRecipe.templateRules.map((rule) => String((rule.match as Record<string, unknown>).interaction ?? "")))
    : [];
  if (interactions.length === 0) return empty;

  const columns = [
    { key: "input", label: `From ${stage.fromLayer.kind}` },
    { key: "context", label: "Context (surface)" },
    { key: "output", label: `→ ${stage.toLayer.kind}` },
  ];

  // Run every seed × surface, then group by identical (input, output) outcome so a row that reads
  // "any surface" means context doesn't change that result, while a split reveals where it does.
  const byOutcome = new Map<string, { surfaces: string[]; input: string; output: string }>();
  for (const interaction of interactions) {
    for (const surface of EXAMPLE_SURFACES) {
      try {
        const trace: ProfileStageTrace[] = traceProfile(
          profile,
          { interaction: interaction as InteractionKind, subject: "incident" },
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
    role: layer ? (layer.description?.trim() || layerRole(layer.kind)) : "",
    stageLabel: layer ? layerStageLabel(entry, layerId) : "",
    vocabulary: layer ? layerVocabulary(entry, layerId) : { groups: [] },
    loweringExamples: layer ? loweringExamples(entry, layerId) : { columns: [], rows: [] },
    outgoingRecipe: outgoingRef ? recipeDetailState(entry, outgoingRef.id) : emptyRecipeDetailState(),
    incomingRecipe: incomingRef ? recipeDetailState(entry, incomingRef.id) : emptyRecipeDetailState(),
  };
}

function recipeSourceLayerId(entry: CatalogEntry, recipeId: string): string {
  return entry.artifact.payload.recipes.find((candidate) => candidate.id === recipeId)?.from ?? defaultLayerId(entry);
}

function runtimeCapabilityRows(recipe: PresentationToRuntimeRecipe) {
  const rows: Array<{ id: string; capability: string; source: string }> = [];
  const seen = new Set<string>();
  const push = (capability: string | undefined, source: string) => {
    if (!capability || seen.has(`${capability}:${source}`)) return;
    seen.add(`${capability}:${source}`);
    rows.push({ id: `${source}:${capability}`, capability, source });
  };

  push(recipe.container.capability, "container region");
  recipe.rules.forEach((rule) => push(rule.emit.capability, ruleMatchSummary(rule.match as Record<string, unknown>)));
  push(recipe.fallback?.capability, "fallback");
  return rows;
}

function recipeDetailState(entry: CatalogEntry, recipeId: string) {
  const ref = entry.artifact.payload.recipes.find((candidate) => candidate.id === recipeId);
  if (!ref) return { ...EMPTY_RECIPE_DETAIL };

  const recipe = entry.profile.recipesById[ref.id];
  const fromLayer = entry.profile.layersById[ref.from];
  const toLayer = entry.profile.layersById[ref.to];
  const region = regionRuleView(recipe);
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

  if (recipe.from === "interaction" && recipe.to === "presentation") {
    const typed = recipe as InteractionToPresentationRecipe;
    return {
      ...base,
      kind: "interaction-to-presentation",
      kindLabel: "Interaction → Presentation",
      tagline: recipeTagline("interaction-to-presentation"),
      purpose: recipePurpose("interaction-to-presentation"),
      summary: `${typed.templates.length} templates and ${typed.templateRules.length} template rules`,
      constrainedWhenText: typed.constrainedWhen?.length ? typed.constrainedWhen.map(ruleMatchSummary).join("; ") : "",
      containerCapability: "",
      fallbackCapability: "",
      ruleGroups: [
        { id: "templates", label: "Templates", value: String(typed.templates.length) },
        { id: "templateRules", label: "Template rules", value: String(typed.templateRules.length) },
        { id: "orderRules", label: "Order rules", value: String(typed.orderRules.length) },
        { id: "priorityRules", label: "Priority rules", value: String(typed.priorityRules.length) },
        { id: "disclosureRules", label: "Disclosure rules", value: String(typed.disclosureRules.length) },
        { id: "regionRules", label: "Presentation rules", value: String(typed.regionRules?.length ?? 0) },
        { id: "rationaleRules", label: "Rationale rules", value: String(typed.rationaleRules?.length ?? 0) },
      ],
      templates: typed.templates.map((template) => ({
        id: template.name,
        name: template.name,
        arrangement: template.arrangement,
        maxRegions: template.maxRegions == null ? "" : String(template.maxRegions),
      })),
      templateMappings: typed.templateRules.map((rule, index) => ({
        id: `tpl-${index}`,
        from: mappingWhen(rule.match as Record<string, unknown>),
        to: String((rule.emit as Record<string, unknown>).template ?? ""),
      })),
      regionMappings: (typed.regionRules ?? []).map((rule, index) => ({
        id: `rgn-${index}`,
        from: mappingWhen(rule.match as Record<string, unknown>),
        to: String((rule.emit as Record<string, unknown>).presentation ?? ""),
      })),
      capabilityMappings: [],
      runtimeRules: [],
      runtimeCapabilities: [],
    };
  }

  const typed = recipe as PresentationToRuntimeRecipe;
  return {
    ...base,
    kind: "presentation-to-runtime",
    kindLabel: "Presentation → Runtime",
    tagline: recipeTagline("presentation-to-runtime"),
    purpose: recipePurpose("presentation-to-runtime"),
    summary: `${typed.rules.length} runtime rules`,
    constrainedWhenText: "",
    containerCapability: typed.container.capability,
    fallbackCapability: String(typed.fallback?.capability ?? ""),
    ruleGroups: [],
    templates: [],
    templateMappings: [],
    regionMappings: [],
    capabilityMappings: (() => {
      const rows = typed.rules.map((rule, index) => ({
        id: `cap-${index}`,
        from: mappingWhen(rule.match as Record<string, unknown>),
        to: String(rule.emit.capability ?? ""),
      }));
      if (typed.fallback?.capability) {
        rows.push({ id: "cap-fallback", from: "Otherwise", to: String(typed.fallback.capability) });
      }
      return rows;
    })(),
    runtimeRules: typed.rules.map((rule, index) => ({
      id: `rule-${index + 1}`,
      match: ruleMatchSummary(rule.match as Record<string, unknown>),
      capability: String(rule.emit.capability ?? ""),
      reads: Object.keys(rule.emit.read ?? rule.emit.readExpr ?? {}).join(", "),
      actions: Object.keys(rule.emit.on ?? {}).join(", "),
    })),
    runtimeCapabilities: runtimeCapabilityRows(typed),
  };
}

function profileState(entry: CatalogEntry) {
  const artifact = entry.artifact.payload;
  const kindById = new Map(artifact.layers.map((layer) => [layer.id, layer.kind]));
  const legend = orderedLayerIds(entry)
    .map((id) => layerRoleLabel(kindById.get(id) ?? ""))
    .join("  →  ");
  return {
    id: artifact.id,
    kind: artifact.kind,
    version: artifact.version,
    source: entry.source,
    readonly: entry.readonly,
    layerCount: artifact.layers.length,
    recipeCount: artifact.recipes.length,
    summary: `This profile lowers a user's goal into a rendered UI across ${artifact.layers.length} stages, joined by ${artifact.recipes.length} lowering ${artifact.recipes.length === 1 ? "recipe" : "recipes"}.`,
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

function previewSpec(input: PreviewInput): InteractionSpec {
  const base: InteractionSpec = {
    interaction: input.interaction,
    subject: input.subject.trim() || "incident",
  };
  if (input.interaction === "configure") {
    return {
      ...base,
      data: {
        ...demoDataFor(base),
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
    setOp("console.pipeline", EMPTY_PIPELINE as unknown as Json),
    setOp("console.layers", [] as unknown as Json),
    setOp("console.selectedLayerId", ""),
    setOp("console.layerDetail", EMPTY_LAYER_DETAIL as unknown as Json),
    setOp("console.selectedRecipeId", ""),
    setOp("console.recipeDetail", EMPTY_RECIPE_DETAIL as unknown as Json),
    setOp("console.validation", EMPTY_VALIDATION as unknown as Json),
    setOp("console.artifacts", { ...EMPTY_EDITOR, profileText: "", recipesText: "", resolvedText: "", bundleText: "" } as unknown as Json),
    setOp("console.previewBundle", null as unknown as Json),
    setOp("console.previewError", message),
    setOp("console.editor", { ...EMPTY_EDITOR, status: message || EMPTY_EDITOR.status } as unknown as Json),
  ];
}

function selectionOps(
  entry: CatalogEntry,
  input: PreviewInput,
  tab: ConsoleTab,
  snapshot: CatalogSnapshot,
  selection?: { layerId?: string; recipeId?: string }
) {
  const validation = validateSampleProfile(entry);
  const preview = previewState(entry, input);
  const layerId = resolveLayerId(entry, selection?.layerId);
  const recipeId = resolveRecipeId(entry, selection?.recipeId);
  return [
    ...baseCatalogOps(snapshot),
    setOp("console.selectedId", entry.artifact.payload.id),
    setOp("console.profile", profileState(entry) as unknown as Json),
    setOp("console.pipeline", pipelineState(entry) as unknown as Json),
    setOp("console.layers", layerRows(entry) as unknown as Json),
    setOp("console.selectedLayerId", layerId),
    setOp("console.layerDetail", layerDetailState(entry, layerId) as unknown as Json),
    setOp("console.selectedRecipeId", recipeId),
    setOp("console.recipeDetail", recipeDetailState(entry, recipeId) as unknown as Json),
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
    return {
      ops: selectionOps(selected, readPreviewInput(ctx), readTab(ctx), snapshot, {
        layerId: readSelectedLayerId(ctx),
        recipeId: readSelectedRecipeId(ctx),
      }),
    };
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
        ...selectionOps(selected, readPreviewInput(ctx), "draft", snapshot),
        setOp(
          "console.editor",
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
          ...selectionOps(saved, readPreviewInput(ctx), "draft", fresh),
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
          setOp("console.tab", "draft"),
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
          setOp("console.tab", "draft"),
        ],
      };
    }
    if (selected.readonly || selected.source !== "local") {
      return {
        ops: [
          ...selectionOps(selected, readPreviewInput(ctx), "draft", snapshot),
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
        setOp("console.tab", "draft"),
      ],
    };
  },
};
