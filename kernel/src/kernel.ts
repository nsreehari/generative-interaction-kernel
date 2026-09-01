// The reference kernel: holds the Store, applies the pure reducer, and
// emits patches. It owns no domain knowledge and no time beyond the rev counter.

import {
  InMemoryStateModel,
  CompositeStateModel,
  JsonataExpressionProvider,
  SyncJsonataExpressionProvider,
  VocabularyRegistry,
  NullOrchestrator,
  type CapabilityRegistry,
  type ExpressionProvider,
  type Orchestrator,
  type StateModel,
} from "./providers";
import { resolveNode } from "./interpret";
import { reduce, reduceActions } from "./reduce";
import { validateJsonValue, validateProgramMessage, validateProgramDefinition } from "./validate";
import { ContinuousGraphRuntime, type GraphNodeExecutor } from "./graph-runtime";
import {
  unwrap,
  type DocNode,
  type ExecutableProgramDefinition,
  type Enveloped,
  type GIKEvent,
  InvocationClosedError,
  type InvocationControl,
  type InvocationId,
  type InvocationProgress,
  type Json,
  type ExecutableVocabularyManifest,
  type OrchestratorEffect,
  type OrchestratorResult,
  type Patch,
  type Checkpoint,
  type RecordedEffect,
  type PatchOp,
  type ResolvedNode,
  type TraceSink,
  type ExecutionBudget,
  type ExecutionSnapshot,
  type GraphExecutionResult,
  type GraphMutation,
  type GraphNodeExecutionOutcome,
  type ProgramNode,
  type ProgramPatch,
  type PortToken,
  type TransitionResult,
  type SourceRunState,
} from "./types";
import {
  completeSourceRequest,
  hasPendingSourceRequest,
  initialSourceRunState,
  isSourceInFlight,
  nextSourceRequestToken,
} from "./source-run-state";
import { DerivationScheduler } from "./derivations";
import { applyProgramPatch as applyProgramPatchToDefinition, diffProgram } from "./program-patch";

export interface RuntimeProgramPatchContext {
  source: "effect" | "graph";
  actorId?: string;
  node?: string;
}

export type ProgramPatchAdmission = (
  patch: ProgramPatch,
  context: RuntimeProgramPatchContext,
) => ProgramPatch | false | Promise<ProgramPatch | false>;

export interface CheckpointOptions {
  includeProgram?: boolean;
}

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
  /** Admission for runtime-originated program patches. Omission rejects such patches. */
  admitProgramPatch?: ProgramPatchAdmission;
  /** Executes host-defined graph extension operations. */
  executeGraphExtension?: GraphNodeExecutor;
}

export class ProjectionUnavailableError extends Error {
  constructor() {
    super("This runtime document has no projection root");
    this.name = "ProjectionUnavailableError";
  }
}

// Bounds runaway effect/event chains (e.g. an invoke whose result re-triggers itself).
const MAX_SETTLE_DEPTH = 32;

// Deep-clone pure JSON state so a captured checkpoint is immutable against later store mutations.
// State is JSON by contract, so a round-trip is sufficient (and env-independent).
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function flattenState(value: Json, prefix = "", result: Record<PortToken, Json> = {}): Record<PortToken, Json> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (prefix) result[prefix] = value;
    for (const [key, child] of Object.entries(value)) {
      flattenState(child, prefix ? `${prefix}.${key}` : key, result);
    }
  } else if (prefix) {
    result[prefix] = value;
  }
  return result;
}

export class Kernel {
  private rev = 0;
  private doc: ExecutableProgramDefinition;
  private readonly manifest: ExecutableVocabularyManifest;
  private readonly store: StateModel;
  private derivations: DerivationScheduler;
  private graph?: ContinuousGraphRuntime;
  private readonly expr: ExpressionProvider;
  private readonly predicateExpr: ExpressionProvider;
  private readonly registry: CapabilityRegistry;
  private readonly orchestrator: Orchestrator;
  private readonly sink?: TraceSink;
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
  private readonly graphInvocationNodes = new Map<InvocationId, string>();
  private readonly sourcePromotionTokens = new Map<string, string>();
  private readonly settledSourcePromotions = new Set<string>();
  private readonly admitProgramPatch?: ProgramPatchAdmission;
  private readonly executeGraphExtension?: GraphNodeExecutor;
  private collectingProgramPatch?: ProgramPatch[number][];
  private collectingCompletedWithinRun?: import("./types").CompletedWithinRun[];

