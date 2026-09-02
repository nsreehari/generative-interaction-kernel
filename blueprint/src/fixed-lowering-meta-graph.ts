import { evalSyncJsonata } from "gik-evaluators";
import {
  Kernel,
  SyncJsonataExpressionProvider,
  type ExecutableProgramDefinition,
  type ExecutionSnapshot,
  type GraphNodeExecutionOutcome,
  type Json,
  type ProgramNode,
} from "gik-kernel";
import { createBlueprint, validateBlueprintArtifact } from "./blueprint";
import { resolveBlueprintExecution, type ResolvedBlueprintStage } from "./execution";
import {
  allowedCapabilitiesAtTier,
  collectProjectionCapabilityUses,
  resolveProjectionVocabulary,
} from "./projection-vocabulary";
import type {
  BlueprintArtifact,
  BlueprintImplementationProgram,
  BlueprintRepresentation,
  BlueprintRepresentationDecorator,
  CellDefinition,
  CellSource,
  ProjectionLoweringRecipeDefinition,
  ProjectionTierDefinition,
  ServiceLoweringRecipeDefinition,
  TierDefinition,
} from "./types";

const FIXED_LOWERING_META_GRAPH = createBlueprint({
  id: "gik-fixed-lowering-meta-graph",
  kind: "lowering-meta-graph",
  version: "1",
  structureMode: "fixed",
  serviceTiers: [{ id: "runtime", kind: "runtime-document" }],
  serviceRecipes: [],
  projectionTiers: [{ id: "runtime", kind: "runtime-document", capabilities: [] }],
  projectionRecipes: [],
  runtime: {
    state: { lowering: {} },
  },
  cells: {
    "resolve-stage": {
      id: "resolve-stage",
      potentialViews: { primary: { capability: "compiler:resolve-stage", region: "root" } },
      inputs: [{ token: "lowering:source", as: "source" }],
      compute: [{ id: "stage", expression: "inputs.source", assign: "stage", dependencies: ["inputs.source"] }],
      outputs: [{ token: "lowering:stage", from: "computed.stage" }],
      metadata: { operation: "resolve-lowering-chain" },
    },
    "apply-vocabulary-patch": {
      id: "apply-vocabulary-patch",
      potentialViews: { primary: { region: "children" } },
      inputs: [{ token: "lowering:stage", as: "stage" }],
      compute: [{ id: "artifact", expression: "inputs.stage", assign: "artifact", dependencies: ["inputs.stage"] }],
      outputs: [{ token: "lowering:artifact", from: "computed.artifact" }],
      metadata: { operation: "apply-lowering-chain" },
    },
    "emit-blueprint": {
      id: "emit-blueprint",
      potentialViews: { primary: { region: "children" } },
      inputs: [{ token: "lowering:artifact", as: "artifact" }],
      compute: [{ id: "compiled", expression: "inputs.artifact", assign: "compiled", dependencies: ["inputs.artifact"] }],
      outputs: [{ token: "compiled:artifact", from: "computed.compiled" }],
      metadata: { operation: "emit-blueprint", validation: "blueprint" },
    },
  },
  presentation: {
    slots: ["root", { id: "children", region: "root" }],
    root: "root",
    allowedCapabilities: ["compiler:resolve-stage"],
  },
});

export function fixedLoweringMetaGraphBlueprint(): BlueprintArtifact {
  return structuredClone(FIXED_LOWERING_META_GRAPH);
}

export function lowerWithFixedMetaGraph(
  source: BlueprintArtifact,
  externalContext: Readonly<Record<string, Json>> = {},
): BlueprintArtifact {
  return runFixedLoweringMetaGraph(source, externalContext).blueprint;
}

export interface FixedLoweringMetaGraphResult {
  blueprint: BlueprintArtifact;
  execution: ExecutionSnapshot;
}

