import type { Kernel } from "./kernel";
import {
  envelope,
  unwrap,
  type DocumentPayload,
  type Enveloped,
  type GupMessage,
  type ManifestPayload,
} from "./types";

export type TransportListener = (message: GupMessage) => void | Promise<void>;

export interface TransportProvider {
  send(message: GupMessage): void | Promise<void>;
  subscribe(listener: TransportListener): () => void;
}

class InMemoryTransportEndpoint implements TransportProvider {
  private readonly listeners = new Set<TransportListener>();
  peer?: InMemoryTransportEndpoint;

  async send(message: GupMessage): Promise<void> {
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

export class KernelTransportHost {
  private unsubscribe?: () => void;
  private dispatchQueue = Promise.resolve();

  constructor(
    private readonly manifest: Enveloped<ManifestPayload>,
    private readonly document: Enveloped<DocumentPayload>,
    private readonly kernel: Kernel,
    private readonly transport: TransportProvider
  ) {}

  async start(): Promise<void> {
    this.unsubscribe ??= this.transport.subscribe((message) => this.onMessage(message));
    await this.transport.send(envelope("manifest", unwrap(this.manifest)));
    await this.transport.send(envelope("document", unwrap(this.document)));
    await this.transport.send(envelope("patch", this.kernel.init()));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private onMessage(message: GupMessage): Promise<void> {
    if (message.type !== "event") return Promise.resolve();

    this.dispatchQueue = this.dispatchQueue.then(async () => {
      const patch = await this.kernel.dispatch(message.payload);
      await this.transport.send(envelope("patch", patch));
    });

    return this.dispatchQueue;
  }
}