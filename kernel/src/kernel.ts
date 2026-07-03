// The reference kernel: holds the Store, applies the pure reducer, and
// emits patches. It owns no domain knowledge and no time beyond the rev counter.

import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  ManifestRegistry,
  type CapabilityRegistry,
  type ExpressionProvider,
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
  type ResolvedNode,
  type TraceSink,
} from "./types";

export interface KernelOptions {
  expression?: ExpressionProvider;
  state?: StateModel;
  registry?: CapabilityRegistry;
  sink?: TraceSink;
  validate?: boolean;
}

export class Kernel {
  private rev = 0;
  private readonly doc: DocumentPayload;
  private readonly manifest: ManifestPayload;
  private readonly store: StateModel;
  private readonly expr: ExpressionProvider;
  private readonly registry: CapabilityRegistry;
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

  /** Reduce an event to a patch, apply it, and return it. rev increments per dispatch. */
  async dispatch(event: GupEvent): Promise<Patch> {
    const { ops, traces } = await reduce(this.doc, this.store, event, this.expr);
    this.store.apply(ops);
    this.rev += 1;
    for (const t of traces) this.sink?.(t);
    return { rev: this.rev, ops };
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
