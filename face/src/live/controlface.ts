// ControlFace: the render/drive + control-plane FACE over a live bundle, and the boundary a render
// transport (SSE) binds to. Everything behind it — kernel, reducer, interpreter, broker, GIK codec —
// is internal composition; a transport binds to THIS face, never to the internal broker.
//
// Two distinct surfaces live here:
//   - the JSON tool catalogs (see ./projections/controlface and ./projections/agentface):
//     getState/getTree/emit/checkpoint/restore/effectsSince/compensate as JSON->JSON ops,
//     dispatched over the same MCP dispatcher the pure authoring tools use. The methods below are
//     the impls those tools wrap.
//     AgentFace is the full catalog filtered to its allowlist.
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
import type { ResolvedProfile } from "../../../profile/src/index";

export interface BlueprintRuntime {
  blueprintId: string;
  revision: string;
  manifest: Enveloped<ManifestPayload>;
  document: Enveloped<DocumentPayload>;
  state: Record<string, Json>;
}

export interface BlueprintDefinition {
  profile: Pick<ResolvedProfile, "artifact" | "services">;
  lower(context: Record<string, Json>): DocumentPayload;
}

export interface BlueprintResolver {
  resolve(blueprintId: string): BlueprintDefinition | undefined;
}

export interface OpenBlueprintRequest {
  blueprintId: string;
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

export class ControlFace implements TransportBroker {
  /** Resolve and lower an authored Blueprint before constructing its live ControlFace. */
  static openBlueprint(
    resolver: BlueprintResolver,
    request: OpenBlueprintRequest
  ): BlueprintRuntime {
    const definition = resolver.resolve(request.blueprintId);
    if (!definition) throw new Error(`Unknown Blueprint '${request.blueprintId}'`);
    const { id, version, runtime } = definition.profile.artifact.payload;
    if (id !== request.blueprintId) {
      throw new Error(`Blueprint resolver returned '${id}' for requested '${request.blueprintId}'`);
    }
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
        ...(Object.keys(definition.profile.services).length > 0
          ? { services: structuredClone(definition.profile.services) }
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
        payload: definition.lower(structuredClone(request.context ?? {})),
      },
      state: structuredClone(runtime.state ?? {}),
    };
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

  restore(cp: Checkpoint): Patch {
    return restore(this.kernel, cp);
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
