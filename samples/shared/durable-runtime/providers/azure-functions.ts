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

export type AzureFunctionsProviderOptions = {
  baseUrl: string;
  getHeaders?: () => Record<string, string>;
  fetch?: typeof globalThis.fetch;
};

export function createAzureFunctionsProvider(options: AzureFunctionsProviderOptions): DurableProvider {
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

  async function storage<T>(operation: Record<string, unknown>): Promise<T> {
    const [response] = await post<Array<{ ok: boolean; result?: T; error?: string }>>("/api/storage", [operation]);
    if (!response?.ok) throw new Error(response?.error ?? "Azure storage operation failed.");
    return response.result as T;
  }

  return {
    appendJournal: <T>(journalRef: string, entry: T) => post<JournalEntry<T>>(
      "/api/gik/appendJournal", { journalRef, entry }
    ),
    initializeRuntime: <TState>(request: RuntimeRefs & { kernelId: string; initialState: TState }) =>
      post<InitializeRuntimeResult>("/api/gik/runtime/initialize", request),
    acquireTransition: <TState, TEvent>(request: TransitionRefs & {
      kernelId: string; leaseMs?: number;
    }) => post<TransitionSnapshot<TState, TEvent> | null>("/api/gik/transition/acquire", request),
    commitTransition: <TState, TEffect>(request: TransitionCommit<TState, TEffect>) =>
      post<TransitionCommitResult>("/api/gik/transition/commit", request),
    abortTransition: (request) => post<boolean>("/api/gik/transition/abort", request),
    async leaseQueueItem<TEffect>(request) {
      const messages = await storage<QueueLeasedMessage<TEffect>[]>({
        ref: request.effectsQueueRef,
        capability: "queue",
        operation: "lease",
        lane: request.effectsLane,
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