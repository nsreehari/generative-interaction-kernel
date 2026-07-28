// ControlFace: the render/drive + control-plane FACE over a live bundle, and the boundary a render
// transport (SSE) binds to. Everything behind it — kernel, reducer, interpreter, broker, GIK codec —
// is internal composition; a transport binds to THIS face, never to the internal broker.
//
// Two distinct surfaces live here:
//   - the JSON tool catalogs (see ./projections/controlface and ./projections/agentface):
//     getState/getTree/emit/checkpoint/restore/effectsSince/compensate as JSON->JSON ops,
//     dispatched over the same MCP dispatcher the pure authoring tools use. The methods below are
//     the impls those tools wrap.
//     Both projections derive from the shared full catalog; AgentFace applies the agent-safe filter.
//   - the render STREAM: `attach` is streaming plumbing for SSE (it takes a live transport and returns
//     a detach handle), NOT a JSON tool. It implements `TransportBroker` so SSE plugs into the face.

import {
  Kernel,
  KernelTransportHost,
  type Checkpoint,
  type ProjectedProgramDefinition,
  type Enveloped,
  type GIKEvent,
  type Json,
  type ProjectedVocabularyManifest,
  type Orchestrator,
  type OrchestratorEffect,
  type Patch,
  type ProgramPatch,
  type RecordedEffect,
  type ResolvedNode,
  type StateModel,
  type TraceSink,
  type TransitionResult,
  type TransportBroker,
  type TransportProvider,
} from "../../../kernel/src/index";
import { checkpoint, compensate, effectsSince, getState, getTree, restore } from "./ops";
import type { ServiceProbeResult, ServiceRequestRecord } from "../services/queueface";
import type { ServiceHost } from "../services/service-host";
import type { ServiceKindDescription } from "../services/service-kinds";
import {
  compileCellTopology,
  composeCellProgram,
  assembleBlueprint,
  admitAdaptiveProgramPatch,
  admitBlueprintPatch,
  applyBlueprintPatch,
  loadBlueprint,
  prepareBlueprintProgram,
  type BlueprintArtifact,
  type BlueprintPatch,
  type BlueprintPatchDecision,
  type BlueprintPatchRequest,
  type BlueprintReferenceResolver,
  type ResolvedBlueprint,
} from "../../../blueprint/src/index";
import { diffProgram } from "../../../kernel/src/program-patch";

export interface BlueprintRuntime {
  blueprintId: string;
  instanceId: string;
  revision: string;
  definition: BlueprintSource;
  vocabulary: Enveloped<ProjectedVocabularyManifest>;
  program: Enveloped<ProjectedProgramDefinition>;
  state: Record<string, Json>;
  children: Readonly<Record<string, BlueprintRuntime>>;
}

type LoweredBlueprint = {
  resolved: Pick<ResolvedBlueprint, "artifact" | "services">;
  lower(context: Record<string, Json>): ProjectedProgramDefinition;
};

export type BlueprintSource = BlueprintArtifact;

export interface BlueprintReconfigurationResult {
  blueprint: BlueprintSource;
  programPatch?: ProgramPatch;
  transition?: TransitionResult;
}

/**
 * Resolve a zero-recipe, JSON-authored Blueprint whose Cells are already expressed as runtime
 * nodes/cells. Recipe-backed Blueprints deliberately return undefined and keep their registered
 * lowering implementation.
 */
export function defineDeclarativeBlueprint(blueprint: BlueprintSource): LoweredBlueprint | undefined {
  if (blueprint.payload.recipes.length > 0 || !blueprint.payload.cells || !blueprint.payload.projections?.presentation) return undefined;
  const definition = {
    cells: blueprint.payload.cells,
    projections: { presentation: blueprint.payload.projections.presentation },
  };
  const resolved = loadBlueprint(blueprint);

  return {
    resolved,
    lower: () => composeCellProgram(definition, compileCellTopology(resolved.artifact.payload.id, definition.cells)),
  };
}

export interface OpenBlueprintOptions {
  context?: Record<string, Json>;
  resolveBlueprint?: BlueprintReferenceResolver;
  instanceId?: string;
}

export interface ControlFaceOptions {
  /** Pre-seeded state model for the kernel (namespaces already populated). */
  state?: StateModel;
  /** Optional host effects/confirmation/router provider, including compensation handlers. */
  orchestrator?: Orchestrator;
  /** Optional trace sink for resolve/action/effect events. */
  sink?: TraceSink;
  /** Shared host service capability projected by ControlFace and QueueFace. */
  serviceHost?: ServiceHost;
  /** The source Blueprint whose structure mode governs this live runtime. */
  blueprint?: BlueprintSource;
}

function openAssembledBlueprint(
  source: BlueprintSource,
  options: Pick<OpenBlueprintOptions, "context" | "instanceId">,
): BlueprintRuntime {
  const instanceId = options.instanceId ?? source.payload.id;
  const prepared = prepareBlueprintProgram(source, { context: options.context });
  const runtime: BlueprintRuntime = {
    blueprintId: prepared.blueprint.payload.id,
    instanceId,
    revision: prepared.blueprint.payload.version,
    definition: prepared.blueprint,
    vocabulary: prepared.vocabulary,
    program: prepared.program,
    state: prepared.initialState,
    children: {},
  };

  const children = Object.fromEntries(
    Object.entries(source.payload.cells ?? {}).flatMap(([cellId, cell]) => {
      const child = cell.blueprint;
      if (!child || !("inline" in child)) return [];
      return [[cellId, openAssembledBlueprint(child.inline as BlueprintSource, {
        instanceId: `${instanceId}/cells/${cellId}`,
      })]];
    }),
  );
  return { ...runtime, children };
}

