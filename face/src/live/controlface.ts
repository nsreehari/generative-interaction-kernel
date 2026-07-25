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
  type RecordedEffect,
  type ResolvedNode,
  type StateModel,
  type TraceSink,
  type TransportBroker,
  type TransportProvider,
} from "../../../kernel/src/index";
import { checkpoint, compensate, effectsSince, getState, getTree, restore } from "./ops";
import type { ServiceProbeResult, ServiceRequestRecord } from "../services/queueface";
import type { ServiceHost } from "../services/service-host";
import type { ServiceKindDescription } from "../services/service-kinds";
import {
  compileCellTopology,
  composeCellDocument,
  assembleBlueprint,
  loadBlueprint,
  type BlueprintArtifact,
  type BlueprintReferenceResolver,
  type ResolvedBlueprint,
} from "../../../blueprint/src/index";

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
    lower: () => composeCellDocument(definition, compileCellTopology(resolved.artifact.payload.id, definition.cells)),
  };
}

type JsonRecord = Record<string, Json>;

function jsonRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function mergeJsonRecords(base: JsonRecord, overlay: JsonRecord): JsonRecord {
  const merged: JsonRecord = structuredClone(base);
  for (const [key, value] of Object.entries(overlay)) {
    const existing = merged[key];
    if (
      existing !== null
      && typeof existing === "object"
      && !Array.isArray(existing)
      && value !== null
      && typeof value === "object"
      && !Array.isArray(value)
    ) {
      merged[key] = mergeJsonRecords(existing as JsonRecord, value as JsonRecord);
      continue;
    }
    merged[key] = structuredClone(value);
  }
  return merged;
}

function resolveInitialSeed(context: Record<string, Json> | undefined): JsonRecord {
  const initialSeed = jsonRecord(context?.initialSeed) ?? jsonRecord(context?.freeContext);
  return initialSeed ? structuredClone(initialSeed) : {};
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
}

function runtimeFromLowering(
  definition: BlueprintSource,
  instanceId: string,
  resolved: Pick<ResolvedBlueprint, "artifact" | "services">,
  program: ProjectedProgramDefinition,
  context?: Record<string, Json>,
): BlueprintRuntime {
  const { id, version, runtime } = resolved.artifact.payload;
  if (!runtime) throw new Error(`Blueprint '${id}' has no runtime declaration`);

  const vocabulary: ProjectedVocabularyManifest = {
    version: `${id}/${version}`,
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

  return {
    blueprintId: id,
    instanceId,
    revision: version,
    definition,
    vocabulary: { gik: "0.1", type: "vocabulary", payload: vocabulary },
    program: {
      gik: "0.1",
      type: "program",
      payload: program,
    },
    state: mergeJsonRecords(structuredClone(runtime.state ?? {}), resolveInitialSeed(context)),
    children: {},
  };
}

function openAssembledBlueprint(
  source: BlueprintSource,
  options: Pick<OpenBlueprintOptions, "context" | "instanceId">,
): BlueprintRuntime {
  const instanceId = options.instanceId ?? source.payload.id;
  let runtime: BlueprintRuntime;
  if (source.payload.recipes.length > 0) {
    throw new Error(`Blueprint '${source.payload.id}' must be lowered before it is opened`);
  } else {
    const definition = defineDeclarativeBlueprint(source);
    if (!definition) {
      throw new Error(
        `Blueprint '${source.payload.id}' has no presentation projection root or lowering recipes`
      );
    }
    runtime = runtimeFromLowering(
      source,
      instanceId,
      definition.resolved,
      definition.lower(structuredClone(options.context ?? {})),
      options.context,
    );
  }

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

  constructor(
    vocabulary: Enveloped<ProjectedVocabularyManifest>,
    program: Enveloped<ProjectedProgramDefinition>,
    options: ControlFaceOptions = {}
  ) {
    this.kernel = new Kernel(vocabulary, program, {
      ...(options.state ? { state: options.state } : {}),
      ...(options.orchestrator ? { orchestrator: options.orchestrator } : {}),
      ...(options.sink ? { sink: options.sink } : {}),
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

  checkpoint(): Checkpoint {
    return checkpoint(this.kernel);
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
