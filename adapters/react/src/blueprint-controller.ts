import {
  materializeBlueprint,
  prepareBlueprintProgram,
  type BlueprintArtifact,
  type ExternalContext,
  type MaterializedBlueprint,
} from "@gik/blueprint";
import type { BlueprintWorker } from "@gik/blueprint/worker";
import { createMemoryStorage } from "@gik/durable-runtime/storage/memory";
import type { Json, ResolvedNode } from "@gik/kernel";
import { DurableBlueprintController } from "./durable-blueprint-controller";
import { createNativeBlueprintWorker } from "./durable-blueprint-worker";
import type { BundleNative } from "./primitives/bundle";
import type { BundleContextBindings } from "./primitives/bundle-registry";
import type { GenUISource } from "./useGenUI";

export interface BlueprintControllerOptions {
  externalContext?: ExternalContext;
  materializedBlueprint?: MaterializedBlueprint;
  /** @deprecated Use externalContext for immutable transition inputs. This remains initial-state seeding only. */
  context?: Record<string, Json>;
  contexts?: BundleContextBindings;
  native?: BundleNative;
  onTransition?: NonNullable<ConstructorParameters<typeof DurableBlueprintController>[1]["onTransition"]>;
}

function memoryRef(value: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "memory", value }));
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `b64:${encoded}`;
}

export class BlueprintController implements GenUISource {
  private readonly controller: DurableBlueprintController;
  readonly worker: BlueprintWorker;

  constructor(blueprint: BlueprintArtifact, options: BlueprintControllerOptions = {}) {
    const materialized = options.materializedBlueprint ?? materializeBlueprint({
      blueprint,
      externalContext: options.externalContext,
    });
    const initialState = options.context
      ? prepareBlueprintProgram(materialized.payload.terminalBlueprint, { context: options.context }).initialState
      : materialized.payload.initialState;
    const materializedBlueprint: MaterializedBlueprint = {
      ...materialized,
      payload: { ...materialized.payload, initialState: structuredClone(initialState) },
    };
    const runtimeRef = memoryRef(crypto.randomUUID());
    const runtime = {
      runtimeId: `in-memory:${materialized.payload.terminalBlueprint.payload.id}:${crypto.randomUUID()}`,
      providers: { memory: createMemoryStorage() },
      refs: { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef },
    };
    this.worker = createNativeBlueprintWorker({
      blueprint,
      runtime,
      native: options.native ?? {},
      externalContext: options.externalContext,
      materializedBlueprint,
      contexts: options.contexts,
    });
    this.controller = new DurableBlueprintController(blueprint, {
      runtime,
      worker: this.worker,
      externalContext: options.externalContext,
      materializedBlueprint,
      contexts: options.contexts,
      onTransition: options.onTransition,
    });
  }

  getTree(): ResolvedNode | null {
    return this.controller.getTree();
  }

  getState(): Record<string, Json> {
    const { blueprintRunState: _runtimeState, ...state } = this.controller.getState();
    return state;
  }

  subscribe(listener: () => void): () => void {
    return this.controller.subscribe(listener);
  }

  async start(): Promise<ResolvedNode> {
    const tree = await this.controller.start();
    await this.worker.start();
    return tree;
  }

  emit(node: string, name: string, payload?: Record<string, unknown>, actorId?: string): Promise<ResolvedNode> {
    return this.controller.emit(node, name, payload, actorId);
  }

  resync(): Promise<ResolvedNode> {
    return this.controller.resync();
  }

  settle(): Promise<ResolvedNode> {
    return this.controller.resync();
  }

  stop(): void {
    this.controller.stop();
    this.worker.stop();
  }
}