export function runFixedLoweringMetaGraph(
  source: BlueprintArtifact,
  externalContext: Readonly<Record<string, Json>> = {},
): FixedLoweringMetaGraphResult {
  const metaGraph = fixedLoweringMetaGraphBlueprint();
  const resolved = resolveBlueprintExecution(source);
  if (resolved.service.stages.length === 0 && resolved.projection.stages.length === 0) {
    return {
      blueprint: structuredClone(source),
      execution: {
        topologyVersion: 0,
        status: "quiescent",
        tokens: {},
        nodes: {},
        readyNodes: [],
        runningInvocations: [],
      },
    };
  }

  const expression = new SyncJsonataExpressionProvider();
  const kernel = new Kernel(
    { gik: "0.1", type: "vocabulary", payload: { version: `${metaGraph.payload.id}/${metaGraph.payload.version}` } },
    { gik: "0.1", type: "program", payload: compileFixedLoweringProgram(metaGraph) },
    {
      expression,
      predicateExpression: new SyncJsonataExpressionProvider({ safe: true }),
      executeGraphExtension: executeFixedLoweringOperation,
    },
  );
  kernel.init();
  const transition = kernel.publishSync({
    "lowering:source": structuredClone({ artifact: source, externalContext }) as unknown as Json,
  });
  const compiled = transition.execution.tokens["compiled:artifact"]?.value;
  if (!compiled) throw new Error("Fixed lowering meta-graph emitted no terminal Blueprint");
  validateBlueprintArtifact(compiled);
  return { blueprint: compiled, execution: transition.execution };
}

function compileFixedLoweringProgram(metaGraph: BlueprintArtifact): ExecutableProgramDefinition {
  const cells = metaGraph.payload.cells ?? {};
  const node = (
    cellId: string,
    inputName: string,
    inputToken: string,
    outputName: string,
    outputToken: string,
  ): ProgramNode => {
    const cell = cells[cellId];
    const operation = cell?.metadata?.operation;
    if (typeof operation !== "string") {
      throw new Error(`Fixed lowering meta-graph Cell '${cellId}' has no registered operation`);
    }
    return {
      id: cellId,
      inputs: { [inputName]: inputToken },
      outputs: { [outputName]: outputToken },
      operation: { kind: "extension", name: operation },
    };
  };
  return {
    graph: {
      inputs: ["lowering:source"],
      outputs: ["compiled:artifact"],
      nodes: [
        node("resolve-stage", "source", "lowering:source", "stage", "lowering:stage"),
        node("apply-vocabulary-patch", "stage", "lowering:stage", "artifact", "lowering:artifact"),
        node("emit-blueprint", "artifact", "lowering:artifact", "compiled", "compiled:artifact"),
      ],
    },
  };
}

interface LoweringChainInput {
  artifact: BlueprintArtifact;
  externalContext: Readonly<Record<string, Json>>;
}

interface ResolvedLoweringChain extends LoweringChainInput {
  serviceStages: ResolvedBlueprintStage<TierDefinition, ServiceLoweringRecipeDefinition>[];
  projectionStages: ResolvedBlueprintStage<
    ProjectionTierDefinition,
    ProjectionLoweringRecipeDefinition
  >[];
  serviceTerminalTier: TierDefinition;
  projectionTerminalTier: ProjectionTierDefinition;
}

interface AppliedLoweringChain {
  artifact: BlueprintArtifact;
  serviceTerminalTier: TierDefinition;
  projectionTerminalTier: ProjectionTierDefinition;
}

function executeFixedLoweringOperation(
  node: ProgramNode,
  inputs: Record<string, Json>,
): GraphNodeExecutionOutcome {
  switch (node.operation.kind === "extension" ? node.operation.name : undefined) {
    case "resolve-lowering-chain": {
      const source = inputs.source as unknown as LoweringChainInput;
      const resolved = resolveBlueprintExecution(source.artifact);
      return {
        outputs: {
          stage: structuredClone({
            ...source,
            serviceStages: resolved.service.stages,
            projectionStages: resolved.projection.stages,
            serviceTerminalTier: resolved.service.terminalTier,
            projectionTerminalTier: resolved.projection.terminalTier,
          }) as unknown as Json,
        },
      };
    }
    case "apply-lowering-chain": {
      const chain = inputs.stage as unknown as ResolvedLoweringChain;
      let artifact = structuredClone(chain.artifact);
      // Deterministic application order: the complete service chain first, then the complete
      // projection chain. Projection therefore always observes the already-selected terminal
      // implementation, while service selection can never observe projected presentation. Neither
      // axis' *resolution* depends on the other; only this application order is shared.
      for (const { recipe } of chain.serviceStages) {
        artifact = applyServiceRecipe(artifact, recipe, chain.externalContext);
      }
      const projectionTierChain = chain.projectionStages.length > 0
        ? [chain.projectionStages[0].fromTier, ...chain.projectionStages.map(({ toTier }) => toTier)]
        : [chain.projectionTerminalTier];
      const projectionVocabulary = artifact.payload.presentation
        ? resolveProjectionVocabulary(
          artifact.payload.projectionTiers,
          artifact.payload.presentation.allowedCapabilities,
        )
        : undefined;
      for (const { recipe, toTier } of chain.projectionStages) {
        artifact = applyProjectionRecipe(artifact, recipe, chain.externalContext);
        if (projectionVocabulary) {
          validateProjectionStageCapabilities(
            artifact,
            projectionTierChain,
            toTier.id,
            projectionVocabulary,
            recipe.id,
          );
        }
      }
      return {
        outputs: {
          artifact: structuredClone({
            artifact,
            serviceTerminalTier: chain.serviceTerminalTier,
            projectionTerminalTier: chain.projectionTerminalTier,
          }) as unknown as Json,
        },
      };
    }
    case "emit-blueprint": {
      const applied = inputs.artifact as unknown as AppliedLoweringChain;
      const terminal = structuredClone(applied.artifact);
      if (terminal.payload.presentation) {
        terminal.payload.presentation.allowedCapabilities = [
          ...new Set(collectProjectionCapabilityUses(terminal.payload.cells ?? {}).map(({ capability }) => capability)),
        ].sort();
      }
      terminal.payload.serviceTiers = [structuredClone(applied.serviceTerminalTier)];
      terminal.payload.serviceRecipes = [];
      terminal.payload.projectionTiers = [structuredClone(applied.projectionTerminalTier)];
      terminal.payload.projectionRecipes = [];
      validateBlueprintArtifact(terminal);
      return { outputs: { compiled: terminal as unknown as Json } };
    }
    default:
      throw new Error(`Unknown fixed lowering operation for Cell '${node.id}'`);
  }
}

