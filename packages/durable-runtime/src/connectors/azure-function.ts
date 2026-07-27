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

export type AzureFunctionConnectorOptions = {
  baseUrl: string;
  getHeaders?: () => Record<string, string>;
  fetch?: typeof globalThis.fetch;
};

export function createAzureFunctionConnector(options: AzureFunctionConnectorOptions): DurableProvider {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required for Azure durable storage.");
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.getHeaders?.() },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as T & { error?: unknown };
    if (!response.ok) throw new Error(String(payload?.error ?? `HTTP ${response.status}`));
    return payload;
  }

  return {
    appendJournal: <T>(request: TransitionRefs & { entry: T }) =>
      post<JournalEntry<T>>("/api/gik/appendJournal", request),
    readEngineWake: (request) => post<EngineWakeState>("/api/gik/engine-wake/read", request),
    markEngineWakeProcessed: (request, processedAt) =>
      post<void>("/api/gik/engine-wake/processed", { ...request, processedAt }),
    initializeRuntime: <TState>(request: RuntimeRefs & { kernelId: string; initialState: TState }) =>
      post<InitializeRuntimeResult>("/api/gik/runtime/initialize", request),
    acquireTransition: <TState, TEvent>(request: TransitionRefs & {
      kernelId: string; leaseMs?: number;
    }) => post<TransitionSnapshot<TState, TEvent> | null>("/api/gik/transition/acquire", request),
    commitTransition: <TState, TEffect>(request: TransitionCommit<TState, TEffect>) =>
      post<TransitionCommitResult>("/api/gik/transition/commit", request),
    abortTransition: (request: TransitionRefs & { kernelId: string; leaseToken: string }) =>
      post<boolean>("/api/gik/transition/abort", request),
    async leaseQueueItem<TEffect>(request: {
      effectsQueueRef: string; effectsLane?: string; visibilityMs?: number;
    }) {
      return post<QueueLeasedMessage<TEffect> | null>("/api/gik/effects/lease", request);
    },
    ackQueueItem: (request) => post<boolean>("/api/gik/effects/ack", request),
    nackQueueItem: (request) => post<boolean>("/api/gik/effects/nack", request),
  };
}

export const createAzureFunctionsProvider = createAzureFunctionConnector;
