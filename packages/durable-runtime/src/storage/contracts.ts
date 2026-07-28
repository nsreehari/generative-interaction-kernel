import type {
  EngineWakeState,
  InitializeRuntimeResult,
  JournalEntry,
  QueueLeasedMessage,
  RuntimeRefs,
  TransitionCommitResult,
  TransitionRefs,
  TransitionSnapshot,
} from "../contracts";

export interface JournalStorage {
  append(payload: unknown): Promise<JournalEntry>;
  readAfter(cursor: string | null): Promise<{ entries: JournalEntry[]; newCursor: string | null }>;
}

export interface DurableStorageResolver {
  namespaceForRef(ref: string): string;
  journalStorageForRef(ref: string): JournalStorage;
}

export interface EngineWakeStorage {
  request(): Promise<string>;
  read(): Promise<EngineWakeState>;
  markProcessed(processedAt: string): Promise<void>;
}

export interface LeasedTransitionStorage<
  TState = unknown,
  TSpec = unknown,
  TEvent = unknown,
  TEffect = unknown,
  TSpecUpdate = unknown,
> {
  initialize(refs: RuntimeRefs, initialState: TState, initialSpec: TSpec): Promise<InitializeRuntimeResult>;
  acquire(
    refs: TransitionRefs,
    options?: { leaseMs?: number },
  ): Promise<TransitionSnapshot<TState, TSpec, TEvent> | null>;
  commit(commit: TransitionRefs & {
    leaseToken: string;
    expectedRevision: string | null;
    previousCursor: string | null;
    nextCursor: string;
    state: TState;
    spec: TSpec;
    specUpdates: TSpecUpdate[];
    effects: TEffect[];
  }): Promise<TransitionCommitResult>;
  abort(refs: TransitionRefs, leaseToken: string): Promise<boolean>;
}

export interface QueueLaneStorage {
  lease<T>(options?: { max?: number; visibilityMs?: number }): Promise<QueueLeasedMessage<T>[]>;
  ack(messageId: string, leaseToken: string): Promise<boolean>;
  nack(messageId: string, leaseToken: string, options?: { dead?: boolean; reason?: string }): Promise<boolean>;
}
