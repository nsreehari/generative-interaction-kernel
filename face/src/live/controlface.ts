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
  type DocumentPayload,
  type Enveloped,
  type GIKEvent,
  type Json,
  type ManifestPayload,
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
  loadBlueprint,
  runProfile,
  type BlueprintArtifact,
  type CellDefinition,
  type LayerRecipe,
  type ResolvedProfile,
} from "../../../profile/src/index";
import { resolveProfileTemplate, resolveProfileTemplateResource } from "../../../profile/src/templates";

export interface BlueprintRuntime {
  blueprintId: string;
  revision: string;
  manifest: Enveloped<ManifestPayload>;
  document: Enveloped<DocumentPayload>;
  state: Record<string, Json>;
}

type LoweredBlueprint = {
  profile: Pick<ResolvedProfile, "artifact" | "services">;
  lower(context: Record<string, Json>): DocumentPayload;
};

export type BlueprintSource = BlueprintArtifact<LayerRecipe>;

/**
 * Resolve a zero-recipe, JSON-authored Blueprint whose organism is already expressed as runtime
 * nodes/cells. Recipe-backed Profiles deliberately return undefined and keep their registered
 * lowering implementation.
 */
export function defineDeclarativeBlueprint(blueprint: BlueprintSource): LoweredBlueprint | undefined {
  if (blueprint.payload.recipes.length > 0 || !blueprint.payload.organism?.root) return undefined;
  const profile = loadBlueprint<LayerRecipe>(
    blueprint,
    resolveProfileTemplateResource,
    resolveProfileTemplate,
  );
  const root = blueprint.payload.organism.root;
  const cells = blueprint.payload.organism.cells;
  const organism: CellDefinition = cells ? {
    ...root,
    edges: {
      ...root.edges,
      children: [...(root.edges?.children ?? []), ...cells],
    },
  } : root;

  return {
    profile,
    lower: () => composeCellDocument(organism, compileCellTopology(profile.artifact.payload.id, organism)),
  };
}

type JsonRecord = Record<string, Json>;
type PresentationPreset = {
  id?: string;
  actor?: string;
  role?: string;
  device?: string;
  task?: string;
  disclosure?: string;
  layout?: string;
  frame?: string;
  arrangement?: string;
  regions?: Json[];
};

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

function defaultsFromSchema(schema: unknown): JsonRecord {
  const input = jsonRecord(schema);
  const properties = jsonRecord(input?.properties);
  if (!properties) return {};
  const defaults: JsonRecord = {};
  for (const [key, declaration] of Object.entries(properties)) {
    const field = jsonRecord(declaration);
    if (field && Object.hasOwn(field, "default")) {
      defaults[key] = structuredClone(field.default as Json);
    }
  }
  return defaults;
}

function normalizePresentationPreset(preset: PresentationPreset | undefined): JsonRecord {
  if (!preset) return {};
  const context: JsonRecord = {};
  for (const key of ["id", "actor", "role", "device", "task", "disclosure", "layout", "frame", "arrangement"] as const) {
    const value = preset[key];
    if (typeof value === "string") context[key] = value;
  }
  if (Array.isArray(preset.regions)) context.regions = structuredClone(preset.regions);
  return context;
}

function presentationPresetContexts(profile: ResolvedProfile<LayerRecipe>): PresentationPreset[] {
  const presets = profile.resources.presentationPresets;
  return Array.isArray(presets) ? presets as PresentationPreset[] : [];
}

function defaultContextFor(profile: ResolvedProfile<LayerRecipe>): JsonRecord {
  const presets = presentationPresetContexts(profile);
  const preferred = presets.find((preset) => preset.id === "full-substrate") ?? presets[0];
  return normalizePresentationPreset(preferred);
}

function resolveContextFor(profile: ResolvedProfile<LayerRecipe>, context: Record<string, Json>): JsonRecord {
  const requested = context.presentationContext;
  if (requested && typeof requested === "object" && !Array.isArray(requested)) {
    return structuredClone(requested as JsonRecord);
  }
  if (typeof requested === "string") {
    return normalizePresentationPreset(
      presentationPresetContexts(profile).find((preset) => preset.id === requested)
    );
  }
  return defaultContextFor(profile);
}

export interface OpenBlueprintOptions {
  context?: Record<string, Json>;
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
  profile: Pick<ResolvedProfile, "artifact" | "services">,
  document: DocumentPayload,
  context?: Record<string, Json>,
): BlueprintRuntime {
  const { id, version, runtime } = profile.artifact.payload;
  if (!runtime) throw new Error(`Blueprint '${id}' has no runtime declaration`);

  const manifest: ManifestPayload = {
    version: `${id}/${version}`,
    expression: runtime.expression,
    namespaces: runtime.namespaces,
    contexts: runtime.contexts,
    actions: runtime.actions,
    capabilities: structuredClone(runtime.capabilities),
    externals: {
      ...structuredClone(runtime.externals ?? {}),
      ...(Object.keys(profile.services).length > 0
        ? { services: structuredClone(profile.services) }
        : {}),
    },
  };

  return {
    blueprintId: id,
    revision: version,
    manifest: { gik: "0.1", type: "manifest", payload: manifest },
    document: {
      gik: "0.1",
      type: "document",
      payload: document,
    },
    state: mergeJsonRecords(structuredClone(runtime.state ?? {}), resolveInitialSeed(context)),
  };
}

/** Open one canonical JSON-authored Blueprint without projecting the full control-plane surface. */
export function openBlueprint(
  source: BlueprintSource,
  options: OpenBlueprintOptions = {}
): BlueprintRuntime {
  if (source.payload.recipes.length > 0) {
    const profile = loadBlueprint<LayerRecipe>(
      source,
      resolveProfileTemplateResource,
      resolveProfileTemplate,
    );
    return runtimeFromLowering(
      profile,
      runProfile(
        profile,
        structuredClone(defaultsFromSchema(source.payload.tiers[0]?.input)),
        resolveContextFor(profile, structuredClone(options.context ?? {})),
      ) as DocumentPayload,
      options.context,
    );
  }

  const definition = defineDeclarativeBlueprint(source);
  if (!definition) {
    throw new Error(
      `Blueprint '${source.payload.id}' has no organism root or lowering recipes`
    );
  }
  return runtimeFromLowering(
    definition.profile,
    definition.lower(structuredClone(options.context ?? {})),
    options.context,
  );
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
    manifest: Enveloped<ManifestPayload>,
    document: Enveloped<DocumentPayload>,
    opts: ControlFaceOptions = {}
  ) {
    this.kernel = new Kernel(manifest, document, {
      ...(opts.state ? { state: opts.state } : {}),
      ...(opts.orchestrator ? { orchestrator: opts.orchestrator } : {}),
      ...(opts.sink ? { sink: opts.sink } : {}),
    });
    this.broker = new KernelTransportHost(manifest, document, this.kernel);
    this.serviceHost = opts.serviceHost;
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
