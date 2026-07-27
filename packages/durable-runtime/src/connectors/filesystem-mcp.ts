import type {
  DurableProvider,
  EngineWakeState,
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

export function createFilesystemMcpConnector(callTool: McpCallTool): DurableProvider {
  async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const response = await callTool(name, args);
    return response.structuredContent as T;
  }

  return {
    async appendJournal<T>(request: TransitionRefs & { entry: T }) {
      const payload = await call<{ entry: JournalEntry<T> }>("filesystem.journal_append_and_wake", request);
      return payload.entry;
    },
    async readEngineWake(request) {
      const payload = await call<{ wake: EngineWakeState }>("filesystem.engine_wake_read", request);
      return payload.wake;
    },
    async markEngineWakeProcessed(request, processedAt) {
      await call<{ processed: true }>("filesystem.engine_wake_processed", { ...request, processedAt });
    },
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
    async abortTransition(request: TransitionRefs & { kernelId: string; leaseToken: string }) {
      const payload = await call<{ aborted: boolean }>("filesystem.transition_abort", request);
      return payload.aborted;
    },
    async leaseQueueItem<TEffect>(request: {
      effectsQueueRef: string; effectsLane?: string; visibilityMs?: number;
    }) {
      const payload = await call<{ message: QueueLeasedMessage<TEffect> | null }>(
        "filesystem.effect_lease",
        request,
      );
      return payload.message;
    },
    async ackQueueItem(request) {
      const payload = await call<{ acknowledged: boolean }>("filesystem.effect_ack", request);
      return payload.acknowledged;
    },
    async nackQueueItem(request) {
      const payload = await call<{ released: boolean }>("filesystem.effect_nack", request);
      return payload.released;
    },
  };
}

export const createFilesystemMcpProvider = createFilesystemMcpConnector;