/** Applies one projection-axis stage: it selects named views and the presentation skeleton, and
 * never reads or writes `sources`, `compute`, `behavior`, or `services`. */
function applyProjectionRecipe(
  source: BlueprintArtifact,
  recipe: ProjectionLoweringRecipeDefinition,
  externalContext: Readonly<Record<string, Json>>,
): BlueprintArtifact {
  const representations = new Map(recipe.representations.map((representation) => [representation.id, representation]));
  const selected = recipe.representations.find((representation) => representation.when
    ? evalSyncJsonata(representation.when, { externalContext } as Json) === true
    : false) ?? representations.get(recipe.fallback);
  if (!selected) throw new Error(`Blueprint projection recipe '${recipe.id}' has unknown fallback '${recipe.fallback}'`);

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
  let presentation = artifact.payload.presentation
    ? structuredClone(artifact.payload.presentation)
    : undefined;
  for (const representation of chain) {
    for (const [cellId, viewNames] of Object.entries(representation.removeViews ?? {})) {
      const cell = artifact.payload.cells?.[cellId];
      if (!cell) throw new Error(`Blueprint representation '${representation.id}' references unknown Cell '${cellId}'`);
      for (const viewName of viewNames) {
        if (!cell.potentialViews?.[viewName]) {
          throw new Error(`Blueprint representation '${representation.id}' removes unknown view '${cellId}.${viewName}'`);
        }
        delete cell.potentialViews[viewName];
      }
    }
    for (const [cellId, viewsForCell] of Object.entries(representation.views ?? {})) {
      const cell = artifact.payload.cells?.[cellId];
      if (!cell) throw new Error(`Blueprint representation '${representation.id}' references unknown Cell '${cellId}'`);
      // Upsert by view name: a present entry replaces or introduces that one named view; every
      // other view already declared on the Cell is left untouched.
      cell.potentialViews = { ...(cell.potentialViews ?? {}), ...structuredClone(viewsForCell) };
    }
    if (representation.presentation) {
      const allowedCapabilities = source.payload.presentation?.allowedCapabilities
        ?? presentation?.allowedCapabilities;
      if (!allowedCapabilities) {
        throw new Error(`Blueprint representation '${representation.id}' cannot introduce presentation without authored allowedCapabilities`);
      }
      presentation = {
        ...structuredClone(representation.presentation),
        allowedCapabilities: structuredClone(allowedCapabilities),
      };
    }
    if (representation.presentationAppend) {
      if (!presentation) throw new Error(`Blueprint representation '${representation.id}' cannot append to a missing presentation`);
      presentation = { ...presentation, slots: [...presentation.slots, ...structuredClone(representation.presentationAppend)] };
    }
  }
  for (const representation of chain) {
    for (const decorator of representation.decorators ?? []) {
      applyRepresentationDecorator(artifact, representation.id, decorator, externalContext);
    }
  }
  if (!presentation) throw new Error(`Blueprint representation '${selected.id}' produced no presentation`);
  artifact.payload.presentation = presentation;
  return artifact;
}

