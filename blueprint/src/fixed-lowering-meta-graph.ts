import { evalSyncJsonata } from "@gik/evaluators";
import type { Json } from "@gik/kernel";
import { createBlueprint, validateBlueprintArtifact } from "./blueprint";
import { resolveBlueprintExecution } from "./execution";
import { applyBlueprintPatch } from "./structure-patch";
import type {
  BlueprintArtifact,
  BlueprintPatch,
  BlueprintRepresentation,
  RepresentationLoweringRecipeDefinition,
  VocabularyLoweringRecipeDefinition,
} from "./types";

const FIXED_LOWERING_META_GRAPH = createBlueprint({
  id: "gik-fixed-lowering-meta-graph",
  kind: "lowering-meta-graph",
  version: "1",
  structureMode: "fixed",
  tiers: [{ id: "runtime", kind: "runtime-document" }],
  recipes: [],
  runtime: {
    capabilities: {},
    state: { lowering: {} },
  },
  cells: {
    "resolve-stage": {
      id: "resolve-stage",
      kind: "transform",
      view: { capability: "compiler:resolve-stage" },
      outputs: [{ token: "lowering:stage" }],
    },
    "apply-vocabulary-patch": {
      id: "apply-vocabulary-patch",
      kind: "transform",
      inputs: [{ token: "lowering:stage" }],
      outputs: [{ token: "lowering:artifact" }],
      metadata: { operation: "apply-blueprint-patch" },
    },
    "emit-blueprint": {
      id: "emit-blueprint",
      kind: "emit-blueprint",
      inputs: [{ token: "lowering:artifact" }],
      outputs: [{ token: "compiled:artifact" }],
      metadata: { validation: "blueprint" },
    },
  },
  projections: {
    presentation: {
      roots: ["resolve-stage"],
      placements: [
        { cell: "apply-vocabulary-patch", parent: "resolve-stage", slot: "children", order: 0 },
        { cell: "emit-blueprint", parent: "resolve-stage", slot: "children", order: 1 },
      ],
    },
  },
});

export function fixedLoweringMetaGraphBlueprint(): BlueprintArtifact {
  return structuredClone(FIXED_LOWERING_META_GRAPH);
}

export function lowerWithFixedMetaGraph(
  source: BlueprintArtifact,
  externalContext: Readonly<Record<string, Json>> = {},
): BlueprintArtifact {
  const metaGraph = fixedLoweringMetaGraphBlueprint();
  const applyCell = metaGraph.payload.cells?.["apply-vocabulary-patch"];
  const emitCell = metaGraph.payload.cells?.["emit-blueprint"];
  if (applyCell?.metadata?.operation !== "apply-blueprint-patch") {
    throw new Error("Fixed lowering meta-graph has no supported vocabulary-patch Cell");
  }
  if (emitCell?.metadata?.validation !== "blueprint") {
    throw new Error("Fixed lowering meta-graph has no validated Blueprint emitter");
  }

  const resolved = resolveBlueprintExecution(source);
  if (resolved.stages.length === 0) return structuredClone(source);

  let artifact = structuredClone(source);
  for (const { recipe } of resolved.stages) {
    const representationRecipe = recipe as Partial<RepresentationLoweringRecipeDefinition>;
    if (Array.isArray(representationRecipe.representations)) {
      artifact = applyRepresentationRecipe(artifact, representationRecipe as RepresentationLoweringRecipeDefinition, externalContext);
      continue;
    }
    const patch = (recipe as Partial<VocabularyLoweringRecipeDefinition>).patch as BlueprintPatch | undefined;
    if (!Array.isArray(patch) || patch.length === 0) {
      throw new Error(`Blueprint lowering recipe '${recipe.id}' requires a non-empty vocabulary patch`);
    }
    artifact = applyBlueprintPatch(artifact, patch);
  }

  const terminalTier = resolved.stages.at(-1)!.toTier;
  const terminal = structuredClone(artifact) as BlueprintArtifact;
  terminal.payload.tiers = [structuredClone(terminalTier)];
  terminal.payload.recipes = [];
  validateBlueprintArtifact(terminal);
  return terminal;
}

function applyRepresentationRecipe(
  source: BlueprintArtifact,
  recipe: RepresentationLoweringRecipeDefinition,
  externalContext: Readonly<Record<string, Json>>,
): BlueprintArtifact {
  const representations = new Map(recipe.representations.map((representation) => [representation.id, representation]));
  const selected = recipe.representations.find((representation) => representation.when
    ? evalSyncJsonata(representation.when, { externalContext } as Json) === true
    : false) ?? representations.get(recipe.fallback);
  if (!selected) throw new Error(`Blueprint lowering recipe '${recipe.id}' has unknown fallback '${recipe.fallback}'`);

  const chain: BlueprintRepresentation[] = [];
  const seen = new Set<string>();
  let current: BlueprintRepresentation | undefined = selected;
  while (current) {
    if (seen.has(current.id)) throw new Error(`Blueprint representation inheritance cycle at '${current.id}'`);
    seen.add(current.id);
    chain.unshift(current);
    if (!current.extends) break;
    const parent = representations.get(current.extends);
    if (!parent) throw new Error(`Blueprint representation '${current.id}' extends unknown representation '${current.extends}'`);
    current = parent;
  }

  const artifact = structuredClone(source);
  let presentation = artifact.payload.projections?.presentation
    ? structuredClone(artifact.payload.projections.presentation)
    : undefined;
  for (const representation of chain) {
    for (const [cellId, view] of Object.entries(representation.views ?? {})) {
      const cell = artifact.payload.cells?.[cellId];
      if (!cell) throw new Error(`Blueprint representation '${representation.id}' references unknown Cell '${cellId}'`);
      cell.view = structuredClone(view);
    }
    if (representation.presentation) presentation = structuredClone(representation.presentation);
    if (representation.presentationAppend) {
      if (!presentation) throw new Error(`Blueprint representation '${representation.id}' cannot append to a missing presentation`);
      presentation.placements = [...(presentation.placements ?? []), ...structuredClone(representation.presentationAppend)];
    }
  }
  if (!presentation) throw new Error(`Blueprint representation '${selected.id}' produced no presentation`);
  artifact.payload.projections = { ...artifact.payload.projections, presentation };
  return artifact;
}