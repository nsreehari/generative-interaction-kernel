export type JournalEntry<T = unknown> = { id: string; payload: T };

export type RuntimeRefs = {
  stateRef: string;
  effectsQueueRef: string;
  effectsLane?: string;
};

export type TransitionRefs = RuntimeRefs & { journalRef: string };

export type TransitionSnapshot<TState = unknown, TEvent = unknown> = {
  leaseToken: string;
  leaseExpiresAt: string;
  state: TState;
  revision: string | null;
  cursor: string | null;
  entries: JournalEntry<TEvent>[];
};

export type TransitionCommit<TState = unknown, TEffect = unknown> = TransitionRefs & {
  kernelId: string;
  leaseToken: string;
  expectedRevision: string | null;
  previousCursor: string | null;
  nextCursor: string;
  state: TState;
  effects: TEffect[];
};

export type TransitionCommitResult =
  | { ok: true; revision: string }
  | { ok: false; reason: "conflict" | "lease-lost"; revision: string | null };

export type InitializeRuntimeResult = { created: boolean; revision: string };

export interface DurableProvider {
  appendJournal<T>(journalRef: string, entry: T): Promise<JournalEntry<T>>;
  initializeRuntime<TState>(
    request: RuntimeRefs & { kernelId: string; initialState: TState }
  ): Promise<InitializeRuntimeResult>;
  acquireTransition<TState, TEvent>(
    request: TransitionRefs & { kernelId: string; leaseMs?: number }
  ): Promise<TransitionSnapshot<TState, TEvent> | null>;
  commitTransition<TState, TEffect>(request: TransitionCommit<TState, TEffect>): Promise<TransitionCommitResult>;
  abortTransition(request: TransitionRefs & { kernelId: string; leaseToken: string }): Promise<boolean>;
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

export type DurableKernel<TState = unknown, TEvent = unknown, TEffect = unknown> = {
  id: string;
  initialState(): TState;
  transition(input: {
    state: TState;
    revision: string | null;
    cursor: string | null;
    entries: JournalEntry<TEvent>[];
  }): Promise<{ state: TState; effects: TEffect[] }> | { state: TState; effects: TEffect[] };
};

export type DurableEffectHandler<TEffect = unknown, TEvent = unknown> = (
  effect: TEffect
) => Promise<TEvent[] | void> | TEvent[] | void;