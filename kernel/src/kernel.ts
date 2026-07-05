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
  /**
   * Provider for predicate positions (visibility gates, action + machine guards). These are
   * agent-authored and adversarial, so the kernel defaults this slot to the *safe* subset
   * ($eval / function definitions / transform rejected at compile time). Override to widen.
   */
  predicateExpression?: ExpressionProvider;
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
  private readonly predicateExpr: ExpressionProvider;
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
    this.predicateExpr = opts.predicateExpression ?? new JsonataExpressionProvider({ safe: true });
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
   * Seed machine states (via {@link init}) and return the *full* current state as a
   * baseline patch (rev 0). Unlike {@link init}, this carries every namespace, so a
   * fresh remote client can reconstruct the complete state replica from one patch.
   */
  baseline(): Patch {
    this.init();
    return this.snapshotPatch();
  }

  /**
   * The full current state as a patch at the *current* rev, without re-seeding machine
   * states. Used to re-onboard a client mid-session (reconnect / late join) without
   * clobbering live machine state the way {@link init} would.
   */
  snapshotPatch(): Patch {
    const snapshot = this.store.snapshot();
    const ops = Object.entries(snapshot).map(([namespace, value]) => ({
      op: "set" as const,
      path: namespace,
      value: value as Json,
    }));
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

    const { ops, traces, effects } = await reduce(this.doc, this.store, event, this.expr, this.predicateExpr);
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
      predicateExpr: this.predicateExpr,
      registry: this.registry,
      sink: this.sink,
    });
  }

  state(): Record<string, Json> {
    return this.store.snapshot();
  }
}
