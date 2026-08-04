import {
  createBlueprintDurableBootstrapEvent,
  createBlueprintDurableTransitionAdapter,
  type BlueprintArtifact,
  type DurableBlueprintSpec,
  type ExternalContext,
  type MaterializedBlueprint,
} from "@gik/blueprint";
import type { BlueprintWorker } from "@gik/blueprint/worker";
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
  type Json,
  type ResolvedNode,
} from "@gik/kernel";
import type { BundleContextBindings } from "./primitives/bundle-registry";
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
  worker?: BlueprintWorker;
  materializedBlueprint?: MaterializedBlueprint;
  onTransition?: Parameters<typeof createBlueprintDurableTransitionAdapter>[0]["onTransition"];
}

export class DurableBlueprintController implements GenUISource {
  private readonly runtime;
  private tree: ResolvedNode | null = null;
  private readonly listeners = new Set<() => void>();
  private operation: Promise<void> = Promise.resolve();
  private revision: string | null = null;
  private state: Record<string, Json> = {};
  private unsubscribeSnapshot: (() => void) | undefined;
  private lifecycleVersion = 0;

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
        materializedBlueprint: options.materializedBlueprint,
        onTransition: options.onTransition,
      }),
    });
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
    const lifecycleVersion = ++this.lifecycleVersion;
    return this.enqueue(async () => {
      const initialized = await this.runtime.initializeRuntime(this.options.runtime.refs);
      if (initialized.created) {
        await this.runtime.appendJournal({
          ...this.options.runtime.refs,
          entry: createBlueprintDurableBootstrapEvent(),
        });
      }
      this.options.worker?.notify();
      const tree = await this.refresh();
      if (lifecycleVersion === this.lifecycleVersion && !this.unsubscribeSnapshot) {
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
    this.lifecycleVersion += 1;
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
      this.options.worker?.notify();
      return this.refresh();
    });
  }

  resync(): Promise<ResolvedNode> {
    return this.enqueue(() => this.refresh());
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  private async refresh(): Promise<ResolvedNode> {
    const snapshot = await this.runtime.readSnapshot<Record<string, Json>, DurableBlueprintSpec>(
      this.options.runtime.refs,
    );
    this.revision = snapshot.revision;
    this.state = structuredClone(snapshot.state);
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