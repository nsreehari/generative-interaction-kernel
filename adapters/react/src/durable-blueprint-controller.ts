import {
  createBlueprintDurableBootstrapEvent,
  createBlueprintDurableEffectSettlementEvent,
  createBlueprintDurableTransitionAdapter,
  type BlueprintArtifact,
  type DurableBlueprintSpec,
  type ExternalContext,
} from "@gik/blueprint";
import {
  createDurableRuntime,
  type DurableProvider,
  type RuntimeSnapshotChanges,
  type TransitionRefs,
} from "@gik/durable-runtime";
import {
  CompositeStateModel,
  InMemoryStateModel,
  Kernel,
  unwrap,
  type GIKEvent,
  type InvocationControl,
  type Json,
  type OrchestratorEffect,
  type OrchestratorResult,
  type ResolvedNode,
} from "@gik/kernel";
import type { BundleContextBindings } from "./primitives/bundle-registry";
import type { BundleNative } from "./primitives/bundle";
import { createEffectDispatcher } from "./primitives/effects";
import type { GenUISource } from "./useGenUI";

export interface DurableBlueprintRuntimeOptions {
  runtimeId: string;
  providers: Record<string, DurableProvider>;
  refs: TransitionRefs;
}

export interface DurableBlueprintControllerOptions {
  runtime: DurableBlueprintRuntimeOptions;
  externalContext?: ExternalContext;
  contexts?: BundleContextBindings;
  native?: BundleNative;
}

export class DurableBlueprintController implements GenUISource {
  private readonly runtime;
  private tree: ResolvedNode | null = null;
  private readonly listeners = new Set<() => void>();
  private operation: Promise<void> = Promise.resolve();
  private revision: string | null = null;
  private unsubscribeSnapshot: (() => void) | undefined;

  constructor(
    blueprint: BlueprintArtifact,
    private readonly options: DurableBlueprintControllerOptions,
  ) {
    this.runtime = createDurableRuntime({
      runtimeId: options.runtime.runtimeId,
      providers: options.runtime.providers,
      transitionAdapter: createBlueprintDurableTransitionAdapter({
        blueprint,
        externalContext: options.externalContext,
      }),
      effectHandlers: options.native ? { "*": (effect) => this.executeEffect(effect) } : undefined,
    });
  }

  getTree(): ResolvedNode | null {
    return this.tree;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): Promise<ResolvedNode> {
    return this.enqueue(async () => {
      const initialized = await this.runtime.initializeRuntime(this.options.runtime.refs);
      if (initialized.created) {
        await this.runtime.appendJournal({
          ...this.options.runtime.refs,
          entry: createBlueprintDurableBootstrapEvent(),
        });
      }
      await this.runtime.processEngineWake(this.options.runtime.refs);
      await this.processEffects();
      const tree = await this.refresh();
      if (!this.unsubscribeSnapshot) {
        this.unsubscribeSnapshot = this.runtime.subscribe<Record<string, Json>, DurableBlueprintSpec>(
          this.options.runtime.refs,
          async (changes) => {
            await this.enqueue(() => this.refreshExternal(changes));
          },
          { afterRevision: this.revision },
        );
      }
      return tree;
    });
  }

  stop(): void {
    this.unsubscribeSnapshot?.();
    this.unsubscribeSnapshot = undefined;
  }