/** Open one canonical JSON-authored Blueprint without projecting the full control-plane surface. */
export function openBlueprint(
  source: BlueprintSource,
  options: OpenBlueprintOptions = {}
): BlueprintRuntime {
  const assembled = assembleBlueprint(source, options.resolveBlueprint);
  return openAssembledBlueprint(assembled, options);
}

export class ControlFace implements TransportBroker {
  /** Open a canonical JSON-authored Blueprint before constructing its live ControlFace. */
  static openBlueprint(
    source: BlueprintSource,
    options: OpenBlueprintOptions = {}
  ): BlueprintRuntime {
    return openBlueprint(source, options);
  }

  // The kernel and broker are INTERNAL composition — private so the face never leaks them to a
  // transport. Render transports bind through `attach`; drive goes through `emit`.
  private readonly kernel: Kernel;
  private readonly broker: KernelTransportHost;
  private readonly serviceHost?: ServiceHost;
  private blueprint?: BlueprintSource;

  constructor(
    vocabulary: Enveloped<ProjectedVocabularyManifest>,
    program: Enveloped<ProjectedProgramDefinition>,
    options: ControlFaceOptions = {}
  ) {
    this.blueprint = options.blueprint ? structuredClone(options.blueprint) : undefined;
    this.kernel = new Kernel(vocabulary, program, {
      ...(options.state ? { state: options.state } : {}),
      ...(options.orchestrator ? { orchestrator: options.orchestrator } : {}),
      ...(options.sink ? { sink: options.sink } : {}),
      ...(this.blueprint
        ? { admitProgramPatch: (patch: ProgramPatch) => admitAdaptiveProgramPatch(this.blueprint!, patch) }
        : {}),
    });
    this.broker = new KernelTransportHost(vocabulary, program, this.kernel);
    this.serviceHost = options.serviceHost;
  }

  /**
   * Streaming plumbing (NOT a JSON tool): attach a render connection (optional `fromRev` resume) and
   * get a detach handle. SSE binds through this; the tool catalog is the request/response surface.
   */
  attach(transport: TransportProvider, fromRev?: number): Promise<() => void> {
    return this.broker.attach(transport, fromRev);
  }

  /** Drive the kernel and broadcast the patch to every connected render client. */
  emit(event: GIKEvent): Promise<Patch> {
    return this.broker.dispatch(event);
  }

  getState(): Record<string, Json> {
    return getState(this.kernel);
  }

  getTree(): Promise<ResolvedNode> {
    return getTree(this.kernel);
  }

  getBlueprint(): BlueprintSource | undefined {
    return this.blueprint ? structuredClone(this.blueprint) : undefined;
  }

  getProgram(): ProjectedProgramDefinition {
    const program = this.kernel.program();
    if (!program.root) throw new Error("ControlFace runtime has no projected program");
    return program;
  }

  inspectBlueprintStructureChange(request: BlueprintPatchRequest): BlueprintPatchDecision {
    if (!this.blueprint) throw new Error("ControlFace has no Blueprint attached");
    return admitBlueprintPatch(this.blueprint, request);
  }

  async reconfigureBlueprint(patch: BlueprintPatch): Promise<BlueprintReconfigurationResult> {
    if (!this.blueprint) throw new Error("ControlFace has no Blueprint attached");
    const decision = admitBlueprintPatch(this.blueprint, { origin: "authorized", patch });
    if (!decision.accepted) throw new Error(`Blueprint structure change rejected: ${decision.reason}`);
    const candidate = applyBlueprintPatch(this.blueprint, decision.patch);
    const definition = defineDeclarativeBlueprint(candidate);
    if (!definition) throw new Error("Runtime Blueprint reconfiguration requires a recipe-free declarative Blueprint");
    const target = definition.lower({});
    const program = diffProgram(this.kernel.program(), target);
    const transition = program.length > 0
      ? await this.kernel.applyProgramPatch(program)
      : undefined;
    this.blueprint = candidate;
    return {
      blueprint: structuredClone(candidate),
      ...(program.length > 0 ? { programPatch: program } : {}),
      ...(transition ? { transition } : {}),
    };
  }

  checkpoint(): Checkpoint {
    return this.kernel.checkpoint({ includeProgram: this.blueprint?.payload.structureMode === "adaptive" });
  }

  restore(cp: Checkpoint): Promise<Patch> {
    return restore(this.kernel, cp);
  }

  whenIdle(): Promise<void> {
    return this.broker.whenIdle();
  }

  effectsSince(rev: number): RecordedEffect[] {
    return effectsSince(this.kernel, rev);
  }

  compensate(effects: OrchestratorEffect[]): Promise<Patch> {
    return compensate(this.kernel, effects);
  }

  describeServiceKinds(): ServiceKindDescription[] {
    return this.serviceHost?.describeKinds() ?? [];
  }

  listServiceRequests(): Promise<ServiceRequestRecord[]> {
    return this.serviceHost?.listRequests() ?? Promise.resolve([]);
  }

  probeService(serviceId: string): Promise<ServiceProbeResult> {
    if (!this.serviceHost) throw new Error("ControlFace has no ServiceHost attached");
    return this.serviceHost.probeService(serviceId);
  }

  /** Detach every connection (the caller owns any server lifecycle). */
  stop(): void {
    this.broker.stop();
  }
}
