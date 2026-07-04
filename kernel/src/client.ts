import { resolveNode } from "./interpret";
import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  ManifestRegistry,
  type CapabilityRegistry,
  type ExpressionProvider,
  type StateModel,
} from "./providers";
import { envelope, type DocumentPayload, type GupMessage, type Json, type ResolvedNode } from "./types";
import type { TransportProvider } from "./transport";

export interface GenUIClientOptions {
  expression?: ExpressionProvider;
}

/**
 * The renderer-side half of the protocol. It never sees the kernel: it consumes
 * `manifest`/`document`/`patch` off a transport, keeps a local state replica, runs
 * the *pure interpreter* to produce a `ResolvedNode` tree for a renderer, and emits
 * `event`s back. The authoritative reducer stays on the host; only interpretation
 * (read-only) and the replica live here.
 */
export class GenUIClient {
  private readonly expr: ExpressionProvider;
  private store?: StateModel;
  private registry?: CapabilityRegistry;
  private doc?: DocumentPayload;
  private tree: ResolvedNode | null = null;
  private rev = -1;
  private readonly listeners = new Set<() => void>();
  private unsubscribe?: () => void;

  constructor(
    private readonly transport: TransportProvider,
    opts: GenUIClientOptions = {}
  ) {
    this.expr = opts.expression ?? new JsonataExpressionProvider();
  }

  start(): void {
    this.unsubscribe ??= this.transport.subscribe((message) => this.onMessage(message));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /** The current resolved tree a renderer should paint (null before the first document). */
  getTree(): ResolvedNode | null {
    return this.tree;
  }

  /** The last applied revision (-1 before any patch). */
  getRev(): number {
    return this.rev;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(node: string, name: string, payload?: Record<string, Json>): void | Promise<void> {
    return this.transport.send(envelope("event", { node, name, payload }));
  }

  private async onMessage(message: GupMessage): Promise<void> {
    switch (message.type) {
      case "manifest": {
        this.registry = ManifestRegistry.fromManifest(message.payload);
        this.store = new InMemoryStateModel(message.payload.namespaces ?? []);
        return;
      }
      case "document": {
        this.doc = message.payload;
        await this.reresolve();
        return;
      }
      case "patch": {
        this.store?.apply(message.payload.ops);
        this.rev = message.payload.rev;
        await this.reresolve();
        return;
      }
      default:
        // event/trace are not consumed by the client.
        return;
    }
  }

  private async reresolve(): Promise<void> {
    if (!this.doc || !this.store || !this.registry) return;
    this.tree = await resolveNode(this.doc.root, {
      store: this.store,
      expr: this.expr,
      registry: this.registry,
    });
    for (const listener of this.listeners) listener();
  }
}
