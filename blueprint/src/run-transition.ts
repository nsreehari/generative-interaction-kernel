import {
  CompositeStateModel,
  InMemoryStateModel,
  Kernel,
  unwrap,
  validateJsonValue,
  type Enveloped,
  type ExecutableProgramDefinition,
  type GIKEvent,
  type Json,
  type Orchestrator,
  type OrchestratorEffect,
  type OrchestratorResult,
  type CompletedWithinRun,
  type PatchOp,
  type ProjectedVocabularyManifest,
  type StateModel,
  initialSourceRunState,
  type GraphNodeExecutor,
  type BlueprintRunState,
} from "@gik/kernel";
import {
  evaluateCell,
  resolveDeclarativeFormInitialValue,
  validateDeclarativeFormValues,
  type CellSourceEffect,
  type EvaluatorCellDefinition,
} from "@gik/evaluators";
import { assembleBlueprint } from "./blueprint";
import { compileCellTopology } from "./cells";
import { composeCellProgram } from "./cell-projection";
import { lowerWithFixedMetaGraph } from "./fixed-lowering-meta-graph";
import { loadBlueprint } from "./resolution";
import { admitBlueprintPatch, applyBlueprintPatch } from "./structure-patch";
import type {
  BlueprintArtifact,
  BlueprintPatch,
  BlueprintPatchOrigin,
  BlueprintReferenceResolver,
  CellDefinition,
} from "./types";

export type ExternalContext = Readonly<Record<string, Json>>;

export interface EvaluateBlueprintCellInput {
  blueprint: BlueprintArtifact;
  state: Record<string, Json>;
  cell: CellDefinition;
  externalContext?: ExternalContext;
  resolveBlueprint?: BlueprintReferenceResolver;
}

export interface EvaluateBlueprintCellIdInput {
  blueprint: BlueprintArtifact;
  state: Record<string, Json>;
  cellId: string;
  externalContext?: ExternalContext;
}

export interface EvaluateBlueprintCellResult {
  status: "evaluated" | "blocked";
  materializedProgramCell: CellDefinition;
  missingInputs: string[];
  computed: Record<string, Json>;
  outputs: Record<string, Json>;
  effects: CellSourceEffect[];
}
export function resolveBlueprintInterfaceOutputs(
  blueprint: BlueprintArtifact,
  tokens: Readonly<Record<string, { status: string; value?: Json }>>,
): Record<string, Json> {
  return Object.fromEntries(Object.entries(blueprint.payload.interface?.outputs ?? {}).flatMap(
    ([token, port]) => {
      const graphToken = tokens[port.from ?? token];
      return graphToken?.status === "available"
        ? [[token, structuredClone(graphToken.value ?? null)]]
        : [];
    },
  ));
}

function flattenState(value: Json, prefix = "", result: Record<string, Json> = {}): Record<string, Json> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (prefix) result[prefix] = value;
    for (const [key, child] of Object.entries(value)) {
      flattenState(child, prefix ? `${prefix}.${key}` : key, result);
    }
  } else if (prefix) {
    result[prefix] = value;
  }
  return result;
}

export interface MaterializedBlueprint {
  readonly gik: "0.1";
  readonly type: "materialized-blueprint";
  readonly payload: {
    readonly terminalBlueprint: BlueprintArtifact;
    readonly externalContext: Record<string, Json>;
    readonly vocabulary: Enveloped<ProjectedVocabularyManifest>;
    readonly program: Enveloped<ExecutableProgramDefinition>;
    readonly initialState: Record<string, Json>;
  };
}

function resolveStateToken(
  state: Record<string, Json>,
  token: string,
): { found: boolean; value?: Json } {
  if (Object.prototype.hasOwnProperty.call(state, token)) {
    return { found: true, value: structuredClone(state[token]) };
  }
  let value: Json = state;
  for (const segment of token.split(".")) {
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || !Object.prototype.hasOwnProperty.call(value, segment)) return { found: false };
    value = value[segment];
  }
  return { found: true, value: structuredClone(value) };
}

function resolveBlueprintRunState(value: Json | undefined): BlueprintRunState {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !value.cells || typeof value.cells !== "object" || Array.isArray(value.cells)) {
    return { cells: {} };
  }
  return value as unknown as BlueprintRunState;
}