  emit(node: string, name: string, payload?: Record<string, unknown>, actorId?: string): Promise<ResolvedNode> {
    const event: GIKEvent = {
      node,
      name,
      ...(payload ? { payload: payload as Record<string, Json> } : {}),
      ...(actorId ? { actorId } : {}),
    };
    return this.enqueue(async () => {
      await this.runtime.appendJournal({ ...this.options.runtime.refs, entry: event });
      const result = await this.runtime.processEngineWake(this.options.runtime.refs);
      if (result.status !== "committed" && result.status !== "idle") {
        throw new Error(`Durable Blueprint transition did not commit: ${result.status}.`);
      }
      await this.processEffects();
      return this.refresh();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  private async processEffects(): Promise<void> {
    if (!this.options.native) return;
    for (let count = 0; count < 100; count += 1) {
      const result = await this.runtime.processQueueLaneItem(this.options.runtime.refs);
      if (result.status === "idle") return;
      if (result.status !== "completed") {
        throw new Error(`Durable Blueprint effect did not complete: ${result.status}${"error" in result ? ` (${result.error})` : ""}.`);
      }
      const transition = await this.runtime.processEngineWake(this.options.runtime.refs);
      if (transition.status !== "committed" && transition.status !== "idle") {
        throw new Error(`Durable Blueprint effect settlement did not commit: ${transition.status}.`);
      }
    }
    throw new Error("Durable Blueprint effect processing exceeded 100 items.");
  }

  private async executeEffect(value: unknown): Promise<GIKEvent[]> {
    const effect = value as OrchestratorEffect;
    const snapshot = await this.runtime.readSnapshot<Record<string, Json>, DurableBlueprintSpec>(
      this.options.runtime.refs,
    );
    const { vocabulary, externalContext } = snapshot.spec.materializedBlueprint.payload;
    const local = new InMemoryStateModel(unwrap(vocabulary).namespaces ?? []);
    local.apply(Object.entries(snapshot.state).map(([path, stateValue]) => ({ op: "set", path, value: stateValue })));
    const externalContextStore = new InMemoryStateModel(["externalContext"]);
    externalContextStore.apply([{ op: "set", path: "externalContext", value: structuredClone(externalContext) }]);
    const state = new CompositeStateModel(local, {
      ...this.options.contexts,
      externalContext: externalContextStore,
    });
    const fallback = createEffectDispatcher(state, this.options.native?.effectHandlers ?? {});
    const orchestrator = this.options.native?.wrapOrchestrator?.(fallback, state) ?? fallback;
    let emitted: OrchestratorResult | undefined;
    const control: InvocationControl = {
      id: crypto.randomUUID(),
      signal: new AbortController().signal,
      emitProgress: async () => undefined,
      emit: async (result = {}) => { emitted = result; },
    };
    const returned = effect.kind === "invoke"
      ? await orchestrator.invoke?.(effect, control)
      : effect.kind === "confirm"
        ? await orchestrator.confirm?.(effect)
        : await orchestrator.route?.(effect);
    const result = returned ?? emitted;
    return result ? [createBlueprintDurableEffectSettlementEvent(result)] : [];
  }

  private async refresh(): Promise<ResolvedNode> {
    const snapshot = await this.runtime.readSnapshot<Record<string, Json>, DurableBlueprintSpec>(
      this.options.runtime.refs,
    );
    this.revision = snapshot.revision;
    const { vocabulary, program, externalContext } = snapshot.spec.materializedBlueprint.payload;
    const local = new InMemoryStateModel(unwrap(vocabulary).namespaces ?? []);
    local.apply(Object.entries(snapshot.state).map(([path, value]) => ({ op: "set", path, value })));
    const externalContextStore = new InMemoryStateModel(["externalContext"]);
    externalContextStore.apply([{ op: "set", path: "externalContext", value: structuredClone(externalContext) }]);
    const state = new CompositeStateModel(local, {
      ...this.options.contexts,
      externalContext: externalContextStore,
    });
    this.tree = await new Kernel(vocabulary, program, { state }).resolve();
    for (const listener of this.listeners) listener();
    return this.tree!;
  }

  private refreshExternal(changes: RuntimeSnapshotChanges): Promise<ResolvedNode> {
    const nextRevision = changes.kind === "reset" ? changes.snapshot.revision : changes.revision;
    if (nextRevision === this.revision && this.tree) return Promise.resolve(this.tree);
    return this.refresh();
  }
}