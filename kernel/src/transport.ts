import { ProjectionUnavailableError, type Kernel } from "./kernel";
import {
  envelope,
  unwrap,
  type ProjectedProgramDefinition,
  type Enveloped,
  type GIKEvent,
  type GIKMessage,
  type ProjectedVocabularyManifest,
  type Patch,
} from "./types";

export type TransportListener = (message: GIKMessage) => void | Promise<void>;

export interface TransportProvider {
  send(message: GIKMessage): void | Promise<void>;
  subscribe(listener: TransportListener): () => void;
}

/**
 * The minimal contract a render transport (e.g. SSE) binds to: attach a connection — optionally
 * resuming from a known `rev` — and get back a detach handle. Implemented by
 * {@link KernelTransportHost} directly, and by a face (ControlFace) that composes a broker
 * internally, so a transport binds to the FACE, never to the internal broker.
 */
export interface TransportBroker {
  attach(transport: TransportProvider, fromRev?: number): Promise<() => void>;
}

class InMemoryTransportEndpoint implements TransportProvider {
  private readonly listeners = new Set<TransportListener>();
  peer?: InMemoryTransportEndpoint;

  async send(message: GIKMessage): Promise<void> {
    if (!this.peer) return;
    const deliveries = [...this.peer.listeners].map((listener) =>
      Promise.resolve(listener(message))
    );
    await Promise.all(deliveries);
  }

  subscribe(listener: TransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createInMemoryTransportPair(): [TransportProvider, TransportProvider] {
  const left = new InMemoryTransportEndpoint();
  const right = new InMemoryTransportEndpoint();
  left.peer = right;
  right.peer = left;
  return [left, right];
}

/**
 * Binds a kernel to one or more transport connections (a broker). It onboards each
 * connection — `manifest`/`document`/full-snapshot `patch` for a fresh client, or an
 * incremental replay of missing patches for a client resuming from a known `rev` —
 * dispatches inbound `event`s serially (monotonic `rev`), and broadcasts each patch to
 * every connection. Reconnection is a transport concern handled here, below the closed
 * six-message GIK protocol.
 */
export class KernelTransportHost implements TransportBroker {
  private readonly connections = new Set<TransportProvider>();
  private readonly unsubscribers = new Map<TransportProvider, () => void>();
  private readonly log: Patch[] = [];
  private readonly maxLog = 256;
  private baselined = false;
  private dispatchQueue = Promise.resolve();
  private outboundQueue = Promise.resolve();

  constructor(
    private readonly manifest: Enveloped<ProjectedVocabularyManifest>,
    private readonly document: Enveloped<ProjectedProgramDefinition>,
    private readonly kernel: Kernel,
    private readonly defaultTransport?: TransportProvider
  ) {
    this.kernel.subscribePatches((patch) => this.onKernelPatch(patch));
    this.kernel.subscribeProgress((progress) => this.queueBroadcast(envelope("progress", progress)));
  }

  /** Convenience: attach the transport passed to the constructor. */
  async start(): Promise<void> {
    if (this.defaultTransport) await this.attach(this.defaultTransport);
  }

  /**
   * Register a connection and onboard it. Pass `fromRev` to resume: if the host still
   * holds the patches after that rev, only those deltas are replayed; otherwise the
   * client is re-onboarded in full.
   */
  async attach(transport: TransportProvider, fromRev?: number): Promise<() => void> {
    if (!this.kernel.hasProjection()) throw new ProjectionUnavailableError();
    this.ensureBaseline();
    this.connections.add(transport);
    const unsubscribe = transport.subscribe((message) => this.onMessage(message));
    this.unsubscribers.set(transport, unsubscribe);
    await this.onboard(transport, fromRev);
    return () => this.detach(transport);
  }

  detach(transport: TransportProvider): void {
    this.unsubscribers.get(transport)?.();
    this.unsubscribers.delete(transport);
    this.connections.delete(transport);
  }

  /** Detach every connection. */
  stop(): void {
    for (const transport of [...this.connections]) this.detach(transport);
  }

  private ensureBaseline(): void {
    if (this.baselined) return;
    this.log.push(this.kernel.baseline());
    this.baselined = true;
  }

  private async onboard(transport: TransportProvider, fromRev?: number): Promise<void> {
    const oldest = this.log[0].rev;
    const current = this.log[this.log.length - 1].rev;

    if (fromRev !== undefined && fromRev >= oldest && fromRev <= current) {
      // Resume: the client already has vocabulary/program and state up to fromRev.
      for (const patch of this.log) {
        if (patch.rev > fromRev) await transport.send(envelope("patch", patch));
      }
      return;
    }

    // Full onboarding: vocabulary, structure, then the complete current state.
    const program = this.kernel.program();
    if (!program.root) throw new ProjectionUnavailableError();
    await transport.send(envelope("vocabulary", unwrap(this.manifest)));
    await transport.send(envelope("program", program));
    await transport.send(envelope("patch", this.kernel.snapshotPatch()));
  }

  private appendLog(patch: Patch): void {
    this.log.push(patch);
    if (this.log.length > this.maxLog) this.log.shift();
  }

  private async broadcast(message: GIKMessage): Promise<void> {
    for (const transport of this.connections) await transport.send(message);
  }

  private queueBroadcast(message: GIKMessage): Promise<void> {
    const delivery = this.outboundQueue.then(() => this.broadcast(message));
    this.outboundQueue = delivery.catch(() => undefined);
    return delivery;
  }

  private onKernelPatch(patch: Patch): Promise<void> {
    this.appendLog(patch);
    return this.queueBroadcast(envelope("patch", patch));
  }

  /**
   * Drive the kernel from in-process (a UI/API caller or a co-located agent) and broadcast the
   * resulting patch to every connection — the same authoritative path a wired `event` takes.
   * Serialized behind the shared dispatch queue so in-process and wired events stay monotonic.
   */
  dispatch(event: GIKEvent): Promise<Patch> {
    let captured: Patch | undefined;
    this.dispatchQueue = this.dispatchQueue.then(async () => {
      this.ensureBaseline();
      const patch = await this.kernel.dispatch(event);
      captured = patch;
      await this.outboundQueue;
    });
    return this.dispatchQueue.then(() => captured!);
  }

  async whenIdle(): Promise<void> {
    await this.dispatchQueue;
    await this.kernel.whenIdle();
    await this.outboundQueue;
  }

  private onMessage(message: GIKMessage): Promise<void> {
    if (message.type !== "event") return Promise.resolve();
    return this.dispatch(message.payload).then(() => undefined);
  }
}