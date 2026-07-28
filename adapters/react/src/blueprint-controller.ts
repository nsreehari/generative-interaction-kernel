import {
  prepareBlueprintProgram,
  runTransition,
  type BlueprintArtifact,
} from "@gik/blueprint";
import {
  CompositeStateModel,
  InMemoryStateModel,
  Kernel,
  unwrap,
  type GIKEvent,
  type Json,
  type ResolvedNode,
  type StateModel,
} from "@gik/kernel";
import type { GenUISource } from "./useGenUI";
import { createEffectDispatcher } from "./primitives/effects";
import type { BundleContextBindings } from "./primitives/bundle-registry";
import type { BundleNative } from "./primitives/bundle";

export interface BlueprintControllerOptions {
  context?: Record<string, Json>;
  contexts?: BundleContextBindings;
  native?: BundleNative;
}

export class BlueprintController implements GenUISource {
  private blueprint: BlueprintArtifact;
  private state: Record<string, Json>;
  private tree: ResolvedNode | null = null;
  private readonly listeners = new Set<() => void>();
  private operation: Promise<void> = Promise.resolve();

  constructor(blueprint: BlueprintArtifact, private readonly options: BlueprintControllerOptions = {}) {
    const prepared = prepareBlueprintProgram(blueprint, { context: options.context });
    this.blueprint = prepared.blueprint;
    this.state = prepared.initialState;
  }

  getTree(): ResolvedNode | null {
    return this.tree;
  }

  getState(): Record<string, Json> {
    return structuredClone(this.state);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): Promise<ResolvedNode> {
    return this.enqueue(async () => {
      await this.transition([]);
      return this.refresh();
    });
  }

  emit(node: string, name: string, payload?: Record<string, unknown>, actorId?: string): Promise<ResolvedNode> {
    const event: GIKEvent = {
      node,
      name,
      ...(payload ? { payload: payload as Record<string, Json> } : {}),
      ...(actorId ? { actorId } : {}),
    };
    return this.enqueue(async () => {
      await this.transition([event]);
      return this.refresh();
    });
  }

  resync(): Promise<ResolvedNode> {
    return this.enqueue(() => this.refresh());
  }

  settle(): Promise<ResolvedNode> {
    return this.enqueue(() => this.refresh());
  }

  private async transition(events: readonly GIKEvent[]): Promise<void> {
    const native = this.options.native;
    const result = await runTransition({
      state: this.state,
      blueprint: this.blueprint,
      events,
      contexts: this.options.contexts,
      ...(native ? {
        createOrchestrator: (store: StateModel) => {
          const fallback = createEffectDispatcher(store, native.effectHandlers ?? {});
          return native.wrapOrchestrator?.(fallback, store) ?? fallback;
        },
      } : {}),
    });
    this.state = result.state;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  private async refresh(): Promise<ResolvedNode> {
    const prepared = prepareBlueprintProgram(this.blueprint);
    const local = new InMemoryStateModel(unwrap(prepared.vocabulary).namespaces ?? []);
    local.apply(Object.entries(this.state).map(([path, value]) => ({ op: "set", path, value })));
    const contexts = this.options.contexts;
    const runtimeState = contexts && Object.keys(contexts).length > 0
      ? new CompositeStateModel(local, contexts)
      : local;
    const kernel = new Kernel(prepared.vocabulary, prepared.program, { state: runtimeState });
    this.tree = await kernel.resolve();
    for (const listener of this.listeners) listener();
    return this.tree;
  }
}