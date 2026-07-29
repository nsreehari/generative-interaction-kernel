import { createBlueprint, validateBlueprintArtifact } from "./blueprint";
import { resolveBlueprintExecution } from "./execution";
import { applyBlueprintPatch } from "./structure-patch";
import type { BlueprintArtifact, BlueprintPatch, VocabularyLoweringRecipeDefinition } from "./types";

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