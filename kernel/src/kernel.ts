// The reference kernel: holds the Store, applies the pure reducer, and
// emits patches. It owns no domain knowledge and no time beyond the rev counter.

import {
  InMemoryStateModel,
  CompositeStateModel,
  JsonataExpressionProvider,
  ManifestRegistry,
  NullOrchestrator,
  type CapabilityRegistry,
  type ExpressionProvider,
  type Orchestrator,
  type StateModel,
} from "./providers";
import { resolveNode } from "./interpret";
import { reduce, reduceActions } from "./reduce";
import { validateDocumentMessage, validateDocumentProps } from "./validate";
import {
  unwrap,
  type DocNode,
  type DocumentPayload,
  type Enveloped,
  type GupEvent,
  type Json,
  type ManifestPayload,
  type OrchestratorEffect,
  type Patch,
  type Checkpoint,
  type RecordedEffect,
  type PatchOp,
  type Reaction,
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
  /**
   * Shared *context* stores keyed by namespace (ADR-0034). A binding whose path targets one of these
   * namespaces reads/writes the shared store instead of local kernel state; passing the same store
   * instance to several kernels is how they share one source of truth. The same instance may back
   * several namespaces (pass it under each key).
   */
  contexts?: Record<string, StateModel>;
  registry?: CapabilityRegistry;
  orchestrator?: Orchestrator;
  sink?: TraceSink;
  validate?: boolean;
}

// Bounds runaway effect/event chains (e.g. an invoke whose result re-triggers itself).
const MAX_SETTLE_DEPTH = 32;

