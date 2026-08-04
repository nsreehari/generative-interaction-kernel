import {
  HubConnectionBuilder,
  LogLevel,
  type IHttpConnectionOptions,
} from "@microsoft/signalr";
import type {
  DurableProvider,
  EngineWakeState,
  InitializeRuntimeResult,
  JournalEntry,
  QueueLeasedMessage,
  RuntimeRefs,
  RuntimeSnapshot,
  RuntimeSnapshotChanges,
  RuntimeSnapshotInvalidation,
  RuntimeSnapshotInvalidationSubscription,
  TransitionCommit,
  TransitionCommitResult,
  TransitionRefs,
  TransitionSnapshot,
} from "../contracts";

export type AzureFunctionConnectorOptions = {
  baseUrl: string;
  getHeaders?: () => Record<string, string>;
  fetch?: typeof globalThis.fetch;
  subscribeSnapshotInvalidations?: RuntimeSnapshotInvalidationSubscription;
  signalR?: AzureSignalRSnapshotInvalidationOptions;
};

export const AZURE_SIGNALR_SNAPSHOT_INVALIDATION_TARGET =
  "gikRuntimeSnapshotInvalidated";

export type AzureSignalRConnectionInfo = {
  url: string;
  accessToken?: string;
};

export type AzureSignalRSnapshotInvalidationOptions = {
  negotiatePath?: string;
  getHeaders?: () => Record<string, string>;
};

function isSnapshotInvalidation(value: unknown): value is RuntimeSnapshotInvalidation {
  return typeof value === "object" && value !== null
    && typeof (value as RuntimeSnapshotInvalidation).runtimeId === "string"
    && typeof (value as RuntimeSnapshotInvalidation).stateRef === "string";
}

export function createAzureSignalRSnapshotInvalidationSubscription(
  options: AzureFunctionConnectorOptions,
): RuntimeSnapshotInvalidationSubscription {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required for Azure SignalR negotiation.");
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const signalROptions = options.signalR ?? {};

  return async (request, listener, subscriptionOptions) => {
    const response = await fetchImpl(
      `${baseUrl}${signalROptions.negotiatePath ?? "/api/gik/runtime/invalidations/negotiate"}`,
      {
        method: "POST",
        headers: { ...options.getHeaders?.(), ...signalROptions.getHeaders?.() },
        signal: subscriptionOptions.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`Azure SignalR negotiation failed with status ${response.status}.`);
    }

    const connectionInfo = await response.json() as AzureSignalRConnectionInfo;
    const connectionOptions: IHttpConnectionOptions = {};
    if (connectionInfo.accessToken) {
      connectionOptions.accessTokenFactory = () => connectionInfo.accessToken!;
    }
    const connection = new HubConnectionBuilder()
      .withUrl(connectionInfo.url, connectionOptions)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on(AZURE_SIGNALR_SNAPSHOT_INVALIDATION_TARGET, (invalidation: unknown) => {
      if (isSnapshotInvalidation(invalidation)
        && invalidation.runtimeId === request.runtimeId
        && invalidation.stateRef === request.stateRef) {
        listener(invalidation);
      }
    });
    connection.onreconnected(() => subscriptionOptions.onReconnect?.());
    connection.onclose((error) => {
      if (!subscriptionOptions.signal.aborted && error) {
        subscriptionOptions.onError?.(error);
      }
    });

    const stop = () => {
      void connection.stop().catch((error) => subscriptionOptions.onError?.(error));
    };
    subscriptionOptions.signal.addEventListener("abort", stop, { once: true });

    try {
      await connection.start();
    } catch (error) {
      subscriptionOptions.signal.removeEventListener("abort", stop);
      await connection.stop().catch(() => undefined);
      throw error;
    }

    return () => {
      subscriptionOptions.signal.removeEventListener("abort", stop);
      stop();
    };
  };
}

export function createAzureFunctionConnector(options: AzureFunctionConnectorOptions): DurableProvider {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required for Azure durable storage.");
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const subscribeSnapshotInvalidations = options.subscribeSnapshotInvalidations
    ?? (options.signalR
      ? createAzureSignalRSnapshotInvalidationSubscription(options)
      : undefined);

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
    ...(subscribeSnapshotInvalidations
      ? { subscribeSnapshotInvalidations }
      : {}),
    appendJournal: <T>(request: TransitionRefs & { entry: T }) =>
      post<JournalEntry<T>>("/api/gik/appendJournal", request),
    readEngineWake: (request) => post<EngineWakeState>("/api/gik/engine-wake/read", request),
    markEngineWakeProcessed: (request, processedAt) =>
      post<void>("/api/gik/engine-wake/processed", { ...request, processedAt }),
    initializeRuntime: <TState, TSpec>(request: RuntimeRefs & {
      runtimeId: string; initialState: TState; initialSpec: TSpec;
    }) =>
      post<InitializeRuntimeResult>("/api/gik/runtime/initialize", request),
    readSnapshot: <TState, TSpec>(request: RuntimeRefs & { runtimeId: string }) =>
      post<RuntimeSnapshot<TState, TSpec>>("/api/gik/runtime/snapshot", request),
    readSnapshotChanges: <TState, TSpec>(request: RuntimeRefs & {
      runtimeId: string; afterRevision: string | null;
    }) => post<RuntimeSnapshotChanges<TState, TSpec>>(
      "/api/gik/runtime/snapshot/changes",
      request,
    ),
    acquireTransition: <TState, TSpec, TEvent>(request: TransitionRefs & {
      runtimeId: string; leaseMs?: number;
    }) => post<TransitionSnapshot<TState, TSpec, TEvent> | null>("/api/gik/transition/acquire", request),
    commitTransition: <TState, TSpec, TEffect, TSpecUpdate>(
      request: TransitionCommit<TState, TSpec, TEffect, TSpecUpdate>,
    ) =>
      post<TransitionCommitResult>("/api/gik/transition/commit", request),
    abortTransition: (request: TransitionRefs & { runtimeId: string; leaseToken: string }) =>
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