/** Purely materialize and inspect one candidate Cell without executing effects or consequences. */
export function evaluateBlueprintCell({
  blueprint,
  state,
  cell,
  externalContext,
  resolveBlueprint,
}: EvaluateBlueprintCellInput): EvaluateBlueprintCellResult {
  if (!blueprint.payload.cells?.[cell.id]) {
    throw new Error(`Blueprint '${blueprint.payload.id}' has no Cell '${cell.id}'`);
  }
  const candidateBlueprint = structuredClone(blueprint);
  candidateBlueprint.payload.cells![cell.id] = structuredClone(cell);
  const materialized = materializeBlueprint({
    blueprint: candidateBlueprint,
    externalContext,
    resolveBlueprint,
  });
  const materializedProgramCell = materialized.payload.terminalBlueprint.payload.cells?.[cell.id];
  if (!materializedProgramCell) {
    throw new Error(`Materialized Blueprint '${blueprint.payload.id}' has no Cell '${cell.id}'`);
  }

  const inputs: Record<string, Json> = {};
  const missingInputs: string[] = [];
  for (const input of materializedProgramCell.inputs ?? []) {
    const resolved = resolveStateToken(state, input.token);
    if (resolved.found) inputs[input.as ?? input.token] = resolved.value ?? null;
    else if (input.required !== false) missingInputs.push(input.token);
  }

  const runState = state.blueprintRunState;
  const cells = runState && typeof runState === "object" && !Array.isArray(runState)
    ? runState.cells
    : undefined;
  const cellRunState = cells && typeof cells === "object" && !Array.isArray(cells)
    ? cells[cell.id]
    : undefined;
  const sourceValues = cellRunState && typeof cellRunState === "object" && !Array.isArray(cellRunState)
    && cellRunState.sourceValues && typeof cellRunState.sourceValues === "object"
    && !Array.isArray(cellRunState.sourceValues)
    ? structuredClone(cellRunState.sourceValues as Record<string, Json>)
    : {};

  if (missingInputs.length > 0) {
    return {
      status: "blocked",
      materializedProgramCell: structuredClone(materializedProgramCell),
      missingInputs,
      computed: {},
      outputs: {},
      effects: [],
    };
  }
  const result = evaluateCell({
    materializedProgramCell: materializedProgramCell as EvaluatorCellDefinition,
    inputs,
    settledSources: sourceValues,
    systemContext: {
      blueprintRunState: resolveBlueprintRunState(state.blueprintRunState),
      cellId: cell.id,
    },
  });
  return {
    status: "evaluated",
    materializedProgramCell: structuredClone(materializedProgramCell),
    missingInputs: [],
    ...result,
  };
}

/** Purely inspect an authored Cell by id through the same materialized preflight path. */
export function evaluateBlueprintCellId({
  blueprint,
  state,
  cellId,
  externalContext,
}: EvaluateBlueprintCellIdInput): EvaluateBlueprintCellResult {
  const cell = blueprint.payload.cells?.[cellId];
  if (!cell) throw new Error(`Blueprint '${blueprint.payload.id}' has no Cell '${cellId}'`);
  return evaluateBlueprintCell({ blueprint, state, cell, externalContext });
}

export interface MaterializeBlueprintInput {
  blueprint: BlueprintArtifact;
  externalContext?: ExternalContext;
  resolveBlueprint?: BlueprintReferenceResolver;
}

export interface PrepareBlueprintProgramOptions {
  context?: Record<string, Json>;
  externalContext?: ExternalContext;
  resolveBlueprint?: BlueprintReferenceResolver;
}

export interface PreparedBlueprintProgram {
  blueprint: BlueprintArtifact;
  externalContext: Record<string, Json>;
  vocabulary: Enveloped<ProjectedVocabularyManifest>;
  program: Enveloped<ExecutableProgramDefinition>;
  initialState: Record<string, Json>;
}

export class BlueprintExternalContextValidationError extends Error {
  constructor(
    readonly blueprintId: string,
    readonly errors: readonly { detail: string; code?: string; node?: string }[],
  ) {
    super(`Invalid external context for Blueprint '${blueprintId}': ${errors.map(({ detail }) => detail).join("; ")}`);
    this.name = "BlueprintExternalContextValidationError";
  }
}

