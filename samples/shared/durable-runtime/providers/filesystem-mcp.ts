import type {
  DurableProvider,
  InitializeRuntimeResult,
  JournalEntry,
  QueueLeasedMessage,
  RuntimeRefs,
  TransitionCommit,
  TransitionCommitResult,
  TransitionRefs,
  TransitionSnapshot,
} from "../contracts";

export type McpCallTool = (
  name: string,
  args: Record<string, unknown>
) => Promise<{ structuredContent?: unknown }>;

export function createFilesystemMcpProvider(callTool: McpCallTool): DurableProvider {
  async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const response = await callTool(name, args);
    return response.structuredContent as T;
  }

  async function storage<T>(operation: Record<string, unknown>): Promise<T> {
    const payload = await call<{ results: Array<{ ok: boolean; result?: T; error?: string }> }>(
      "filesystem.storage_batch",
      { operations: [operation] }
    );
    const response = payload.results[0];
    if (!response?.ok) throw new Error(response?.error ?? "Filesystem storage operation failed.");
    return response.result as T;
  }

  return {
    appendJournal: <T>(journalRef: string, entry: T) => storage<JournalEntry<T>>({
      ref: journalRef, capability: "journal", operation: "append", args: [entry],
    }),
    async initializeRuntime<TState>(request: RuntimeRefs & { kernelId: string; initialState: TState }) {
      const payload = await call<{ initialization: InitializeRuntimeResult }>(
        "filesystem.runtime_initialize", request
      );
      return payload.initialization;
    },
    async acquireTransition<TState, TEvent>(request: TransitionRefs & {
      kernelId: string; leaseMs?: number;
    }) {
      const payload = await call<{ transition: TransitionSnapshot<TState, TEvent> | null }>(
        "filesystem.transition_acquire", request
      );
      return payload.transition;
    },
    commitTransition: <TState, TEffect>(request: TransitionCommit<TState, TEffect>) =>
      call<TransitionCommitResult>("filesystem.transition_commit", request),
    async abortTransition(request) {
      const payload = await call<{ aborted: boolean }>("filesystem.transition_abort", request);
      return payload.aborted;
    },
    async leaseQueueItem<TEffect>(request) {
      const messages = await storage<QueueLeasedMessage<TEffect>[]>({
        ref: request.effectsQueueRef, capability: "queue", operation: "lease", lane: request.effectsLane,
        args: [{ max: 1, visibilityMs: request.visibilityMs }],
      });
      return messages[0] ?? null;
    },
    ackQueueItem: (request) => storage<boolean>({
      ref: request.effectsQueueRef, capability: "queue", operation: "ack", lane: request.effectsLane,
      args: [request.messageId, request.leaseToken],
    }),
    nackQueueItem: (request) => storage<boolean>({
      ref: request.effectsQueueRef, capability: "queue", operation: "nack", lane: request.effectsLane,
      args: [request.messageId, request.leaseToken, { dead: request.dead, reason: request.reason }],
    }),
  };
}