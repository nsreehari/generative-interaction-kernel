import { resolveNode } from "./interpret";
import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  ManifestRegistry,
  type CapabilityRegistry,
  type ExpressionProvider,
  type StateModel,
} from "./providers";
import { envelope, type DocumentPayload, type GIKMessage, type Json, type ResolvedNode } from "./types";
import type { TransportProvider } from "./transport";

export interface GIKClientOptions {
  expression?: ExpressionProvider;
  /**
   * Provider for the visibility gate (a predicate position). Agent-authored and adversarial,
   * so it defaults to the safe subset; override to widen.
   */
  predicateExpression?: ExpressionProvider;
}

/**
 * The renderer-side half of the protocol. It never sees the kernel: it consumes
 * `manifest`/`document`/`patch` off a transport, keeps a local state replica, runs
 * the *pure interpreter* to produce a `ResolvedNode` tree for a renderer, and emits
 * `event`s back. The authoritative reducer stays on the host; only interpretation
 * (read-only) and the replica live here.
 */
export class GIKClient {
  private readonly expr: ExpressionProvider;
  private readonly predicateExpr: ExpressionProvider;
  private store?: StateModel;
  private registry?: CapabilityRegistry;
  private doc?: DocumentPayload;
  private tree: ResolvedNode | null = null;
  private rev = -1;
  private readonly listeners = new Set<() => void>();
  private unsubscribe?: () => void;

  constructor(
    private transport: TransportProvider,
    opts: GIKClientOptions = {}
  ) {
    this.expr = opts.expression ?? new JsonataExpressionProvider();
    this.predicateExpr = opts.predicateExpression ?? new JsonataExpressionProvider({ safe: true });
  }

  start(): void {
    this.unsubscribe ??= this.transport.subscribe((message) => this.onMessage(message));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /**
   * Re-point the client at a new transport (reconnect), keeping the current replica so
   * the host can resume it from {@link getRev} with an incremental patch replay.
   */
  rebind(transport: TransportProvider): void {
    this.stop();
    this.transport = transport;
    this.start();
  }

  /** The current resolved tree a renderer should paint (null before the first document). */
  getTree(): ResolvedNode | null {
    return this.tree;
  }

  /** The last applied revision (-1 before any patch). */
  getRev(): number {
    return this.rev;
  }

  /** Read one value out of the local replica (undefined before onboarding). */
  get(path: string): Json | undefined {
    return this.store?.get(path);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(node: string, name: string, payload?: Record<string, Json>, actorId?: string): void | Promise<void> {
    return this.transport.send(envelope("event", { node, name, payload, actorId }));
  }

  private async onMessage(message: GIKMessage): Promise<void> {
    switch (message.type) {
      case "manifest": {
        // A manifest (re)establishes vocabulary and a fresh replica: reset rev so the
        // full-snapshot patch that follows always applies, even on a full resync.
        this.registry = ManifestRegistry.fromManifest(message.payload);
        this.store = new InMemoryStateModel(message.payload.namespaces ?? []);
        this.rev = -1;
        return;
      }
      case "document": {
        this.doc = message.payload;
        await this.reresolve();
        return;
      }
      case "patch": {
        // Idempotent: ignore patches already applied (duplicate replay). rev 0 is the
        // baseline and always applies to a fresh replica.
        if (message.payload.rev !== 0 && message.payload.rev <= this.rev) return;
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
      predicateExpr: this.predicateExpr,
      registry: this.registry,
    });
    for (const listener of this.listeners) listener();
  }
}
