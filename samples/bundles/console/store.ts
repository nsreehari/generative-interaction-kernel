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
  compileInteraction,
  lintLoweringRecipeArtifact,
  lintProfileArtifacts,
  recipeForKinds,
  validateLoweringRecipeArtifact,
  validateProfileArtifact,
  type InteractionKind,
  type InteractionSpec,
  type PresentationContext,
  type PresentationToRuntimeRecipe,
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
  sourceKind: "",
  targetKind: "",
  layerCount: 0,
  stageCount: 0,
  layers: [],
  stages: [],
  capabilities: [],
};

function readStr(ctx: EffectContext, path: string, fallback = ""): string {
  const value = ctx.get(path);
  return value == null ? fallback : String(value);
}

function readSelectedId(ctx: EffectContext): string {
  return readStr(ctx, "console.selectedId");
}

function readPreviewInput(ctx: EffectContext): PreviewInput {
  return {
    interaction: readStr(ctx, "console.previewInteraction", "investigate") as InteractionKind,
    subject: readStr(ctx, "console.previewSubject", "incident"),
    surface: readStr(ctx, "console.previewSurface", "desktop"),
  };
}

function catalogRows() {
  return sampleProfileCatalog.map((entry) => ({
    id: entry.artifact.payload.id,
    kind: entry.artifact.payload.kind,
    version: entry.artifact.payload.version,
    layers: entry.artifact.payload.layers.length,
    stages: entry.profile.stages.length,
  }));
}

function findEntry(id: string): SampleProfileEntry | undefined {
  return sampleProfileCatalog.find((entry) => entry.artifact.payload.id === id);
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

function profileState(entry: SampleProfileEntry) {
  const artifact = entry.artifact.payload;
  const firstStage = entry.profile.stages[0];
  const lastStage = entry.profile.stages[entry.profile.stages.length - 1];
  return {
    id: artifact.id,
    kind: artifact.kind,
    version: artifact.version,
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

function artifactState(entry: SampleProfileEntry) {
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

function selectionOps(entry: SampleProfileEntry, input: PreviewInput, tab: ConsoleTab) {
  const validation = validateSampleProfile(entry);
  const preview = previewState(entry, input);
  return [
    setOp("console.profiles", catalogRows() as unknown as Json),
    setOp("console.selectedId", entry.artifact.payload.id),
    setOp("console.profile", profileState(entry) as unknown as Json),
    setOp("console.validation", validation as unknown as Json),
    setOp("console.artifacts", artifactState(entry) as unknown as Json),
    setOp("console.previewBundle", preview.bundle as unknown as Json),
    setOp("console.previewError", preview.error),
    setOp("console.tab", tab),
  ];
}

export const consoleEffects: EffectHandlerMap = {
  syncCatalog() {
    return { ops: [setOp("console.profiles", catalogRows() as unknown as Json)] };
  },

  loadProfile(ctx) {
    const entry = findEntry(String(ctx.payload.id ?? ""));
    if (!entry) {
      return {
        ops: [
          setOp("console.profiles", catalogRows() as unknown as Json),
          setOp("console.profile", EMPTY_PROFILE as unknown as Json),
          setOp("console.previewBundle", null as unknown as Json),
          setOp("console.previewError", `Profile '${String(ctx.payload.id ?? "")}' not found.`),
        ],
      };
    }
    return { ops: selectionOps(entry, readPreviewInput(ctx), "overview") };
  },

  validateProfile(ctx) {
    const entry = findEntry(readSelectedId(ctx));
    if (!entry) return { ops: [] };
    const validation = validateSampleProfile(entry);
    return {
      ops: [
        setOp("console.profiles", catalogRows() as unknown as Json),
        setOp("console.validation", validation as unknown as Json),
        setOp("console.tab", "validation"),
      ],
    };
  },

  refreshPreview(ctx) {
    const entry = findEntry(readSelectedId(ctx));
    if (!entry) return { ops: [] };
    const preview = previewState(entry, readPreviewInput(ctx));
    return {
      ops: [
        setOp("console.profiles", catalogRows() as unknown as Json),
        setOp("console.previewBundle", preview.bundle as unknown as Json),
        setOp("console.previewError", preview.error),
        setOp("console.tab", "preview"),
      ],
    };
  },
};