// Structural equality for reaction `when` values (Json), used to detect a genuine change.
function jsonEqual(a: Json, b: Json): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Deep-clone pure JSON state so a captured checkpoint is immutable against later store mutations.
// State is JSON by contract, so a round-trip is sufficient (and env-independent).
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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
  // Last observed `when` value per reaction (keyed `${nodeId}#${index}`), so a reaction fires on a
  // genuine CHANGE, never on the initial seed. Seeded lazily from the pre-event snapshot (ADR-0034).
  private readonly reactionBaseline = new Map<string, Json>();
  private reactionsSeeded = false;
  // Effects fired, in issue order (ADR-0009 seam), each tagged with its rev and a monotonic seq. The
  // kernel owns no wall-clock time, so ordering is rev + seq — never a timestamp. effectsSince()
  // reports them; the host decides whether to ignore, replay forward, or reverse them.
  private effectLog: RecordedEffect[] = [];
  private effectSeq = 0;

  constructor(
    manifest: Enveloped<ManifestPayload>,
    document: Enveloped<DocumentPayload>,
    opts: KernelOptions = {}
  ) {
    if (opts.validate !== false) validateDocumentMessage(document);

    this.manifest = unwrap(manifest);
    this.doc = unwrap(document);
    if (opts.validate !== false) validateDocumentProps(this.doc, this.manifest.capabilities);
    this.expr = opts.expression ?? new JsonataExpressionProvider();
    this.predicateExpr = opts.predicateExpression ?? new JsonataExpressionProvider({ safe: true });
    this.registry = opts.registry ?? ManifestRegistry.fromManifest(this.manifest);
    const local = opts.state ?? new InMemoryStateModel(this.manifest.namespaces ?? []);
    this.store =
      opts.contexts && Object.keys(opts.contexts).length > 0
        ? new CompositeStateModel(local, opts.contexts)
        : local;
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
    if (!this.reactionsSeeded) await this.seedReactionBaseline();
    const ops: PatchOp[] = [];
    const fired: OrchestratorEffect[] = [];
    await this.settle(event, ops, 0, fired);
    this.rev += 1;
    // Journal the effects this dispatch fired, tagged with their rev and a monotonic seq, so the
    // host can later query them via effectsSince() and choose how — or whether — to apply them.
    for (const effect of fired) this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect });
    return { rev: this.rev, ops };
  }

  private async settle(
    event: GupEvent,
    acc: PatchOp[],
    depth: number,
    journal: OrchestratorEffect[]
  ): Promise<void> {
    if (depth > MAX_SETTLE_DEPTH) {
      throw new Error("GenUI kernel: effect/event depth exceeded");
    }

    const { ops, traces, effects } = await reduce(this.doc, this.store, event, this.expr, this.predicateExpr);
    this.store.apply(ops);
    acc.push(...ops);
    for (const t of traces) this.sink?.(t);

    await this.runEffects(effects, acc, depth, journal);
    await this.runReactions(acc, depth, journal);
  }

  private async runEffects(
    effects: OrchestratorEffect[],
    acc: PatchOp[],
    depth: number,
    journal: OrchestratorEffect[]
  ): Promise<void> {
    for (const effect of effects) {
      journal.push(effect);
      const handler =
        effect.kind === "invoke"
          ? this.orchestrator.invoke
          : effect.kind === "confirm"
            ? this.orchestrator.confirm
            : this.orchestrator.route;

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
        await this.settle(followUp, acc, depth + 1, journal);
      }
    }
  }

  // Every reaction in the document, flattened with a stable key (`${nodeId}#${index}`).
  private reactions(): Array<{ key: string; nodeId: string; reaction: Reaction }> {
    const out: Array<{ key: string; nodeId: string; reaction: Reaction }> = [];
    const walk = (n: DocNode): void => {
      n.edges?.react?.forEach((r, i) => out.push({ key: `${n.id}#${i}`, nodeId: n.id, reaction: r }));
      for (const child of n.edges?.children ?? []) walk(child);
    };
    walk(this.doc.root);
    return out;
  }

  // Record each reaction's current `when` value WITHOUT firing, so the first real change fires.
  private async seedReactionBaseline(): Promise<void> {
    const snapshot = this.store.snapshot();
    for (const { key, reaction } of this.reactions()) {
      this.reactionBaseline.set(key, await this.expr.eval(reaction.when, snapshot));
    }
    this.reactionsSeeded = true;
  }

  // Fire every reaction whose `when` value changed, cascading until the document quiesces. Folds into
  // the same depth guard as effects, so a reaction that flips its own `when` cannot loop unbounded.
  private async runReactions(
    acc: PatchOp[],
    depth: number,
    journal: OrchestratorEffect[]
  ): Promise<void> {
    if (depth > MAX_SETTLE_DEPTH) {
      throw new Error("GenUI kernel: reaction depth exceeded");
    }
    let fired = true;
    let sweeps = 0;
    while (fired) {
      if (sweeps++ > MAX_SETTLE_DEPTH) {
        throw new Error("GenUI kernel: reaction depth exceeded");
      }
      fired = false;
      for (const { key, nodeId, reaction } of this.reactions()) {
        const value = await this.expr.eval(reaction.when, this.store.snapshot());
        if (!this.reactionBaseline.has(key)) {
          this.reactionBaseline.set(key, value);
          continue;
        }
        if (jsonEqual(this.reactionBaseline.get(key) ?? null, value)) continue;
        this.reactionBaseline.set(key, value);
        fired = true;
        const r = await reduceActions(this.store, nodeId, reaction.run, this.expr, this.predicateExpr, {
          when: value,
        });
        this.store.apply(r.ops);
        acc.push(...r.ops);
        for (const t of r.traces) this.sink?.(t);
        await this.runEffects(r.effects, acc, depth + 1, journal);
        for (const ev of r.emitted) await this.settle(ev, acc, depth + 1, journal);
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

  /**
   * Capture an immutable, rev-keyed snapshot of pure state. Deep-cloned because the live
   * StateModel returns its backing object by reference — a later apply() would otherwise mutate
   * the checkpoint. Domain- and medium-blind: state is just JSON, so this is a free corollary of
   * determinism (Principle 8), not new domain machinery.
   */
  checkpoint(): Checkpoint {
    return { rev: this.rev, state: cloneJson(this.store.snapshot()) };
  }

  /**
   * Roll pure state to a checkpoint — backward (undo) or forward (redo); restore is just "set state
   * to this value." Closed and total: state is a JSON record, so this overwrites each namespace with
   * its checkpoint value, one new rev, replay-safe as a full patch. It touches ONLY state — effects
   * are reported separately by {@link effectsSince}, so a host with its own rollback substrate (a git
   * rev, a DB transaction) can use checkpoint/restore alone and ignore effects entirely.
   */
  restore(cp: Checkpoint): Patch {
    const ops: PatchOp[] = Object.entries(cp.state).map(([namespace, value]) => ({
      op: "set" as const,
      path: namespace,
      value: value as Json,
    }));
    this.store.apply(ops);
    this.rev += 1;
    return { rev: this.rev, ops };
  }

  /**
   * The effects journaled after `rev`, in causal order (oldest-first), each tagged with its `rev`
   * and a monotonic `seq`. The kernel imposes no interpretation: the host may ignore them (its own
   * substrate handles rollback), replay them forward (redo), or reverse the array and feed it to
   * {@link compensate} (LIFO undo). Ordering is rev + seq, never a timestamp — the kernel owns no
   * wall-clock time.
   */
  effectsSince(rev: number): RecordedEffect[] {
    return this.effectLog.filter((e) => e.rev > rev).map((e) => ({ ...e }));
  }

  /**
   * Route effects through the Orchestrator's compensate seam, in the order given — the host controls
   * ordering (pass a reversed array for LIFO undo). The kernel owns no inverse of a fired `charge`;
   * the host's compensate handler maps each to a real inverse (a refund), a no-op, or a refusal. An
   * unhandled compensation is traced, never silently pretended-away. Store deltas the host returns
   * (e.g. a `refunded` flag) fold into one new rev.
   */
  async compensate(effects: OrchestratorEffect[]): Promise<Patch> {
    const ops: PatchOp[] = [];
    const handler = this.orchestrator.compensate;
    for (const effect of effects) {
      if (!handler) {
        this.sink?.({
          event: "effect",
          node: effect.node,
          detail: { kind: effect.kind, compensate: true, unhandled: true },
        });
        continue;
      }
      const result = await handler.call(this.orchestrator, effect);
      if (!result) continue;
      if (result.ops?.length) {
        this.store.apply(result.ops);
        ops.push(...result.ops);
      }
      // Follow-up events (e.g. driving a machine to a `refunded` state) settle normally; a
      // compensation that spawns further effects is out of scope for this sketch (empty journal).
      for (const followUp of result.events ?? []) await this.settle(followUp, ops, 0, []);
    }
    this.rev += 1;
    return { rev: this.rev, ops };
  }
}
