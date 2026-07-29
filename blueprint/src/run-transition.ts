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
import { lowerWithFixedMetaGraph } from "./fixed-lowering-meta-graph";
import { loadBlueprint } from "./resolution";
import { admitBlueprintPatch, applyBlueprintPatch } from "./structure-patch";
import type { BlueprintArtifact, BlueprintPatch, BlueprintPatchOrigin, BlueprintReferenceResolver } from "./types";

export type ExternalContext = Readonly<Record<string, Json>>;

export interface MaterializedBlueprint {
  readonly gik: "0.1";
  readonly type: "materialized-blueprint";
  readonly payload: {
    readonly terminalBlueprint: BlueprintArtifact;
    readonly externalContext: Record<string, Json>;
    readonly vocabulary: Enveloped<ProjectedVocabularyManifest>;
    readonly program: Enveloped<ProjectedProgramDefinition>;
    readonly initialState: Record<string, Json>;
  };
}

export interface MaterializeBlueprintInput {
  blueprint: BlueprintArtifact;
  externalContext?: ExternalContext;
  resolveBlueprint?: BlueprintReferenceResolver;
}

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
  externalContext?: ExternalContext;
  events: readonly GIKEvent[];
  contexts?: Record<string, StateModel>;
  createOrchestrator?: (state: StateModel) => Orchestrator;
}

export interface MaterializedBlueprintTransitionInput {
  state: Record<string, Json>;
  materializedBlueprint: MaterializedBlueprint;
  events: readonly GIKEvent[];
  contexts?: Record<string, StateModel>;
  createOrchestrator?: (state: StateModel) => Orchestrator;
}

export interface BlueprintTransitionResult {
  state: Record<string, Json>;
  effects?: readonly OrchestratorEffect[];
  /** Semantic patch proposals always target the authored Blueprint supplied to runTransition. */
  blueprintPatchProposals?: readonly BlueprintPatch[];
  /** @deprecated Use blueprintPatchProposals. */
  blueprintPatches?: readonly BlueprintPatch[];
}

export interface ApplyBlueprintPatchesInput {
  blueprint: BlueprintArtifact;
  externalContext?: ExternalContext;
  state: Record<string, Json>;
  patch: BlueprintPatch;
  origin: BlueprintPatchOrigin;
  resolveBlueprint?: BlueprintReferenceResolver;
}

export interface AppliedBlueprintPatches {
  blueprint: BlueprintArtifact;
  materializedBlueprint: MaterializedBlueprint;
  state: Record<string, Json>;
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
  const assembled = assembleBlueprint(source, options.resolveBlueprint);
  const blueprint = assembled.payload.recipes.length > 0
    ? lowerWithFixedMetaGraph(assembled)
    : assembled;
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

export function materializeBlueprint({
  blueprint,
  externalContext = {},
  resolveBlueprint,
}: MaterializeBlueprintInput): MaterializedBlueprint {
  if (Object.prototype.hasOwnProperty.call(blueprint.payload.runtime.state ?? {}, "externalContext")) {
    throw new Error(`Blueprint '${blueprint.payload.id}' reserves state namespace 'externalContext' for immutable external context`);
  }
  const prepared = prepareBlueprintProgram(blueprint, { resolveBlueprint });
  return {
    gik: "0.1",
    type: "materialized-blueprint",
    payload: {
      terminalBlueprint: structuredClone(prepared.blueprint),
      externalContext: structuredClone(externalContext),
      vocabulary: structuredClone(prepared.vocabulary),
      program: structuredClone(prepared.program),
      initialState: structuredClone(prepared.initialState),
    },
  };
}

class ExternalContextStateModel implements StateModel {
  private readonly value: Record<string, Json>;

  constructor(externalContext: Record<string, Json>) {
    this.value = { externalContext: structuredClone(externalContext) };
  }

  snapshot(): Record<string, Json> {
    return structuredClone(this.value);
  }

  get(path: string): Json {
    const parts = path.split(".").filter(Boolean);
    let value: Json = this.value;
    for (const part of parts) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
      value = (value as Record<string, Json>)[part] ?? null;
    }
    return structuredClone(value);
  }

  apply(): void {
    throw new Error("externalContext is read-only");
  }
}

export async function runMaterializedTransition({
  state,
  materializedBlueprint,
  events,
  contexts,
  createOrchestrator,
}: MaterializedBlueprintTransitionInput): Promise<BlueprintTransitionResult> {
  const { vocabulary, program, externalContext } = materializedBlueprint.payload;
  if (contexts?.externalContext) throw new Error("contexts must not override reserved externalContext namespace");
  const store = new InMemoryStateModel(unwrap(vocabulary).namespaces ?? []);
  const allContexts = {
    ...contexts,
    externalContext: new ExternalContextStateModel(externalContext),
  };
  const runtimeStore = new CompositeStateModel(store, allContexts);
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

export function applyBlueprintPatches({
  blueprint,
  externalContext,
  state,
  patch,
  origin,
  resolveBlueprint,
}: ApplyBlueprintPatchesInput): AppliedBlueprintPatches {
  const decision = admitBlueprintPatch(blueprint, { origin, patch });
  if (!decision.accepted) throw new Error(`Blueprint structure change rejected: ${decision.reason}`);
  const nextBlueprint = applyBlueprintPatch(blueprint, decision.patch);
  return {
    blueprint: nextBlueprint,
    materializedBlueprint: materializeBlueprint({ blueprint: nextBlueprint, externalContext, resolveBlueprint }),
    state: structuredClone(state),
  };
}

export async function runTransition({
  state,
  blueprint,
  externalContext,
  events,
  contexts,
  createOrchestrator,
}: BlueprintTransitionInput): Promise<BlueprintTransitionResult> {
  return runMaterializedTransition({
    state,
    materializedBlueprint: materializeBlueprint({ blueprint, externalContext }),
    events,
    contexts,
    createOrchestrator,
  });
}