function validateProjectionStageCapabilities(
  artifact: BlueprintArtifact,
  orderedTiers: readonly TierDefinition[],
  targetTierId: string,
  vocabulary: ReturnType<typeof resolveProjectionVocabulary>,
  recipeId: string,
): void {
  const allowed = allowedCapabilitiesAtTier(
    orderedTiers.map((tier) => ({
      ...tier,
      capabilities: artifact.payload.projectionTiers.find(({ id }) => id === tier.id)?.capabilities ?? [],
    })),
    targetTierId,
    vocabulary,
  );
  for (const use of collectProjectionCapabilityUses(artifact.payload.cells ?? {})) {
    if (!allowed.has(use.capability)) {
      throw new Error(
        `Projection recipe '${recipeId}' left capability '${use.capability}' on Cell '${use.cellId}' view '${use.viewName}' ${use.location}; it is not valid at or below target tier '${targetTierId}'`,
      );
    }
  }
}

function applyRepresentationDecorator(
  artifact: BlueprintArtifact,
  representationId: string,
  decorator: BlueprintRepresentationDecorator,
  externalContext: Readonly<Record<string, Json>>,
): void {
  for (const decoration of [decorator.before, decorator.after]) {
    if (decoration) declareDecorationCapability(artifact, representationId, decoration.capability);
  }
  const cells = Object.values(artifact.payload.cells ?? {});
  const selected = evalSyncJsonata(decorator.select, {
    blueprint: artifact,
    payload: artifact.payload,
    cells,
    externalContext,
  } as unknown as Json);
  const cellIds = typeof selected === "string"
    ? [selected]
    : Array.isArray(selected) && selected.every((cellId) => typeof cellId === "string")
      ? selected
      : selected === null
        ? []
        : undefined;
  if (!cellIds) {
    throw new Error(`Blueprint representation '${representationId}' decorator select must return Cell id(s)`);
  }
  for (const cellId of new Set(cellIds)) {
    const cell = artifact.payload.cells?.[cellId];
    if (!cell) {
      throw new Error(`Blueprint representation '${representationId}' decorator selected unknown Cell '${cellId}'`);
    }
    const viewEntries = Object.entries(cell.potentialViews ?? {});
    if (viewEntries.length === 0) {
      throw new Error(`Blueprint representation '${representationId}' decorator selected Cell '${cellId}' without a view`);
    }
    // A decorator selects a Cell, not one named view; it decorates every potential view the
    // selected Cell currently carries.
    for (const [viewName, view] of viewEntries) {
      cell.potentialViews![viewName] = {
        ...view,
        ...(decorator.before
          ? { before: [...(view.before ?? []), structuredClone(decorator.before)] }
          : {}),
        ...(decorator.after
          ? { after: [...(view.after ?? []), structuredClone(decorator.after)] }
          : {}),
      };
    }
  }
}

function declareDecorationCapability(
  artifact: BlueprintArtifact,
  representationId: string,
  capability: string,
): void {
  const separator = capability.indexOf(":");
  if (separator <= 0 || separator === capability.length - 1) {
    throw new Error(
      `Blueprint representation '${representationId}' decorator capability '${capability}' must use alias:name`,
    );
  }
  const alias = capability.slice(0, separator);
  const name = capability.slice(separator + 1);
  const runtime = artifact.payload.runtime;
  if (!runtime) throw new Error(`Blueprint '${artifact.payload.id}' has no runtime declaration`);
  const projectionViews = runtime.externals?.projectionViews ?? {};
  const existing = projectionViews[alias];
  projectionViews[alias] = {
    from: existing?.from ?? alias,
    use: [...new Set([...(existing?.use ?? []), name])],
  };
  runtime.externals = { ...runtime.externals, projectionViews };
}

/** Applies one service-axis stage: it selects the contract-compatible Cell implementation seam —
 * `sources`, `compute`, `behavior`, plus top-level `services` declarations — and never reads or
 * writes `potentialViews` or `presentation`. */
function applyServiceRecipe(
  source: BlueprintArtifact,
  recipe: ServiceLoweringRecipeDefinition,
  externalContext: Readonly<Record<string, Json>>,
): BlueprintArtifact {
  const artifact = structuredClone(source);
  const programs = new Map(recipe.implementationPrograms.map((program) => [program.id, program]));
  const selected = recipe.implementationPrograms.find((program) => program.when
    ? evalSyncJsonata(program.when, { externalContext } as Json) === true
    : false) ?? programs.get(recipe.fallback);
  if (!selected) {
    throw new Error(`Blueprint service recipe '${recipe.id}' has unknown fallback '${recipe.fallback}'`);
  }

  applyCellImplementationOverrides(artifact, selected);
  applyServiceImplementationOverrides(artifact, selected);
  return artifact;
}