export function resolveBlueprintExternalContext(
  blueprint: BlueprintArtifact,
  externalContext: ExternalContext = {},
): Record<string, Json> {
  const effective = resolveDeclarativeFormInitialValue(
    blueprint.payload.contextFormSpec,
    externalContext,
  );
  const fields = blueprint.payload.contextFormSpec?.fields;
  if (!fields) return effective;
  const report = validateDeclarativeFormValues(fields, effective);
  if (!report.ok) {
    throw new BlueprintExternalContextValidationError(blueprint.payload.id, report.errors);
  }
  return effective;
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
  syncExternal?: boolean;
  contexts?: Record<string, StateModel>;
  createOrchestrator?: (state: StateModel) => Orchestrator;
  sourceSettlements?: readonly { effect: OrchestratorEffect; result: OrchestratorResult }[];
  requestSettlements?: readonly { effect: OrchestratorEffect; result: OrchestratorResult }[];
  serviceSettlements?: readonly OrchestratorResult[];
  blueprintPatches?: readonly BlueprintPatch[];
}

export interface BlueprintTransitionResult {
  state: Record<string, Json>;
  outputs?: Record<string, Json>;
  effects?: readonly OrchestratorEffect[];
  completedWithinRun?: readonly CompletedWithinRun[];
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
  const externalContext = resolveBlueprintExternalContext(source, options.externalContext);
  const assembled = assembleBlueprint(source, options.resolveBlueprint);
  const blueprint = assembled.payload.recipes.length > 0
    ? lowerWithFixedMetaGraph(assembled, externalContext)
    : assembled;
  if (!blueprint.payload.cells) throw new Error(`Blueprint '${blueprint.payload.id}' has no executable Cells`);
  const runtime = blueprint.payload.runtime;
  if (!runtime) throw new Error(`Blueprint '${blueprint.payload.id}' has no runtime declaration`);

