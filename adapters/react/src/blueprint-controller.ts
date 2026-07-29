import {
  materializeBlueprint,
  prepareBlueprintProgram,
  runMaterializedTransition,
  type BlueprintArtifact,
  type ExternalContext,
  type MaterializedBlueprint,
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
  externalContext?: ExternalContext;
  materializedBlueprint?: MaterializedBlueprint;
  /** @deprecated Use externalContext for immutable transition inputs. This remains initial-state seeding only. */
  context?: Record<string, Json>;
  contexts?: BundleContextBindings;
  native?: BundleNative;
  onTransition?: (event: GIKEvent | null, result: Awaited<ReturnType<typeof runMaterializedTransition>>) => void;
}

export class BlueprintController implements GenUISource {
  private readonly materializedBlueprint: MaterializedBlueprint;
  private state: Record<string, Json>;
  private tree: ResolvedNode | null = null;
  private readonly listeners = new Set<() => void>();
  private operation: Promise<void> = Promise.resolve();

  constructor(blueprint: BlueprintArtifact, private readonly options: BlueprintControllerOptions = {}) {
    this.materializedBlueprint = options.materializedBlueprint ?? materializeBlueprint({
      blueprint,
      externalContext: options.externalContext,
    });
    const prepared = prepareBlueprintProgram(blueprint, { context: options.context });
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
    const result = await runMaterializedTransition({
      state: this.state,
      materializedBlueprint: this.materializedBlueprint,
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
    this.options.onTransition?.(events[0] ? structuredClone(events[0]) : null, result);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  private async refresh(): Promise<ResolvedNode> {
    const { vocabulary, program, externalContext } = this.materializedBlueprint.payload;
    const local = new InMemoryStateModel(unwrap(vocabulary).namespaces ?? []);
    local.apply(Object.entries(this.state).map(([path, value]) => ({ op: "set", path, value })));
    const externalContextStore = new InMemoryStateModel(["externalContext"]);
    externalContextStore.apply([{ op: "set", path: "externalContext", value: structuredClone(externalContext) }]);
    const runtimeState = new CompositeStateModel(local, {
      ...this.options.contexts,
      externalContext: externalContextStore,
    });
    const kernel = new Kernel(vocabulary, program, { state: runtimeState });
    this.tree = await kernel.resolve();
    for (const listener of this.listeners) listener();
    return this.tree;
  }
}