function applyCellImplementationOverrides(
  artifact: BlueprintArtifact,
  program: BlueprintImplementationProgram,
): void {
  for (const [cellId, override] of Object.entries(program.cells ?? {})) {
    const cell = artifact.payload.cells?.[cellId];
    if (!cell) throw new Error(`Blueprint implementation program '${program.id}' references unknown Cell '${cellId}'`);
    if (override.sources) assertStableSourceContracts(artifact, program.id, cell, override.sources);
    if (override.behavior) assertDeclaredEventHandlers(program.id, cell, override.behavior);
    if (override.sources) cell.sources = structuredClone(override.sources);
    if (override.compute) cell.compute = structuredClone(override.compute);
    if (override.behavior) cell.behavior = structuredClone(override.behavior);
  }
}

function assertDeclaredEventHandlers(
  programId: string,
  cell: CellDefinition,
  behavior: NonNullable<CellDefinition["behavior"]>,
): void {
  const undeclared = Object.keys(behavior.on ?? {}).filter((event) => !cell.events?.[event]);
  if (undeclared.length > 0) {
    throw new Error(
      `Blueprint implementation program '${programId}' handles undeclared event(s) ${undeclared.join(", ")} for Cell '${cell.id}'`,
    );
  }
}

/** A source's contract is never authored directly -- it is always the resolved operation's
 * contract from `services`. Stability across an implementation program's override is therefore
 * checked by resolving both sides against the same services snapshot, not by comparing two
 * independently authored strings. */
function resolveSourceContract(
  artifact: BlueprintArtifact,
  programId: string,
  cellId: string,
  source: CellSource,
): string {
  const service = artifact.payload.services?.[source.service];
  const contract = service?.operations?.[source.operation]?.contract;
  if (!contract) {
    throw new Error(
      `Blueprint implementation program '${programId}' references unresolved operation '${source.operation}' on service '${source.service}' for Cell '${cellId}'`,
    );
  }
  return contract;
}

function assertStableSourceContracts(
  artifact: BlueprintArtifact,
  programId: string,
  cell: CellDefinition,
  sources: NonNullable<CellDefinition["sources"]>,
): void {
  const authored = new Map((cell.sources ?? []).map((source) =>
    [source.id, resolveSourceContract(artifact, programId, cell.id, source)]));
  const selected = new Map(sources.map((source) =>
    [source.id, resolveSourceContract(artifact, programId, cell.id, source)]));
  if (authored.size !== selected.size
    || [...authored].some(([id, contract]) => selected.get(id) !== contract)) {
    throw new Error(`Blueprint implementation program '${programId}' changes source contracts for Cell '${cell.id}'`);
  }
}

function applyServiceImplementationOverrides(
  artifact: BlueprintArtifact,
  program: BlueprintImplementationProgram,
): void {
  for (const [serviceId, declaration] of Object.entries(program.services ?? {})) {
    const authored = artifact.payload.services?.[serviceId];
    if (!authored) throw new Error(`Blueprint implementation program '${program.id}' references unknown service '${serviceId}'`);
    assertStableServiceContracts(program.id, serviceId, authored, declaration);
    artifact.payload.services = {
      ...artifact.payload.services,
      [serviceId]: structuredClone(declaration),
    };
  }
}

function assertStableServiceContracts(
  programId: string,
  serviceId: string,
  authored: { operations?: unknown },
  selected: { operations?: unknown },
): void {
  if (!isOperationMap(authored.operations) || !isOperationMap(selected.operations)) {
    throw new Error(`Blueprint implementation program '${programId}' requires service declarations for '${serviceId}'`);
  }
  const authoredContracts = new Map(Object.entries(authored.operations).map(([id, operation]) => [id, operation.contract]));
  const selectedContracts = new Map(Object.entries(selected.operations).map(([id, operation]) => [id, operation.contract]));
  if (authoredContracts.size !== selectedContracts.size
    || [...authoredContracts].some(([id, contract]) => selectedContracts.get(id) !== contract)) {
    throw new Error(`Blueprint implementation program '${programId}' changes operation contracts for service '${serviceId}'`);
  }
}

function isOperationMap(value: unknown): value is Record<string, { contract: string }> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every((operation) => !!operation && typeof operation === "object" && "contract" in operation);
}