  const resolved = loadBlueprint(blueprint);
  const definition = {
    cells: blueprint.payload.cells,
    ...(blueprint.payload.projections?.presentation
      ? { projections: { presentation: blueprint.payload.projections.presentation } }
      : {}),
  };
  const vocabulary: ProjectedVocabularyManifest = {
    version: `${blueprint.payload.id}/${blueprint.payload.version}`,
    expression: runtime.expression,
    namespaces: [...new Set([...(runtime.namespaces ?? []), "blueprintRunState"])],
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
    externalContext,
    vocabulary: { gik: "0.1", type: "vocabulary", payload: vocabulary },
    program: { gik: "0.1", type: "program", payload: program },
    initialState: mergeJsonRecords(
      mergeJsonRecords(structuredClone(runtime.state ?? {}), initialSeed(options.context)),
      {
        blueprintRunState: {
          cells: Object.fromEntries(Object.entries(blueprint.payload.cells).map(([cellId, cell]) => [cellId, {
            sources: (cell.sources ?? []).map(({ id }) => ({ ...initialSourceRunState(id) })),
            ...(cell.sources?.length ? { sourceValues: {} } : {}),
          }])),
        },
      },
    ),
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
  for (const namespace of ["blueprintRunState", "cellRunState"]) {
    if (Object.prototype.hasOwnProperty.call(blueprint.payload.runtime.state ?? {}, namespace)) {
      throw new Error(`Blueprint '${blueprint.payload.id}' reserves state namespace '${namespace}' for Cell execution state`);
    }
  }
  const prepared = prepareBlueprintProgram(blueprint, { externalContext, resolveBlueprint });
  return {
    gik: "0.1",
    type: "materialized-blueprint",
    payload: {
      terminalBlueprint: structuredClone(prepared.blueprint),
      externalContext: structuredClone(prepared.externalContext),
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

  apply(ops: PatchOp[]): void {
    const idempotent = ops.every((op) =>
      op.op === "set" && JSON.stringify(this.get(op.path)) === JSON.stringify(op.value));
    if (!idempotent) throw new Error("externalContext is read-only");
  }
}

export function createCellGraphNodeExecutor(state: StateModel): GraphNodeExecutor {
  return async (node, nodeInputs) => {
    if (node.operation.kind !== "extension" || node.operation.name !== "evaluate-cell") {
      throw new Error(`Unknown Blueprint graph extension '${node.operation.kind === "extension" ? node.operation.name : node.operation.kind}'`);
    }
    const { __sources, ...inputs } = nodeInputs;
    const settledSources = __sources && typeof __sources === "object" && !Array.isArray(__sources)
      ? __sources as Record<string, Json>
      : {};
    const cellId = String((node.operation.config as { id?: unknown }).id ?? node.id);
    const result = evaluateCell({
      materializedProgramCell: node.operation.config as unknown as EvaluatorCellDefinition,
      inputs,
      settledSources,
      systemContext: {
        blueprintRunState: resolveBlueprintRunState(state.get("blueprintRunState")),
        cellId,
      },
    });
    return {
      outputs: result.outputs,
      operations: result.operations,
      effects: result.effects.map(({ cellId, source, sourceInputs }) => ({
        kind: "invoke" as const,
        node: node.id,
        control: {
          tool: source.operation,
          serviceRef: source.service,
          sourceId: source.id,
          sourceCellId: cellId,
          sourceInputs,
          ...(source.input ? { sourceInputTransform: source.input } : {}),
          ...(source.output ? { sourceOutputTransform: source.output } : {}),
        },
        data: {},
      })),
    };
  };
}

export async function runMaterializedTransition({
  state,
  materializedBlueprint,
  events,
  syncExternal,
  contexts,
  createOrchestrator,
  sourceSettlements = [],
  requestSettlements = [],
  serviceSettlements = [],
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
    executeGraphExtension: createCellGraphNodeExecutor(runtimeStore),
    ...(createOrchestrator ? { orchestrator: createOrchestrator(runtimeStore) } : {}),
  });
  kernel.init();
  const initialRunState = materializedBlueprint.payload.initialState.blueprintRunState;
  const transitionState = Object.prototype.hasOwnProperty.call(state, "blueprintRunState")
    ? state
    : {
        ...state,
        ...(initialRunState === undefined ? {} : { blueprintRunState: structuredClone(initialRunState) }),
      };
  store.apply(Object.entries(transitionState).map(([path, value]) => ({ op: "set", path, value })));
  store.apply(serviceSettlements.flatMap((settlement) => settlement.ops ?? []));
  const completedWithinRun: CompletedWithinRun[] = [];
  const transitionEvents = [
    ...events,
    ...serviceSettlements.flatMap((settlement) => settlement.events ?? []),
  ];

  const shouldSyncExternal = syncExternal
    ?? (transitionEvents.length === 0
      && sourceSettlements.length === 0
      && requestSettlements.length === 0
      && serviceSettlements.length === 0);
  if (shouldSyncExternal) {
    const patch = await kernel.syncExternal();
    completedWithinRun.push(...(patch.completedWithinRun ?? []));
  }
  else if (serviceSettlements.length > 0) {
    const patch = await kernel.syncExternal();
    completedWithinRun.push(...(patch.completedWithinRun ?? []));
  }
  else kernel.hydrateGraph(flattenState(store.snapshot()));
  for (const settlement of sourceSettlements) {
    const patch = await kernel.settleSourceEffect(
      structuredClone(settlement.effect),
      structuredClone(settlement.result),
    );
    completedWithinRun.push(...(patch.completedWithinRun ?? []));
  }
  if (sourceSettlements.length > 0) {
    const patch = await kernel.syncExternal();
    completedWithinRun.push(...(patch.completedWithinRun ?? []));
  }
  for (const settlement of requestSettlements) {
    const patch = await kernel.settleRequestEffect(
      structuredClone(settlement.effect),
      structuredClone(settlement.result),
    );
    completedWithinRun.push(...(patch.completedWithinRun ?? []));
  }
  for (const event of transitionEvents) {
    const cell = materializedBlueprint.payload.terminalBlueprint.payload.cells?.[event.node];
    const contract = cell?.events?.[event.name];
    if (cell && !contract) {
      throw new Error(`Cell '${event.node}' received undeclared event '${event.name}'`);
    }
    if (contract) {
      validateJsonValue(
        contract.payloadSchema,
        event.payload ?? {},
        `Invalid payload for Cell event '${event.node}.${event.name}'`,
      );
    }
    const patch = await kernel.dispatch(structuredClone(event));
    completedWithinRun.push(...(patch.completedWithinRun ?? []));
  }
  await kernel.whenIdle();

  const effects = kernel.effectsSince(-1).map(({ effect }) => effect);
  const hasInterfaceOutputs = Object.keys(
    materializedBlueprint.payload.terminalBlueprint.payload.interface?.outputs ?? {},
  ).length > 0;
  const outputs = hasInterfaceOutputs && unwrap(program).graph
    ? resolveBlueprintInterfaceOutputs(
        materializedBlueprint.payload.terminalBlueprint,
        kernel.execution().tokens,
      )
    : {};
  return {
    state: structuredClone(store.snapshot()),
    ...(completedWithinRun.length > 0 ? { completedWithinRun } : {}),
    ...(effects.length > 0 ? { effects } : {}),
    ...(Object.keys(outputs).length > 0 ? { outputs } : {}),
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