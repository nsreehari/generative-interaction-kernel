// The reference kernel: holds the Store, applies the pure reducer, and
// emits patches. It owns no domain knowledge and no time beyond the rev counter.

import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  ManifestRegistry,
  NullOrchestrator,
  type CapabilityRegistry,
  type ExpressionProvider,
  type Orchestrator,
  type StateModel,
} from "./providers";
import { resolveNode } from "./interpret";
import { reduce } from "./reduce";
import { validateDocumentMessage } from "./validate";
import {
  unwrap,
  type DocumentPayload,
  type Enveloped,
  type GupEvent,
  type Json,
  type ManifestPayload,
  type Patch,
  type PatchOp,
  type ResolvedNode,
  type TraceSink,
} from "./types";

export interface KernelOptions {
  expression?: ExpressionProvider;
  state?: StateModel;
  registry?: CapabilityRegistry;
  orchestrator?: Orchestrator;
  sink?: TraceSink;
  validate?: boolean;
}

// Bounds runaway effect/event chains (e.g. an invoke whose result re-triggers itself).
const MAX_SETTLE_DEPTH = 32;

export class Kernel {
  private rev = 0;
  private readonly doc: DocumentPayload;
  private readonly manifest: ManifestPayload;
  private readonly store: StateModel;
  private readonly expr: ExpressionProvider;
  private readonly registry: CapabilityRegistry;
  private readonly orchestrator: Orchestrator;
  private readonly sink?: TraceSink;

  constructor(
    manifest: Enveloped<ManifestPayload>,
    document: Enveloped<DocumentPayload>,
    opts: KernelOptions = {}
  ) {
    if (opts.validate !== false) validateDocumentMessage(document);

    this.manifest = unwrap(manifest);
    this.doc = unwrap(document);
    this.expr = opts.expression ?? new JsonataExpressionProvider();
    this.registry = opts.registry ?? ManifestRegistry.fromManifest(this.manifest);
    this.store = opts.state ?? new InMemoryStateModel(this.manifest.namespaces ?? []);
    this.orchestrator = opts.orchestrator ?? new NullOrchestrator();
    this.sink = opts.sink;
  }

  /** Seed initial machine states. Returns the baseline patch (rev 0). */
  init(): Patch {
    const ops = (this.doc.machines ?? []).map((m) => ({
      op: "set" as const,
      path: `${m.context}.state`,
      value: m.initial as Json,
    }));
    this.store.apply(ops);
    return { rev: this.rev, ops };
  }

  /**
   * Reduce an event to a patch, run any resulting orchestrator effects (and the
   * follow-up events they produce), apply everything, and return the settled patch.
   * One dispatch = one rev, regardless of how many effects/events it fans out to.
   */
  async dispatch(event: GupEvent): Promise<Patch> {
    const ops: PatchOp[] = [];
    await this.settle(event, ops, 0);
    this.rev += 1;
    return { rev: this.rev, ops };
  }

  private async settle(event: GupEvent, acc: PatchOp[], depth: number): Promise<void> {
    if (depth > MAX_SETTLE_DEPTH) {
      throw new Error("GenUI kernel: effect/event depth exceeded");
    }

    const { ops, traces, effects } = await reduce(this.doc, this.store, event, this.expr);
    this.store.apply(ops);
    acc.push(...ops);
    for (const t of traces) this.sink?.(t);

    for (const effect of effects) {
      const handler =
        effect.kind === "invoke"
          ? this.orchestrator.invoke
          : effect.kind === "confirm"
            ? this.orchestrator.confirm
            : this.orchestrator.navigate;

      if (!handler) {
        this.sink?.({ event: "effect", node: effect.node, detail: { kind: effect.kind, unhandled: true } });
        continue;
      }

      const result = await handler.call(this.orchestrator, effect);
      if (!result) continue;

      if (result.ops?.length) {
        this.store.apply(result.ops);
        acc.push(...result.ops);
      }
      for (const followUp of result.events ?? []) {
        await this.settle(followUp, acc, depth + 1);
      }
    }
  }

  /** Resolve the current document into a renderable tree. */
  async resolve(): Promise<ResolvedNode> {
    return resolveNode(this.doc.root, {
      store: this.store,
      expr: this.expr,
      registry: this.registry,
      sink: this.sink,
    });
  }

  state(): Record<string, Json> {
    return this.store.snapshot();
  }
}
