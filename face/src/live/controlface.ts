// ControlFace: the render/drive + control-plane FACE over a live bundle, and the boundary a render
// transport (SSE) binds to. Everything behind it — kernel, reducer, interpreter, broker, GUP codec —
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
  type GupEvent,
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

export interface ControlFaceOptions {
  /** Pre-seeded state model for the kernel (namespaces already populated). */
  state?: StateModel;
  /** Optional host effects/confirmation/router provider, including compensation handlers. */
  orchestrator?: Orchestrator;
  /** Optional trace sink for resolve/action/effect events. */
  sink?: TraceSink;
}

export class ControlFace implements TransportBroker {
  // The kernel and broker are INTERNAL composition — private so the face never leaks them to a
  // transport. Render transports bind through `attach`; drive goes through `emit`.
  private readonly kernel: Kernel;
  private readonly broker: KernelTransportHost;

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
  }

  /**
   * Streaming plumbing (NOT a JSON tool): attach a render connection (optional `fromRev` resume) and
   * get a detach handle. SSE binds through this; the tool catalog is the request/response surface.
   */
  attach(transport: TransportProvider, fromRev?: number): Promise<() => void> {
    return this.broker.attach(transport, fromRev);
  }

  /** Drive the kernel and broadcast the patch to every connected render client. */
  emit(event: GupEvent): Promise<Patch> {
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

  /** Detach every connection (the caller owns any server lifecycle). */
  stop(): void {
    this.broker.stop();
  }
}
