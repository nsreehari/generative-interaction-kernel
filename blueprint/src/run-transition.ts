import {
  CompositeStateModel,
  InMemoryStateModel,
  Kernel,
  unwrap,
  type Enveloped,
  type GIKEvent,
  type Json,
  type Orchestrator,
  type OrchestratorEffect,
  type ProjectedProgramDefinition,
  type ProjectedVocabularyManifest,
  type StateModel,
} from "@gik/kernel";
import { assembleBlueprint } from "./blueprint";
import { compileCellTopology } from "./cells";
import { composeCellProgram } from "./cell-projection";
import { loadBlueprint } from "./resolution";
import type { BlueprintArtifact, BlueprintReferenceResolver } from "./types";

export type BlueprintPatch = never;

export interface PrepareBlueprintProgramOptions {
  context?: Record<string, Json>;
  resolveBlueprint?: BlueprintReferenceResolver;
}

export interface PreparedBlueprintProgram {
  blueprint: BlueprintArtifact;
  vocabulary: Enveloped<ProjectedVocabularyManifest>;
  program: Enveloped<ProjectedProgramDefinition>;
  initialState: Record<string, Json>;
}

export interface BlueprintTransitionInput {
  state: Record<string, Json>;
  blueprint: BlueprintArtifact;
  events: readonly GIKEvent[];
  contexts?: Record<string, StateModel>;
  createOrchestrator?: (state: StateModel) => Orchestrator;
}

export interface BlueprintTransitionResult {
  state: Record<string, Json>;
  effects?: readonly OrchestratorEffect[];
  blueprintPatches?: readonly BlueprintPatch[];
}

function mergeJsonRecords(base: Record<string, Json>, overlay: Record<string, Json>): Record<string, Json> {
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(overlay)) {
    const existing = merged[key];
    if (
      existing !== null && typeof existing === "object" && !Array.isArray(existing)
      && value !== null && typeof value === "object" && !Array.isArray(value)
    ) {
      merged[key] = mergeJsonRecords(existing as Record<string, Json>, value as Record<string, Json>);
    } else {
      merged[key] = structuredClone(value);
    }
  }
  return merged;
}

function initialSeed(context?: Record<string, Json>): Record<string, Json> {
  const value = context?.initialSeed ?? context?.freeContext;
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value as Record<string, Json>)
    : {};
}

export function prepareBlueprintProgram(
  source: BlueprintArtifact,
  options: PrepareBlueprintProgramOptions = {},
): PreparedBlueprintProgram {
  const blueprint = assembleBlueprint(source, options.resolveBlueprint);
  if (blueprint.payload.recipes.length > 0) {
    throw new Error(`Blueprint '${blueprint.payload.id}' must be lowered before its program can run`);
  }
  if (!blueprint.payload.cells || !blueprint.payload.projections?.presentation) {
    throw new Error(`Blueprint '${blueprint.payload.id}' has no executable presentation projection`);
  }
  const runtime = blueprint.payload.runtime;
  if (!runtime) throw new Error(`Blueprint '${blueprint.payload.id}' has no runtime declaration`);

  const resolved = loadBlueprint(blueprint);
  const definition = {
    cells: blueprint.payload.cells,
    projections: { presentation: blueprint.payload.projections.presentation },
  };
  const vocabulary: ProjectedVocabularyManifest = {
    version: `${blueprint.payload.id}/${blueprint.payload.version}`,
    expression: runtime.expression,
    namespaces: runtime.namespaces,
    contexts: runtime.contexts,
    actions: runtime.actions,
    capabilities: structuredClone(runtime.capabilities ?? {}),
    externals: {
      ...structuredClone(runtime.externals ?? {}),
      ...(Object.keys(resolved.services).length > 0
        ? { services: structuredClone(resolved.services) }
        : {}),
    },
  };
  const program = composeCellProgram(
    definition,
    compileCellTopology(blueprint.payload.id, definition.cells),
  );
  return {
    blueprint,
    vocabulary: { gik: "0.1", type: "vocabulary", payload: vocabulary },
    program: { gik: "0.1", type: "program", payload: program },
    initialState: mergeJsonRecords(structuredClone(runtime.state ?? {}), initialSeed(options.context)),
  };
}

export async function runTransition({
  state,
  blueprint,
  events,
  contexts,
  createOrchestrator,
}: BlueprintTransitionInput): Promise<BlueprintTransitionResult> {
  const { vocabulary, program } = prepareBlueprintProgram(blueprint);
  const store = new InMemoryStateModel(unwrap(vocabulary).namespaces ?? []);
  const runtimeStore = contexts && Object.keys(contexts).length > 0
    ? new CompositeStateModel(store, contexts)
    : store;
  const kernel = new Kernel(vocabulary, program, {
    state: runtimeStore,
    ...(createOrchestrator ? { orchestrator: createOrchestrator(runtimeStore) } : {}),
  });
  kernel.init();
  store.apply(Object.entries(state).map(([path, value]) => ({ op: "set", path, value })));

  if (events.length === 0) await kernel.syncExternal();
  for (const event of events) await kernel.dispatch(structuredClone(event));
  await kernel.whenIdle();

  const effects = kernel.effectsSince(-1).map(({ effect }) => effect);
  return {
    state: structuredClone(store.snapshot()),
    ...(effects.length > 0 ? { effects } : {}),
  };
}