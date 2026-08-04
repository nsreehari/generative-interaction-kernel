export type JournalEntry<T = unknown> = { id: string; payload: T };

export type RuntimeRefs = {
  stateRef: string;
  effectsQueueRef: string;
  effectsLane?: string;
};

export type TransitionRefs = RuntimeRefs & { journalRef: string };

export type RuntimeSnapshot<TState = unknown, TSpec = unknown> = {
  state: TState;
  spec: TSpec;
  revision: string;
};

export type RuntimeSnapshotPatchOperation =
  | { op: "add" | "replace"; path: string; value: unknown }
  | { op: "remove"; path: string };

export type RuntimeSnapshotPatch = {
  baseRevision: string;
  revision: string;
  operations: RuntimeSnapshotPatchOperation[];
};

export type RuntimeSnapshotChanges<TState = unknown, TSpec = unknown> =
  | { kind: "unchanged"; revision: string }
  | ({ kind: "changes" } & RuntimeSnapshotPatch)
  | { kind: "reset"; snapshot: RuntimeSnapshot<TState, TSpec> };

export type RuntimeSnapshotInvalidation = {
  runtimeId: string;
  stateRef: string;
  observedRevision?: string;
};

export type RuntimeSnapshotInvalidationSubscription = (
  request: RuntimeRefs & { runtimeId: string },
  listener: (invalidation: RuntimeSnapshotInvalidation) => void,
  options: {
    signal: AbortSignal;
    onError?: (error: unknown) => void;
    onReconnect?: () => void;
  },
) => void | (() => void) | Promise<void | (() => void)>;

export type TransitionSnapshot<TState = unknown, TSpec = unknown, TEvent = unknown> = {
  leaseToken: string;
  leaseExpiresAt: string;
  state: TState;
  spec: TSpec;
  revision: string | null;
  cursor: string | null;
  entries: JournalEntry<TEvent>[];
};

export type TransitionCommit<TState = unknown, TSpec = unknown, TEffect = unknown, TSpecUpdate = unknown> = TransitionRefs & {
  runtimeId: string;
  leaseToken: string;
  expectedRevision: string | null;
  previousCursor: string | null;
  nextCursor: string;
  state: TState;
  spec: TSpec;
  specUpdates: TSpecUpdate[];
  effects: TEffect[];
};

export type TransitionCommitResult =
  | { ok: true; revision: string }
  | { ok: false; reason: "conflict" | "lease-lost"; revision: string | null };

export type InitializeRuntimeResult = { created: boolean; revision: string };

export type EngineWakeState = {
  requestedAt: string | null;
  processedAt: string | null;
};

export interface DurableProvider {
  appendJournal<T>(request: TransitionRefs & { entry: T }): Promise<JournalEntry<T>>;
  readEngineWake(refs: RuntimeRefs): Promise<EngineWakeState>;
  markEngineWakeProcessed(refs: RuntimeRefs, processedAt: string): Promise<void>;
  initializeRuntime<TState, TSpec>(
    request: RuntimeRefs & { runtimeId: string; initialState: TState; initialSpec: TSpec }
  ): Promise<InitializeRuntimeResult>;
  readSnapshot<TState, TSpec>(
    request: RuntimeRefs & { runtimeId: string }
  ): Promise<RuntimeSnapshot<TState, TSpec>>;
  readSnapshotChanges<TState, TSpec>(
    request: RuntimeRefs & { runtimeId: string; afterRevision: string | null }
  ): Promise<RuntimeSnapshotChanges<TState, TSpec>>;
  subscribeSnapshotInvalidations?: RuntimeSnapshotInvalidationSubscription;
  acquireTransition<TState, TSpec, TEvent>(
    request: TransitionRefs & { runtimeId: string; leaseMs?: number }
  ): Promise<TransitionSnapshot<TState, TSpec, TEvent> | null>;
  commitTransition<TState, TSpec, TEffect, TSpecUpdate>(
    request: TransitionCommit<TState, TSpec, TEffect, TSpecUpdate>
  ): Promise<TransitionCommitResult>;
  abortTransition(request: TransitionRefs & { runtimeId: string; leaseToken: string }): Promise<boolean>;
  leaseQueueItem?<TEffect>(request: {
    effectsQueueRef: string;
    effectsLane?: string;
    visibilityMs?: number;
  }): Promise<QueueLeasedMessage<TEffect> | null>;
  ackQueueItem?(request: { effectsQueueRef: string; effectsLane?: string; messageId: string; leaseToken: string }): Promise<boolean>;
  nackQueueItem?(request: {
    effectsQueueRef: string;
    effectsLane?: string;
    messageId: string;
    leaseToken: string;
    dead?: boolean;
    reason?: string;
  }): Promise<boolean>;
}

export type QueueLeasedMessage<T = unknown> = {
  id: string;
  body: T;
  enqueuedAt: string;
  attempt: number;
  leaseToken: string;
  leaseExpiresAt: string;
};

export type QueueMessage<T = unknown> = {
  id: string;
  body: T;
  enqueuedAt: string;
  attempt: number;
};

export type DurableTransitionAdapter<
  TState = unknown,
  TSpec = unknown,
  TEvent = unknown,
  TEffect = unknown,
  TSpecUpdate = unknown,
> = {
  initialState(): TState;
  initialSpec(): TSpec;
  transition(input: {
    state: TState;
    spec: TSpec;
    events: readonly TEvent[];
  }): Promise<{
    state: TState;
    effects: readonly TEffect[];
    specUpdates?: readonly TSpecUpdate[];
  }> | {
    state: TState;
    effects: readonly TEffect[];
    specUpdates?: readonly TSpecUpdate[];
  };
  applySpecUpdates(input: {
    spec: TSpec;
    updates: readonly TSpecUpdate[];
  }): Promise<TSpec> | TSpec;
};

export type DurableEffectHandler<TEffect = unknown, TEvent = unknown> = (
  effect: TEffect,
  execution: { messageId: string; attempt: number; signal?: AbortSignal },
) => Promise<TEvent[] | void> | TEvent[] | void;

export type DurableEffectFailureHandler<TEffect = unknown, TEvent = unknown> = (
  effect: TEffect,
  failure: { messageId: string; attempt: number; error: string },
) => Promise<TEvent[] | void> | TEvent[] | void;
