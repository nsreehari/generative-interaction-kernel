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
  type GIKEvent,
  InvocationClosedError,
  type InvocationControl,
  type InvocationId,
  type InvocationProgress,
  type Json,
  type ManifestPayload,
  type OrchestratorEffect,
  type OrchestratorResult,
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
  private invocationSeq = 0;
  private mutationQueue: Promise<void> = Promise.resolve();
  private readonly patchListeners = new Set<(patch: Patch) => unknown>();
  private readonly progressListeners = new Set<(progress: InvocationProgress) => unknown>();
  private readonly activeInvocations = new Map<InvocationId, {
    effect: OrchestratorEffect;
    controller: AbortController;
    seq: number;
    closed: boolean;
    queue: Promise<void>;
  }>();
  private readonly invocationTasks = new Set<Promise<void>>();
  private readonly invocationErrors: unknown[] = [];

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
  * Reduce an event to its initiating patch. Confirm and route effects settle inline;
  * invoke effects start after commit and publish their terminal result in a later patch.
   */
  dispatch(event: GIKEvent): Promise<Patch> {
    return this.enqueueMutation(async () => {
      if (!this.reactionsSeeded) await this.seedReactionBaseline();
      const ops: PatchOp[] = [];
      const fired: OrchestratorEffect[] = [];
      const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
      await this.settle(event, ops, 0, fired, invokes);
      this.rev += 1;
      for (const effect of fired) {
        const invocationId = invokes.find((entry) => entry.effect === effect)?.id;
        this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect, invocationId });
      }
      const patch = { rev: this.rev, ops };
      this.publishPatch(patch);
      for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
      return patch;
    });
  }

  /**
   * Settle standing reactions after state changed outside this kernel, such as through a shared
   * context written by a sibling runtime. The first synchronization establishes a baseline without
   * firing; subsequent changes run the same reaction/effect cascade as an ordinary dispatch.
   */
  syncExternal(): Promise<Patch> {
    return this.enqueueMutation(async () => {
      const ops: PatchOp[] = [];
      const fired: OrchestratorEffect[] = [];
      const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
      if (!this.reactionsSeeded) {
        await this.seedReactionBaseline();
        await this.runInitialReactions(ops, 0, fired, invokes);
      } else {
        await this.runReactions(ops, 0, fired, invokes);
      }
      if (ops.length > 0 || fired.length > 0) {
        this.rev += 1;
        for (const effect of fired) {
          const invocationId = invokes.find((entry) => entry.effect === effect)?.id;
          this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect, invocationId });
        }
      }
      const patch = { rev: this.rev, ops };
      this.publishPatch(patch);
      for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
      return patch;
    });
  }

  private async settle(
    event: GIKEvent,
    acc: PatchOp[],
    depth: number,
    journal: OrchestratorEffect[],
    invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }>
  ): Promise<void> {
    if (depth > MAX_SETTLE_DEPTH) {
      throw new Error("GenUI kernel: effect/event depth exceeded");
    }

    const { ops, traces, effects } = await reduce(this.doc, this.store, event, this.expr, this.predicateExpr);
    this.store.apply(ops);
    acc.push(...ops);
    for (const t of traces) this.sink?.(t);

    await this.runEffects(effects, acc, depth, journal, invokes);
    await this.runReactions(acc, depth, journal, invokes);
  }

  private async runEffects(
    effects: OrchestratorEffect[],
    acc: PatchOp[],
    depth: number,
    journal: OrchestratorEffect[],
    invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }>
  ): Promise<void> {
    for (const effect of effects) {
      journal.push(effect);
      if (effect.kind === "invoke") {
        if (!this.orchestrator.invoke) {
          this.sink?.({ event: "effect", node: effect.node, detail: { kind: effect.kind, unhandled: true } });
          continue;
        }
        const id = `inv-${this.invocationSeq++}`;
        invokes.push({ effect, id });
        continue;
      }
      const handler =
        effect.kind === "confirm" ? this.orchestrator.confirm : this.orchestrator.route;

      if (!handler) {
        this.sink?.({ event: "effect", node: effect.node, detail: { kind: effect.kind, unhandled: true } });
        continue;
      }

      const result = await handler.call(this.orchestrator, effect);
      if (!result) continue;

      this.sink?.({
        event: "effect",
        node: effect.node,
        detail: {
          kind: effect.kind,
          tool: effect.tool,
          phase: "outcome",
          outcome: result.outcome ?? "settled",
          actorId: effect.actorId,
          opCount: result.ops?.length ?? 0,
          eventCount: result.events?.length ?? 0,
          ...(result.detail ?? {}),
        },
      });

      if (result.ops?.length) {
        this.store.apply(result.ops);
        acc.push(...result.ops);
      }
      for (const followUp of result.events ?? []) {
        await this.settle(followUp, acc, depth + 1, journal, invokes);
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

  private async runInitialReactions(
    acc: PatchOp[],
    depth: number,
    journal: OrchestratorEffect[],
    invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }>
  ): Promise<void> {
    for (const { nodeId, reaction } of this.reactions()) {
      if (!reaction.runInitially) continue;
      const value = await this.expr.eval(reaction.when, this.store.snapshot());
      if (value === null || value === undefined) continue;
      const result = await reduceActions(this.store, nodeId, reaction.run, this.expr, this.predicateExpr, {
        when: value,
      });
      this.store.apply(result.ops);
      acc.push(...result.ops);
      for (const trace of result.traces) this.sink?.(trace);
      await this.runEffects(result.effects, acc, depth + 1, journal, invokes);
      for (const event of result.emitted) await this.settle(event, acc, depth + 1, journal, invokes);
    }
    await this.runReactions(acc, depth, journal, invokes);
  }

  // Fire every reaction whose `when` value changed, cascading until the document quiesces. Folds into
  // the same depth guard as effects, so a reaction that flips its own `when` cannot loop unbounded.
  private async runReactions(
    acc: PatchOp[],
    depth: number,
    journal: OrchestratorEffect[],
    invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }>
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
        await this.runEffects(r.effects, acc, depth + 1, journal, invokes);
        for (const ev of r.emitted) await this.settle(ev, acc, depth + 1, journal, invokes);
      }
    }
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);
    this.mutationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private startInvocation(effect: OrchestratorEffect, id: InvocationId): void {
    const handler = this.orchestrator.invoke;
    if (!handler) return;
    const active = {
      effect,
      controller: new AbortController(),
      seq: 0,
      closed: false,
      queue: Promise.resolve(),
    };
    this.activeInvocations.set(id, active);
    const control: InvocationControl = {
      id,
      signal: active.controller.signal,
      emitProgress: (progress) => this.enqueueInvocation(id, () => {
        const current = this.requireActiveInvocation(id);
        const envelope: InvocationProgress = {
          invocationId: id,
          seq: current.seq++,
          node: effect.node,
          effect: "invoke",
          ...(effect.tool ? { tool: effect.tool } : {}),
          ...(effect.actorId ? { actorId: effect.actorId } : {}),
          name: progress.name,
          ...(progress.detail ? { detail: progress.detail } : {}),
        };
        this.publishProgress(envelope);
      }),
      emit: (result = {}) => this.enqueueInvocation(id, () => this.settleInvocation(id, result)),
    };
    const task = Promise.resolve()
      .then(() => handler.call(this.orchestrator, effect, control))
      .then(async (result) => {
        if (!this.activeInvocations.has(id)) {
          if (result) throw new InvocationClosedError(id);
          return;
        }
        if (result) await control.emit(result);
        else this.closeInvocation(id);
      })
      .catch((error) => {
        this.closeInvocation(id);
        if (!(error instanceof InvocationClosedError && active.controller.signal.aborted)) {
          this.invocationErrors.push(error);
        }
        this.sink?.({
          event: "effect",
          node: effect.node,
          detail: { kind: "invoke", tool: effect.tool, phase: "error", message: String(error) },
        });
      })
      .finally(() => this.invocationTasks.delete(task));
    this.invocationTasks.add(task);
  }

  private enqueueInvocation(id: InvocationId, operation: () => void | Promise<void>): Promise<void> {
    let active: ReturnType<Kernel["requireActiveInvocation"]>;
    try {
      active = this.requireActiveInvocation(id);
    } catch (error) {
      return Promise.reject(error);
    }
    const next = active.queue.then(async () => {
      this.requireActiveInvocation(id);
      await operation();
    });
    active.queue = next.catch(() => undefined);
    return next;
  }

  private requireActiveInvocation(id: InvocationId) {
    const active = this.activeInvocations.get(id);
    if (!active || active.closed) throw new InvocationClosedError(id);
    return active;
  }

  private async settleInvocation(id: InvocationId, result: OrchestratorResult): Promise<void> {
    const active = this.requireActiveInvocation(id);
    active.closed = true;
    try {
      await this.enqueueMutation(async () => {
        if (this.activeInvocations.get(id) !== active || active.controller.signal.aborted) {
          throw new InvocationClosedError(id);
        }
        const ops: PatchOp[] = [];
        const fired: OrchestratorEffect[] = [];
        const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
        if (result.ops?.length) {
          this.store.apply(result.ops);
          ops.push(...result.ops);
        }
        for (const followUp of result.events ?? []) {
          await this.settle(followUp, ops, 0, fired, invokes);
        }
        await this.runReactions(ops, 0, fired, invokes);
        this.rev += 1;
        for (const effect of fired) {
          const invocationId = invokes.find((entry) => entry.effect === effect)?.id;
          this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect, invocationId });
        }
        this.sink?.({
          event: "effect",
          node: active.effect.node,
          detail: {
            kind: "invoke",
            tool: active.effect.tool,
            phase: "outcome",
            outcome: result.outcome ?? "settled",
            actorId: active.effect.actorId,
            opCount: result.ops?.length ?? 0,
            eventCount: result.events?.length ?? 0,
            ...(result.detail ?? {}),
          },
        });
        const patch = { rev: this.rev, ops };
        this.publishPatch(patch);
        for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
      });
    } finally {
      if (this.activeInvocations.get(id) === active) {
        this.activeInvocations.delete(id);
      }
    }
  }

  private reportListenerError(kind: "patch" | "progress", error: unknown): void {
    this.sink?.({
      event: "effect",
      detail: { kind: "invoke", phase: `${kind}-listener-error`, message: String(error) },
    });
  }

  private notifyListener<T>(
    kind: "patch" | "progress",
    listener: (value: T) => unknown,
    value: T
  ): void {
    try {
      const result = listener(value);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).catch((error) => this.reportListenerError(kind, error));
      }
    } catch (error) {
      this.reportListenerError(kind, error);
    }
  }

  private publishProgress(progress: InvocationProgress): void {
    for (const listener of this.progressListeners) {
      this.notifyListener("progress", listener, progress);
    }
  }

  private closeInvocation(id: InvocationId): void {
    const active = this.activeInvocations.get(id);
    if (!active) return;
    active.closed = true;
    this.activeInvocations.delete(id);
  }

  subscribePatches(listener: (patch: Patch) => unknown): () => void {
    this.patchListeners.add(listener);
    return () => this.patchListeners.delete(listener);
  }

  subscribeProgress(listener: (progress: InvocationProgress) => unknown): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  private publishPatch(patch: Patch): void {
    for (const listener of this.patchListeners) {
      this.notifyListener("patch", listener, patch);
    }
  }

  cancelInvocation(id: InvocationId): void {
    const active = this.activeInvocations.get(id);
    if (!active) return;
    active.controller.abort();
    this.closeInvocation(id);
  }

  dispose(): void {
    for (const id of [...this.activeInvocations.keys()]) this.cancelInvocation(id);
    this.patchListeners.clear();
    this.progressListeners.clear();
  }

  async whenIdle(): Promise<void> {
    while (this.invocationTasks.size > 0) await Promise.all([...this.invocationTasks]);
    await this.mutationQueue;
    const errors = this.invocationErrors.splice(0);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "GenUI kernel: invocation failures");
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
  restore(cp: Checkpoint): Promise<Patch> {
    return this.enqueueMutation(async () => {
      const ops: PatchOp[] = Object.entries(cp.state).map(([namespace, value]) => ({
        op: "set" as const,
        path: namespace,
        value: value as Json,
      }));
      this.store.apply(ops);
      this.rev += 1;
      const patch = { rev: this.rev, ops };
      this.publishPatch(patch);
      return patch;
    });
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
  compensate(effects: OrchestratorEffect[]): Promise<Patch> {
    return this.enqueueMutation(async () => {
      const ops: PatchOp[] = [];
      const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
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
        for (const followUp of result.events ?? []) await this.settle(followUp, ops, 0, [], invokes);
      }
      this.rev += 1;
      const patch = { rev: this.rev, ops };
      this.publishPatch(patch);
      for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
      return patch;
    });
  }
}