  constructor(
    manifest: Enveloped<ExecutableVocabularyManifest>,
    document: Enveloped<ExecutableProgramDefinition>,
    opts: KernelOptions = {}
  ) {
    if (opts.validate !== false) validateProgramMessage(document);

    this.manifest = unwrap(manifest);
    this.doc = unwrap(document);
    if (opts.validate !== false) validateProgramDefinition(this.doc, this.manifest.capabilities);
    this.expr = opts.expression ?? new JsonataExpressionProvider();
    this.predicateExpr = opts.predicateExpression ?? new JsonataExpressionProvider({ safe: true });
    this.registry = opts.registry ?? VocabularyRegistry.fromVocabulary(this.manifest);
    const local = opts.state ?? new InMemoryStateModel(this.manifest.namespaces ?? []);
    this.store =
      opts.contexts && Object.keys(opts.contexts).length > 0
        ? new CompositeStateModel(local, opts.contexts)
        : local;
    this.derivations = new DerivationScheduler(this.doc.derivations);
    this.graph = this.doc.graph
      ? new ContinuousGraphRuntime(this.doc.graph, this.expr, (node, inputs, event) =>
          this.executeGraphNode(node, inputs, event))
      : undefined;
    this.orchestrator = opts.orchestrator ?? new NullOrchestrator();
    this.sink = opts.sink;
    this.admitProgramPatch = opts.admitProgramPatch;
    this.executeGraphExtension = opts.executeGraphExtension;
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
  * Reduce an event to its initiating patch. Request and route effects settle inline;
  * invoke effects start after commit and publish their terminal result in a later patch.
   */
  dispatch(event: GIKEvent): Promise<Patch> {
    return this.enqueueMutation(async () => {
      const program: ProgramPatch[number][] = [];
      const completedWithinRun: import("./types").CompletedWithinRun[] = [];
      this.collectingProgramPatch = program;
      this.collectingCompletedWithinRun = completedWithinRun;
      try {
        const ops: PatchOp[] = [];
        const fired: OrchestratorEffect[] = [];
        const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
        await this.settle(event, ops, 0, fired, invokes);
        if (this.graph) {
          await this.applyGraphResult(
            await this.graph.publish(flattenState(this.store.snapshot())),
            ops,
            fired,
            invokes,
          );
          await this.applyGraphResult(await this.graph.dispatch(event), ops, fired, invokes);
        }
        this.rev += 1;
        for (const effect of fired) {
          const invocationId = invokes.find((entry) => entry.effect === effect)?.id;
          this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect, invocationId });
        }
        const patch = {
          rev: this.rev,
          ops,
          ...(completedWithinRun.length > 0 ? { completedWithinRun } : {}),
          ...(program.length > 0 ? { program } : {}),
        };
        this.publishPatch(patch);
        for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
        return patch;
      } finally {
        this.collectingProgramPatch = undefined;
        this.collectingCompletedWithinRun = undefined;
      }
    });
  }

  start(budget?: ExecutionBudget): Promise<TransitionResult> {
    return this.enqueueGraphTransition(async () => {
      const graph = this.requireGraph();
      const seeded = await graph.publish(flattenState(this.store.snapshot()), budget);
      if (seeded.status === "yielded") return seeded;
      return this.mergeGraphResults(seeded, await graph.start(budget));
    });
  }

  publish(values: Record<PortToken, Json>, budget?: ExecutionBudget): Promise<TransitionResult> {
    return this.enqueueGraphTransition(() => this.requireGraph().publish(values, budget));
  }

  publishSync(values: Record<PortToken, Json>, budget?: ExecutionBudget): TransitionResult {
    if (!(this.expr instanceof SyncJsonataExpressionProvider)) {
      throw new Error("Synchronous Kernel publication requires SyncJsonataExpressionProvider");
    }
    const previousRevision = this.rev;
    const graphResult = this.requireGraph().publishSync(values, budget);
    if (
      graphResult.operations.length > 0 ||
      graphResult.effects.length > 0 ||
      graphResult.events.length > 0 ||
      (graphResult.program?.length ?? 0) > 0
    ) {
      throw new Error("Synchronous Kernel publication supports output-only deterministic compiler graphs");
    }
    const ops: PatchOp[] = [];
    this.applyGraphPublications(graphResult, ops);
    if (ops.length > 0) this.rev += 1;
    const patch = { rev: this.rev, ops };
    if (ops.length > 0) this.publishPatch(patch);
    return {
      previousRevision,
      revision: this.rev,
      status: graphResult.status,
      state: cloneJson(this.store.snapshot()),
      patch,
      effects: [],
      execution: this.executionSnapshot(),
    };
  }

  hydrateGraph(values: Record<PortToken, Json>): void {
    this.graph?.hydrate(values);
  }

  settleSourceEffect(effect: OrchestratorEffect, result: OrchestratorResult): Promise<Patch> {
    return this.enqueueMutation(async () => {
      if (!this.isCurrentSourceEffect(effect)) return { rev: this.rev, ops: [] };
      const previousCompletedWithinRun = this.collectingCompletedWithinRun;
      const completedWithinRun: import("./types").CompletedWithinRun[] = [];
      this.collectingCompletedWithinRun = completedWithinRun;
      try {
      const ops: PatchOp[] = [];
      const fired: OrchestratorEffect[] = [];
      const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
      const resultOps = await this.sourceResultOperations(effect, result);
      if (resultOps.length > 0) await this.applyAndDerive(resultOps, ops);
      await this.completeAndPromoteSourceEffect(
        effect,
        result.outcome === "failed" ? "failure" : "success",
        ops,
        fired,
        invokes,
        result.detail,
      );
      for (const followUp of result.events ?? []) await this.settle(followUp, ops, 0, fired, invokes);
      this.rev += 1;
      for (const firedEffect of fired) {
        const invocationId = invokes.find((entry) => entry.effect === firedEffect)?.id;
        this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect: firedEffect, invocationId });
      }
      const patch = {
        rev: this.rev,
        ops,
        ...(completedWithinRun.length > 0 ? { completedWithinRun } : {}),
      };
      this.publishPatch(patch);
      for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
      return patch;
      } finally {
        this.collectingCompletedWithinRun = previousCompletedWithinRun;
      }
    });
  }

  settleRequestEffect(effect: OrchestratorEffect, result: OrchestratorResult): Promise<Patch> {
    return this.enqueueMutation(async () => {
      if (effect.kind !== "request") throw new Error("Only request effects admit queued request settlements");
      if (!result.settlement) throw new Error(`Request effect '${effect.effectId ?? "unknown"}' has no settlement`);
      if (result.ops?.length || result.events?.length || result.program || result.sourceOutput !== undefined || result.outputs) {
        throw new Error("Queued request settlements may only contain settlement data");
      }
      this.validateEffectSettlement(effect, result);
      const settlementEvents = this.effectSettlementEvents(effect, result);
      const previousCompletedWithinRun = this.collectingCompletedWithinRun;
      const completedWithinRun: import("./types").CompletedWithinRun[] = [];
      this.collectingCompletedWithinRun = completedWithinRun;
      try {
        const ops: PatchOp[] = [];
        const fired: OrchestratorEffect[] = [];
        const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
        for (const event of settlementEvents) {
          await this.settle(event, ops, 0, fired, invokes);
          if (this.graph) {
            await this.applyGraphResult(
              await this.graph.publish(flattenState(this.store.snapshot())),
              ops,
              fired,
              invokes,
            );
            await this.applyGraphResult(await this.graph.dispatch(event), ops, fired, invokes);
          }
        }
        this.rev += 1;
        for (const firedEffect of fired) {
          const invocationId = invokes.find((entry) => entry.effect === firedEffect)?.id;
          this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect: firedEffect, invocationId });
        }
        const patch = {
          rev: this.rev,
          ops,
          ...(completedWithinRun.length > 0 ? { completedWithinRun } : {}),
        };
        this.publishPatch(patch);
        for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
        return patch;
      } finally {
        this.collectingCompletedWithinRun = previousCompletedWithinRun;
      }
    });
  }

  mutate(mutations: readonly GraphMutation[], budget?: ExecutionBudget): Promise<TransitionResult> {
    return this.applyProgramPatch([{ op: "mutateGraph", mutations }], budget);
  }

  /** Return an immutable snapshot of the current executable program. */
  program(): ExecutableProgramDefinition {
    return structuredClone(this.doc);
  }

  /** Apply an already-authorized program patch as one revisioned Kernel transition. */
  applyProgramPatch(program: ProgramPatch, budget?: ExecutionBudget): Promise<TransitionResult> {
    return this.enqueueProgramTransition(program, budget);
  }

  resume(budget?: ExecutionBudget): Promise<TransitionResult> {
    return this.enqueueGraphTransition(() => this.requireGraph().resume(budget));
  }

  execution(): ExecutionSnapshot {
    const graph = this.requireGraph();
    return {
      topologyVersion: graph.inspect().topologyVersion,
      status: graph.status(),
      tokens: graph.snapshotTokens(),
      nodes: graph.snapshotNodes(),
      readyNodes: graph.readyNodeIds(),
      runningInvocations: [...this.activeInvocations.keys()],
    };
  }

  /** Settle derivations and publish the current state into the consequence graph. */
  syncExternal(): Promise<Patch> {
    return this.enqueueMutation(async () => {
      const ops: PatchOp[] = [];
      const fired: OrchestratorEffect[] = [];
      const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
      ops.push(...await this.derivations.settleAll(this.store, this.expr));
      if (this.graph) {
        await this.applyGraphResult(
          await this.graph.publish(flattenState(this.store.snapshot())),
          ops,
          fired,
          invokes,
        );
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

    const { ops, traces, effects, completedWithinRun } = await reduce(
      this.doc,
      this.store,
      event,
      this.expr,
      this.predicateExpr,
    );
    this.collectingCompletedWithinRun?.push(...completedWithinRun);
    await this.applyAndDerive(ops, acc);
    for (const t of traces) this.sink?.(t);

    await this.runEffects(effects, acc, depth, journal, invokes);
  }

  private async runEffects(
    effects: OrchestratorEffect[],
    acc: PatchOp[],
    depth: number,
    journal: OrchestratorEffect[],
    invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }>
  ): Promise<void> {
    for (const candidate of effects) {
      const identified = candidate.effectId
        ? candidate
        : { ...candidate, effectId: `effect-${this.rev + 1}-${this.effectSeq + journal.length}` };
      const effect = identified.kind === "invoke"
        && identified.control.sourceId
        && !identified.control.sourceRequestToken
        ? await this.admitSourceEffect(identified, acc)
        : identified;
      if (!effect) continue;
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
      const handler = effect.kind === "request" ? this.orchestrator.request : this.orchestrator.route;

      if (!handler) {
        this.sink?.({ event: "effect", node: effect.node, detail: { kind: effect.kind, unhandled: true } });
        continue;
      }

      const result = await handler.call(this.orchestrator, effect);
      if (!result) continue;
      this.validateEffectSettlement(effect, result);

      this.sink?.({
        event: "effect",
        node: effect.node,
        detail: {
          kind: effect.kind,
          phase: "outcome",
          outcome: result.outcome ?? "settled",
          actorId: effect.actorId,
          opCount: result.ops?.length ?? 0,
          eventCount: result.events?.length ?? 0,
          ...(result.detail ?? {}),
        },
      });

      if (result.ops?.length) {
        await this.applyAndDerive(result.ops, acc);
      }
      await this.collectRuntimeProgramPatch(result.program, {
        source: "effect",
        actorId: effect.actorId,
        node: effect.node,
      });
      for (const followUp of [...(result.events ?? []), ...this.effectSettlementEvents(effect, result)]) {
        await this.settle(followUp, acc, depth + 1, journal, invokes);
      }
    }
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);
    this.mutationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private requireGraph(): ContinuousGraphRuntime {
    if (!this.graph) throw new Error("This program does not declare a graph");
    return this.graph;
  }

  private async enqueueProgramTransition(
    programPatch: ProgramPatch,
    budget?: ExecutionBudget,
  ): Promise<TransitionResult> {
    return this.enqueueMutation(async () => {
      const previousRevision = this.rev;
      const effectStart = this.effectLog.length;
      const program: ProgramPatch[number][] = [...programPatch];
      this.collectingProgramPatch = program;
      try {
        this.commitProgramPatch(programPatch);
        const graphResult = this.graph ? await this.graph.resume(budget) : undefined;
        const ops: PatchOp[] = [];
        const fired: OrchestratorEffect[] = [];
        const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
        if (graphResult) await this.applyGraphResult(graphResult, ops, fired, invokes);
        this.rev += 1;
        for (const effect of fired) {
          const invocationId = invokes.find((entry) => entry.effect === effect)?.id;
          this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect, invocationId });
        }
        const patch: Patch = { rev: this.rev, ops, program };
        this.publishPatch(patch);
        for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
        return {
          previousRevision,
          revision: this.rev,
          status: graphResult?.status ?? "quiescent",
          state: cloneJson(this.store.snapshot()),
          patch,
          program,
          effects: this.effectLog.slice(effectStart).map((entry) => ({ ...entry })),
          execution: this.executionSnapshot(),
        };
      } finally {
        this.collectingProgramPatch = undefined;
      }
    });
  }

  private commitProgramPatch(patch: ProgramPatch): void {
    if (patch.length === 0) throw new Error("Program patch must contain at least one operation");
    const candidate = applyProgramPatchToDefinition(this.doc, patch);
    validateProgramMessage({ gik: "0.1", type: "program", payload: candidate });
    validateProgramDefinition(candidate, this.manifest.capabilities);

    const graphMutations = patch.length === 1 && patch[0].op === "mutateGraph"
      ? patch[0].mutations
      : undefined;
    const nextDerivations = new DerivationScheduler(candidate.derivations);
    const graphChanged = JSON.stringify(candidate.graph) !== JSON.stringify(this.doc.graph);
    const nextGraph = graphChanged && !graphMutations && candidate.graph
      ? new ContinuousGraphRuntime(candidate.graph, this.expr, (node, inputs, event) =>
          this.executeGraphNode(node, inputs, event))
      : undefined;

    if (graphMutations && this.graph) {
      this.graph.mutate(graphMutations);
    } else if (graphChanged) {
      this.graph = nextGraph;
    }
    this.doc = candidate;
    this.derivations = nextDerivations;
  }

  private async admitRuntimeProgramPatch(
    patch: ProgramPatch | undefined,
    context: RuntimeProgramPatchContext,
  ): Promise<ProgramPatch | undefined> {
    if (!patch?.length) return undefined;
    if (!this.admitProgramPatch) throw new Error("Runtime program patch has no configured admission hook");
    const admitted = await this.admitProgramPatch(patch, context);
    if (admitted === false) throw new Error("Runtime program patch was rejected");
    return admitted;
  }

  private async collectRuntimeProgramPatch(
    patch: ProgramPatch | undefined,
    context: RuntimeProgramPatchContext,
  ): Promise<void> {
    const admitted = await this.admitRuntimeProgramPatch(patch, context);
    if (!admitted) return;
    if (!this.collectingProgramPatch) {
      throw new Error("Runtime program patch was produced outside a Kernel transition");
    }
    this.commitProgramPatch(admitted);
    this.collectingProgramPatch.push(...admitted);
  }

  private executionSnapshot(): ExecutionSnapshot {
    return this.graph ? this.execution() : {
      topologyVersion: 0,
      status: "quiescent",
      tokens: {},
      nodes: {},
      readyNodes: [],
      runningInvocations: [...this.activeInvocations.keys()],
    };
  }

  private enqueueGraphTransition(operation: () => Promise<GraphExecutionResult>): Promise<TransitionResult> {
    return this.enqueueMutation(async () => {
      const previousRevision = this.rev;
      const effectStart = this.effectLog.length;
      const program: ProgramPatch[number][] = [];
      this.collectingProgramPatch = program;
      try {
        const graphResult = await operation();
        const ops: PatchOp[] = [];
        const fired: OrchestratorEffect[] = [];
        const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
        await this.applyGraphResult(graphResult, ops, fired, invokes);
        if (ops.length > 0 || fired.length > 0 || program.length > 0) this.rev += 1;
        for (const effect of fired) {
          const invocationId = invokes.find((entry) => entry.effect === effect)?.id;
          this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect, invocationId });
        }
        const patch = { rev: this.rev, ops, ...(program.length > 0 ? { program } : {}) };
        if (ops.length > 0 || program.length > 0) this.publishPatch(patch);
        for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
        return {
          previousRevision,
          revision: this.rev,
          status: graphResult.status,
          state: cloneJson(this.store.snapshot()),
          patch,
          ...(program.length > 0 ? { program } : {}),
          effects: this.effectLog.slice(effectStart).map((entry) => ({ ...entry })),
          execution: this.executionSnapshot(),
        };
      } finally {
        this.collectingProgramPatch = undefined;
      }
    });
  }

  private applyGraphPublications(result: GraphExecutionResult, acc: PatchOp[]): void {
    for (const [path, value] of Object.entries(result.publications)) {
      const operation: PatchOp = { op: "set", path, value };
      this.store.apply([operation]);
      acc.push(operation);
    }
  }

  private mergeGraphResults(first: GraphExecutionResult, second: GraphExecutionResult): GraphExecutionResult {
    return {
      status: second.status,
      publications: { ...first.publications, ...second.publications },
      operations: [...first.operations, ...second.operations],
      effects: [...first.effects, ...second.effects],
      events: [...first.events, ...second.events],
      ...((first.program?.length || second.program?.length)
        ? { program: [...(first.program ?? []), ...(second.program ?? [])] }
        : {}),
      readyNodes: second.readyNodes,
      nodeExecutions: first.nodeExecutions + second.nodeExecutions,
      publicationCount: first.publicationCount + second.publicationCount,
    };
  }

  private async applyGraphResult(
    result: GraphExecutionResult,
    acc: PatchOp[],
    fired: OrchestratorEffect[],
    invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }>,
  ): Promise<void> {
    await this.collectRuntimeProgramPatch(result.program, { source: "graph" });
    this.applyGraphPublications(result, acc);
    await this.applyAndDerive(result.operations, acc);
    const invokeStart = invokes.length;
    await this.runEffects(result.effects, acc, 0, fired, invokes);
    const graphNodes = this.graph?.snapshotNodes();
    for (const invocation of invokes.slice(invokeStart)) {
      if (graphNodes?.[invocation.effect.node]?.status === "suspended") {
        this.graphInvocationNodes.set(invocation.id, invocation.effect.node);
      }
    }
    for (const event of result.events) await this.settle(event, acc, 0, fired, invokes);
  }

  private executeGraphNode(
    node: ProgramNode,
    inputs: Record<string, Json>,
    event?: GIKEvent,
  ): GraphNodeExecutionOutcome | Promise<GraphNodeExecutionOutcome> {
    if (node.operation.kind === "extension") {
      if (!this.executeGraphExtension) {
        throw new Error(`No host executor is registered for graph extension '${node.operation.name}'`);
      }
      return this.executeGraphExtension(node, inputs, event);
    }
    if (node.operation.kind === "actions") {
      return this.executeGraphActions(node, inputs, event);
    }
    if (node.operation.kind === "invoke") {
      return this.executeGraphInvoke(node, inputs, event);
    }
    throw new Error(`Graph node operation '${node.operation.kind}' does not require Kernel execution context`);
  }

  private async executeGraphActions(
    node: ProgramNode,
    inputs: Record<string, Json>,
    event?: GIKEvent,
  ): Promise<GraphNodeExecutionOutcome> {
      if (node.operation.kind !== "actions") throw new Error(`Graph node '${node.id}' is not an actions node`);
      const result = await reduceActions(
        this.store,
        node.id,
        node.operation.actions,
        this.expr,
        this.predicateExpr,
        { inputs, event: event?.payload ?? {} },
      );
      this.collectingCompletedWithinRun?.push(...result.completedWithinRun);
      for (const trace of result.traces) this.sink?.(trace);
      return {
        operations: result.ops,
        effects: result.effects,
        events: result.emitted,
      };
  }

  private async executeGraphInvoke(
    node: ProgramNode,
    inputs: Record<string, Json>,
    event?: GIKEvent,
  ): Promise<GraphNodeExecutionOutcome> {
      if (node.operation.kind !== "invoke") throw new Error(`Graph node '${node.id}' is not an invoke node`);
      const args: Record<string, Json> = {};
      for (const [name, expression] of Object.entries(node.operation.arguments ?? {})) {
        args[name] = await this.expr.eval(expression, this.store.snapshot(), {
          inputs,
          event: event?.payload ?? {},
        });
      }
      return {
        effects: [{
          kind: "invoke",
          node: node.id,
          control: { tool: node.operation.tool },
          data: args,
        }],
        suspended: true,
      };
  }

  private async applyAndDerive(operations: readonly PatchOp[], acc: PatchOp[]): Promise<void> {
    if (operations.length === 0) return;
    this.store.apply([...operations]);
    acc.push(...operations);
    acc.push(...await this.derivations.settle(
      operations.map(({ path }) => path),
      this.store,
      this.expr,
    ));
  }

  private startInvocation(effect: OrchestratorEffect, id: InvocationId): void {
    if (effect.kind !== "invoke") return;
    const invokeEffect = effect;
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
          node: invokeEffect.node,
          effect: "invoke",
          ...(invokeEffect.control.tool ? { tool: invokeEffect.control.tool } : {}),
          ...(invokeEffect.actorId ? { actorId: invokeEffect.actorId } : {}),
          name: progress.name,
          ...(progress.detail ? { detail: progress.detail } : {}),
        };
        this.publishProgress(envelope);
      }),
      emit: (result = {}) => this.enqueueInvocation(id, () => this.settleInvocation(id, result)),
    };
    const task = Promise.resolve()
      .then(() => handler.call(this.orchestrator, invokeEffect, control))
      .then(async (result) => {
        if (!this.activeInvocations.has(id)) {
          if (result) throw new InvocationClosedError(id);
          return;
        }
        await control.emit(result ?? {});
      })
      .catch(async (error) => {
        if (this.activeInvocations.has(id)) {
          try {
            await this.settleInvocation(id, {}, "failure");
          } catch (settlementError) {
            if (!(settlementError instanceof InvocationClosedError && active.controller.signal.aborted)) {
              this.invocationErrors.push(settlementError);
            }
          }
        }
        if (!(error instanceof InvocationClosedError && active.controller.signal.aborted)) {
          this.invocationErrors.push(error);
        }
        this.sink?.({
          event: "effect",
          node: invokeEffect.node,
          detail: { kind: "invoke", tool: invokeEffect.control.tool, phase: "error", message: String(error) },
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

  private async settleInvocation(
    id: InvocationId,
    result: OrchestratorResult,
    completionStatus: "success" | "failure" = result.outcome === "failed" ? "failure" : "success",
  ): Promise<void> {
    const active = this.requireActiveInvocation(id);
    active.closed = true;
    try {
      await this.enqueueMutation(async () => {
        if (this.activeInvocations.get(id) !== active || active.controller.signal.aborted) {
          throw new InvocationClosedError(id);
        }
        const program: ProgramPatch[number][] = [];
        this.collectingProgramPatch = program;
        try {
        const ops: PatchOp[] = [];
        const fired: OrchestratorEffect[] = [];
        const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
        this.validateEffectSettlement(active.effect, result);
        const resultOps = await this.sourceResultOperations(active.effect, result);
        if (resultOps.length > 0) {
          await this.applyAndDerive(resultOps, ops);
        }
        if (this.graph && resultOps.length > 0
          && (active.effect.kind !== "invoke" || !active.effect.control.sourceId)) {
          await this.applyGraphResult(
            await this.graph.publish(flattenState(this.store.snapshot())),
            ops,
            fired,
            invokes,
          );
        }
        await this.completeAndPromoteSourceEffect(active.effect, completionStatus, ops, fired, invokes, result.detail);
        await this.collectRuntimeProgramPatch(result.program, {
          source: "effect",
          actorId: active.effect.actorId,
          node: active.effect.node,
        });
        const graphNodeId = this.graphInvocationNodes.get(id);
        if (graphNodeId && this.graph) {
          const graphResult = await this.graph.complete(graphNodeId, result.outputs ?? {});
          await this.applyGraphResult(graphResult, ops, fired, invokes);
        }
        for (const followUp of [
          ...(result.events ?? []),
          ...this.effectSettlementEvents(active.effect, result),
        ]) {
          await this.settle(followUp, ops, 0, fired, invokes);
        }
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
            tool: active.effect.kind === "invoke" ? active.effect.control.tool : undefined,
            phase: "outcome",
            outcome: result.outcome ?? "settled",
            actorId: active.effect.actorId,
            opCount: result.ops?.length ?? 0,
            eventCount: result.events?.length ?? 0,
            ...(result.detail ?? {}),
          },
        });
        const patch = { rev: this.rev, ops, ...(program.length > 0 ? { program } : {}) };
        this.publishPatch(patch);
        for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
        } finally {
          this.collectingProgramPatch = undefined;
        }
      });
    } finally {
      this.graphInvocationNodes.delete(id);
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

  private async admitSourceEffect(effect: OrchestratorEffect, acc: PatchOp[]): Promise<OrchestratorEffect | undefined> {
    if (effect.kind !== "invoke" || !effect.control.sourceId) return effect;
    if (this.settledSourcePromotions.has(this.sourceKey(effect))) return undefined;
    const sourceId = effect.control.sourceId;
    const cellId = effect.control.sourceCellId ?? effect.node;
    const currentCells = this.store.get("blueprintRunState.cells");
    const cells = currentCells && typeof currentCells === "object" && !Array.isArray(currentCells)
      ? structuredClone(currentCells)
      : {};
    const currentCell = cells[cellId];
    const currentSources = currentCell && typeof currentCell === "object" && !Array.isArray(currentCell)
      ? currentCell.sources
      : undefined;
    const sources = Array.isArray(currentSources) ? structuredClone(currentSources) : [];
    const sourceIndex = sources.findIndex((source) =>
      source && typeof source === "object" && !Array.isArray(source) && source.id === sourceId);
    const storedSource = sourceIndex >= 0 ? sources[sourceIndex] : undefined;
    const source: SourceRunState = storedSource && typeof storedSource === "object" && !Array.isArray(storedSource)
      ? { ...initialSourceRunState(sourceId), ...storedSource }
      : initialSourceRunState(sourceId);
    const promotionToken = this.sourcePromotionTokens.get(this.sourceKey(effect));
    const queueRequestedToken = promotionToken ?? nextSourceRequestToken(source.queueRequestedToken);
    const nextSource = {
      ...source,
      queueRequestedToken,
      ...(!isSourceInFlight(source) || promotionToken ? { lastRequestedToken: queueRequestedToken } : {}),
    };
    if (sourceIndex >= 0) sources[sourceIndex] = nextSource;
    else sources.push(nextSource);
    cells[cellId] = {
      ...(currentCell && typeof currentCell === "object" && !Array.isArray(currentCell) ? currentCell : {}),
      sources,
    };
    await this.applyAndDerive([{ op: "set", path: "blueprintRunState.cells", value: cells }], acc);
    if (isSourceInFlight(source) && !promotionToken) return undefined;
    return { ...effect, control: { ...effect.control, sourceRequestToken: queueRequestedToken } };
  }

  private sourceKey(effect: OrchestratorEffect): string {
    if (effect.kind !== "invoke") return `${effect.node}\u0000`;
    return `${effect.control.sourceCellId ?? effect.node}\u0000${effect.control.sourceId ?? ""}`;
  }

  private isCurrentSourceEffect(effect: OrchestratorEffect): boolean {
    if (effect.kind !== "invoke" || !effect.control.sourceId || !effect.control.sourceRequestToken) return false;
    const cells = this.store.get("blueprintRunState.cells");
    if (!cells || typeof cells !== "object" || Array.isArray(cells)) return false;
    const cell = cells[effect.control.sourceCellId ?? effect.node];
    if (!cell || typeof cell !== "object" || Array.isArray(cell) || !Array.isArray(cell.sources)) return false;
    const source = cell.sources.find((candidate) =>
      candidate && typeof candidate === "object" && !Array.isArray(candidate) && candidate.id === effect.control.sourceId);
    return source !== undefined
      && source !== null
      && typeof source === "object"
      && !Array.isArray(source)
      && source.lastRequestedToken === effect.control.sourceRequestToken;
  }

  private async completeSourceEffect(
    effect: OrchestratorEffect,
    status: "success" | "failure",
    acc: PatchOp[],
    detail?: Record<string, Json>,
  ): Promise<string | undefined> {
    if (effect.kind !== "invoke" || !effect.control.sourceId || !effect.control.sourceRequestToken) return undefined;
    const cellId = effect.control.sourceCellId ?? effect.node;
    const currentCells = this.store.get("blueprintRunState.cells");
    if (!currentCells || typeof currentCells !== "object" || Array.isArray(currentCells)) return undefined;
    const cells = structuredClone(currentCells);
    const currentCell = cells[cellId];
    if (!currentCell || typeof currentCell !== "object" || Array.isArray(currentCell)) return undefined;
    const sources = Array.isArray(currentCell.sources) ? structuredClone(currentCell.sources) : [];
    const sourceIndex = sources.findIndex((source) =>
      source && typeof source === "object" && !Array.isArray(source) && source.id === effect.control.sourceId);
    if (sourceIndex < 0) return undefined;
    const storedSource = sources[sourceIndex];
    if (!storedSource || typeof storedSource !== "object" || Array.isArray(storedSource)) return undefined;
    const source: SourceRunState = { ...initialSourceRunState(effect.control.sourceId), ...storedSource };
    if (source.lastRequestedToken !== effect.control.sourceRequestToken) return undefined;
    const completed = completeSourceRequest(source, effect.control.sourceRequestToken, status, detail);
    sources[sourceIndex] = { ...completed };
    cells[cellId] = {
      ...currentCell,
      sources,
    };
    await this.applyAndDerive([{ op: "set", path: "blueprintRunState.cells", value: cells }], acc);
    return hasPendingSourceRequest(completed) ? completed.queueRequestedToken ?? undefined : undefined;
  }

  private async completeAndPromoteSourceEffect(
    effect: OrchestratorEffect,
    status: "success" | "failure",
    ops: PatchOp[],
    fired: OrchestratorEffect[],
    invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }>,
    detail?: Record<string, Json>,
  ): Promise<void> {
    const pendingSourceToken = await this.completeSourceEffect(effect, status, ops, detail);
    if (effect.kind !== "invoke" || !effect.control.sourceId || !effect.control.sourceRequestToken || !this.graph) return;
    const promotionKey = this.sourceKey(effect);
    if (pendingSourceToken) this.sourcePromotionTokens.set(promotionKey, pendingSourceToken);
    else this.settledSourcePromotions.add(promotionKey);
    try {
      this.graph.hydrate(flattenState(this.store.snapshot()));
      const promotionNode = this.graph.hasNode(effect.node)
        ? effect.node
        : `${effect.control.sourceCellId ?? effect.node}-evaluate`;
      await this.applyGraphResult(await this.graph.activate(promotionNode), ops, fired, invokes);
    } finally {
      this.sourcePromotionTokens.delete(promotionKey);
      this.settledSourcePromotions.delete(promotionKey);
    }
  }

  private async sourceResultOperations(
    effect: OrchestratorEffect,
    result: OrchestratorResult,
  ): Promise<PatchOp[]> {
    if (effect.kind !== "invoke" || !effect.control.sourceId || result.sourceOutput === undefined) {
      return result.ops ?? [];
    }
    const sourceValue = effect.control.sourceOutputTransform
      ? await this.expr.eval(effect.control.sourceOutputTransform.expr, { response: result.sourceOutput })
      : structuredClone(result.sourceOutput);
    const snapshot = this.store.snapshot();
    const runState = snapshot.blueprintRunState;
    const cells = runState && typeof runState === "object" && !Array.isArray(runState)
      && runState.cells && typeof runState.cells === "object" && !Array.isArray(runState.cells)
      ? structuredClone(runState.cells)
      : {};
    const cellId = effect.control.sourceCellId ?? effect.node;
    const currentCell = cells[cellId];
    const cell = currentCell && typeof currentCell === "object" && !Array.isArray(currentCell)
      ? currentCell
      : { sources: [] };
    const currentSourceValues = cell.sourceValues;
    const sourceValues = currentSourceValues && typeof currentSourceValues === "object" && !Array.isArray(currentSourceValues)
      ? currentSourceValues
      : {};
    cells[cellId] = {
      ...cell,
      sourceValues: { ...sourceValues, [effect.control.sourceId]: sourceValue },
    };
    return [
      { op: "set", path: "blueprintRunState.cells", value: cells },
      ...(result.ops ?? []),
    ];
  }

  private validateEffectSettlement(effect: OrchestratorEffect, result: OrchestratorResult): void {
    const responseSchema = effect.kind === "route" ? undefined : effect.control.responseSchema;
    const responseData = result.settlement?.data ?? (effect.kind === "invoke" ? result.sourceOutput : undefined);
    if (responseSchema && responseData !== undefined) {
      validateJsonValue(responseSchema, responseData, `Invalid settlement for effect '${effect.effectId ?? "unknown"}'`);
    }
    if (result.settlement && result.settlement.effectId !== effect.effectId) {
      throw new Error(`Settlement '${result.settlement.effectId}' does not match effect '${effect.effectId ?? "unknown"}'`);
    }
  }

  private effectSettlementEvents(effect: OrchestratorEffect, result: OrchestratorResult): GIKEvent[] {
    const settlement = result.settlement;
    if (!settlement) return [];
    const value = settlement.data;
    const data = value && typeof value === "object" && !Array.isArray(value)
      ? value
      : value === undefined
        ? {}
        : { value };
    const requestContext: Record<string, Json> = effect.kind === "request"
      ? {
          requestContext: {
            ...structuredClone(effect.data),
            ...(effect.effectId !== undefined ? { effectId: effect.effectId } : {}),
          },
        }
      : {};
    return [{
      node: effect.node,
      name: settlement.outcome,
      ...(effect.actorId !== undefined ? { actorId: effect.actorId } : {}),
      payload: {
        ...data,
        ...(settlement.detail ?? {}),
        ...requestContext,
        outcome: settlement.outcome,
      },
    }];
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
    void this.enqueueMutation(async () => {
      const ops: PatchOp[] = [];
      const fired: OrchestratorEffect[] = [];
      const invokes: Array<{ effect: OrchestratorEffect; id: InvocationId }> = [];
      await this.completeAndPromoteSourceEffect(active.effect, "failure", ops, fired, invokes);
      if (ops.length === 0 && fired.length === 0) return;
      this.rev += 1;
      for (const effect of fired) {
        const invocationId = invokes.find((entry) => entry.effect === effect)?.id;
        this.effectLog.push({ rev: this.rev, seq: this.effectSeq++, effect, invocationId });
      }
      const patch = { rev: this.rev, ops };
      this.publishPatch(patch);
      for (const invoke of invokes) this.startInvocation(invoke.effect, invoke.id);
    }).catch((error) => this.invocationErrors.push(error));
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
    if (!this.doc.root) throw new ProjectionUnavailableError();
    return resolveNode(this.doc.root, {
      store: this.store,
      expr: this.expr,
      predicateExpr: this.predicateExpr,
      registry: this.registry,
      sink: this.sink,
    });
  }

  hasProjection(): boolean {
    return this.doc.root !== undefined;
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
  checkpoint(options: CheckpointOptions = {}): Checkpoint {
    return {
      rev: this.rev,
      state: cloneJson(this.store.snapshot()),
      ...(options.includeProgram ? { program: this.program() } : {}),
    };
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
      const program = cp.program ? diffProgram(this.doc, cp.program) : undefined;
      if (program?.length) this.commitProgramPatch(program);
      const restoreOps: PatchOp[] = Object.entries(cp.state).map(([namespace, value]) => ({
        op: "set" as const,
        path: namespace,
        value: value as Json,
      }));
      const ops: PatchOp[] = [];
      await this.applyAndDerive(restoreOps, ops);
      this.rev += 1;
      const patch = { rev: this.rev, ops, ...(program?.length ? { program } : {}) };
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
          await this.applyAndDerive(result.ops, ops);
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
