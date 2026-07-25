import type {
  DurableEffectHandler,
  DurableKernel,
  DurableProvider,
  JournalEntry,
  RuntimeRefs,
  TransitionRefs,
} from "./contracts";
import { assertSameRefKind, parseRef } from "./refs";

export type BrowserDurableRuntimeOptions = {
  providers: Record<string, DurableProvider>;
  kernels: DurableKernel[];
  effectHandlers?: Record<string, DurableEffectHandler>;
};

export function createBrowserDurableRuntime(options: BrowserDurableRuntimeOptions) {
  const kernels = new Map(options.kernels.map((kernel) => [kernel.id, kernel]));

  function providerFor(ref: string): DurableProvider {
    const kind = parseRef(ref).kind;
    const provider = options.providers[kind];
    if (!provider) throw new Error(`No durable provider is configured for ref kind ${kind}.`);
    return provider;
  }

  return {
    appendJournal<T>(journalRef: string, entry: T): Promise<JournalEntry<T>> {
      return providerFor(journalRef).appendJournal(journalRef, entry);
    },

    initializeRuntime(request: RuntimeRefs & { kernelId: string }) {
      const kernel = kernels.get(request.kernelId);
      if (!kernel) throw new Error(`Unknown local durable kernel: ${request.kernelId}.`);
      const kind = assertSameRefKind([request.stateRef, request.effectsQueueRef]);
      const provider = options.providers[kind];
      if (!provider) throw new Error(`No durable provider is configured for ref kind ${kind}.`);
      return provider.initializeRuntime({ ...request, initialState: kernel.initialState() });
    },

    async runEngine(request: TransitionRefs & { kernelId: string; leaseMs?: number }) {
      const kernel = kernels.get(request.kernelId);
      if (!kernel) throw new Error(`Unknown local durable kernel: ${request.kernelId}.`);
      const kind = assertSameRefKind([request.stateRef, request.journalRef, request.effectsQueueRef]);
      const provider = options.providers[kind];
      if (!provider) throw new Error(`No durable provider is configured for ref kind ${kind}.`);
      const snapshot = await provider.acquireTransition(request);
      if (!snapshot) return { status: "busy" as const };
      if (snapshot.entries.length === 0) {
        await provider.abortTransition({ ...request, leaseToken: snapshot.leaseToken });
        return { status: "idle" as const, revision: snapshot.revision, cursor: snapshot.cursor };
      }

      try {
        const output = await kernel.transition(snapshot);
        const nextCursor = snapshot.entries.at(-1)!.id;
        const committed = await provider.commitTransition({
          ...request,
          leaseToken: snapshot.leaseToken,
          expectedRevision: snapshot.revision,
          previousCursor: snapshot.cursor,
          nextCursor,
          state: output.state,
          effects: output.effects,
        });
        if (!committed.ok) return { status: committed.reason, revision: committed.revision, cursor: snapshot.cursor };
        return {
          status: "committed" as const,
          revision: committed.revision,
          cursor: nextCursor,
          entryCount: snapshot.entries.length,
          effectCount: output.effects.length,
        };
      } catch (error) {
        await provider.abortTransition({ ...request, leaseToken: snapshot.leaseToken }).catch(() => false);
        throw error;
      }
    },

    async processQueueLaneItem(request: {
      effectsQueueRef: string;
      effectsLane?: string;
      journalRef: string;
      visibilityMs?: number;
      maxAttempts?: number;
    }) {
      const kind = assertSameRefKind([request.effectsQueueRef, request.journalRef]);
      const provider = options.providers[kind];
      if (!provider?.leaseQueueItem || !provider.ackQueueItem || !provider.nackQueueItem) {
        throw new Error(`Provider ${kind} does not support queue processing.`);
      }
      const message = await provider.leaseQueueItem({
        effectsQueueRef: request.effectsQueueRef,
        effectsLane: request.effectsLane,
        visibilityMs: request.visibilityMs,
      });
      if (!message) return { status: "idle" as const };
      try {
        const effectType = typeof message.body === "object" && message.body !== null
          ? String((message.body as { type?: unknown }).type ?? "")
          : "";
        const handler = options.effectHandlers?.[effectType];
        if (!handler) throw new Error(`Unknown local effect handler: ${effectType || "<missing type>"}.`);
        const events = await handler(message.body) ?? [];
        const appended = [];
        for (const event of events) appended.push(await provider.appendJournal(request.journalRef, event));
        if (!await provider.ackQueueItem({
          effectsQueueRef: request.effectsQueueRef,
          effectsLane: request.effectsLane,
          messageId: message.id,
          leaseToken: message.leaseToken,
        })) throw new Error(`Queue acknowledgement lost for message ${message.id}.`);
        return { status: "completed" as const, messageId: message.id, appended };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const dead = message.attempt >= Math.max(1, request.maxAttempts ?? 5);
        await provider.nackQueueItem({
          effectsQueueRef: request.effectsQueueRef,
          effectsLane: request.effectsLane,
          messageId: message.id,
          leaseToken: message.leaseToken,
          dead,
          reason,
        });
        return { status: dead ? "dead" as const : "retry" as const, messageId: message.id, error: reason };
      }
    },
  };
}