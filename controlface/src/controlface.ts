// ControlFace: the render/drive + control-plane FACE over a live bundle, and the boundary a render
// transport (SSE) binds to. Everything behind it — kernel, reducer, interpreter, broker, GUP codec —
// is internal composition; a transport binds to THIS face, never to the internal broker. It
// implements the minimal `TransportBroker` contract (so SSE plugs into the face) and exposes the
// in-process control ops (the UI/API surface). The agent-safe AgentFace projection is carved from
// this superset — the trust boundary is which face a transport exposes.

import {
  Kernel,
  KernelTransportHost,
  type Checkpoint,
  type DocumentPayload,
  type Enveloped,
  type GupEvent,
  type Json,
  type ManifestPayload,
  type Patch,
  type RecordedEffect,
  type ResolvedNode,
  type StateModel,
  type TransportBroker,
  type TransportProvider,
} from "../../kernel/src/index";
import { checkpoint, effectsSince, getState, getTree } from "./ops";

export interface ControlFaceOptions {
  /** Pre-seeded state model for the kernel (namespaces already populated). */
  state?: StateModel;
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
    this.kernel = new Kernel(manifest, document, opts.state ? { state: opts.state } : {});
    this.broker = new KernelTransportHost(manifest, document, this.kernel);
  }

  /** Render-transport binding: attach a connection (optional `fromRev` resume), get a detach handle. */
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

  effectsSince(rev: number): RecordedEffect[] {
    return effectsSince(this.kernel, rev);
  }

  /** Detach every connection (the caller owns any server lifecycle). */
  stop(): void {
    this.broker.stop();
  }
}
