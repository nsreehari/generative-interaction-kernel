import type {
  EngineWakeState,
  InitializeRuntimeResult,
  JournalEntry,
  RuntimeRefs,
  TransitionRefs,
} from "../../contracts";
import type {
  DurableStorageResolver,
  EngineWakeStorage,
  LeasedTransitionStorage,
  QueueLaneStorage,
} from "../../storage/contracts";

export interface DurableRuntimeServerDependencies extends Pick<DurableStorageResolver, "journalStorageForRef"> {
  transitionStorage(runtimeId: string): LeasedTransitionStorage;
  engineWakeStorage(refs: RuntimeRefs): EngineWakeStorage;
  effectsQueueStorage(effectsQueueRef: string, effectsLane?: string): QueueLaneStorage;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredString(value, name);
}

function optionalPositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function runtimeRefs(input: Record<string, unknown>): RuntimeRefs {
  return {
    stateRef: requiredString(input.stateRef, "stateRef"),
    effectsQueueRef: requiredString(input.effectsQueueRef, "effectsQueueRef"),
    effectsLane: optionalString(input.effectsLane, "effectsLane"),
  };
}

function transitionRefs(input: Record<string, unknown>): TransitionRefs {
  return {
    ...runtimeRefs(input),
    journalRef: requiredString(input.journalRef, "journalRef"),
  };
}

function transitionStorage(
  dependencies: DurableRuntimeServerDependencies,
  input: Record<string, unknown>,
): LeasedTransitionStorage {
  return dependencies.transitionStorage(requiredString(input.runtimeId, "runtimeId"));
}

export async function dispatchInitializeRuntime(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
): Promise<InitializeRuntimeResult> {
  const input = record(request, "initializeRuntime request");
  if (!Object.prototype.hasOwnProperty.call(input, "initialState")) {
    throw new Error("initialState is required.");
  }
  if (!Object.prototype.hasOwnProperty.call(input, "initialSpec")) {
    throw new Error("initialSpec is required.");
  }
  return transitionStorage(dependencies, input).initialize(runtimeRefs(input), input.initialState, input.initialSpec);
}

export async function dispatchReadSnapshot(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
) {
  const input = record(request, "readSnapshot request");
  return transitionStorage(dependencies, input).readSnapshot(runtimeRefs(input));
}

export async function dispatchAcquireTransition(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
) {
  const input = record(request, "acquireTransition request");
  return transitionStorage(dependencies, input).acquire(transitionRefs(input), {
    leaseMs: optionalPositiveInteger(input.leaseMs, "leaseMs"),
  });
}

export async function dispatchCommitTransition(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
) {
  const input = record(request, "commitTransition request");
  if (!Array.isArray(input.effects)) throw new Error("effects must be an array.");
  if (!Array.isArray(input.specUpdates)) throw new Error("specUpdates must be an array.");
  return transitionStorage(dependencies, input).commit({
    ...transitionRefs(input),
    leaseToken: requiredString(input.leaseToken, "leaseToken"),
    expectedRevision: input.expectedRevision === null
      ? null
      : requiredString(input.expectedRevision, "expectedRevision"),
    previousCursor: input.previousCursor === null
      ? null
      : requiredString(input.previousCursor, "previousCursor"),
    nextCursor: requiredString(input.nextCursor, "nextCursor"),
    state: input.state,
    spec: input.spec,
    specUpdates: input.specUpdates,
    effects: input.effects,
  });
}

export async function dispatchAbortTransition(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
) {
  const input = record(request, "abortTransition request");
  return transitionStorage(dependencies, input).abort(
    transitionRefs(input),
    requiredString(input.leaseToken, "leaseToken"),
  );
}

export async function dispatchAppendJournal(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
): Promise<JournalEntry> {
  const input = record(request, "appendJournal request");
  if (!Object.prototype.hasOwnProperty.call(input, "entry")) throw new Error("entry is required.");
  const refs = transitionRefs(input);
  const entry = await dependencies.journalStorageForRef(refs.journalRef).append(input.entry);
  await dependencies.engineWakeStorage(refs).request();
  return entry;
}

export async function dispatchReadEngineWake(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
): Promise<EngineWakeState> {
  const input = record(request, "readEngineWake request");
  const refs = runtimeRefs(input);
  return dependencies.engineWakeStorage(refs).read();
}

export async function dispatchMarkEngineWakeProcessed(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
): Promise<{ processed: true }> {
  const input = record(request, "markEngineWakeProcessed request");
  const refs = runtimeRefs(input);
  await dependencies.engineWakeStorage(refs).markProcessed(requiredString(input.processedAt, "processedAt"));
  return { processed: true };
}

export async function dispatchLeaseEffect(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
) {
  const input = record(request, "leaseEffect request");
  const messages = await dependencies.effectsQueueStorage(
    requiredString(input.effectsQueueRef, "effectsQueueRef"),
    optionalString(input.effectsLane, "effectsLane"),
  ).lease({
    max: 1,
    visibilityMs: optionalPositiveInteger(input.visibilityMs, "visibilityMs"),
  });
  return messages[0] ?? null;
}

export async function dispatchAckEffect(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
) {
  const input = record(request, "ackEffect request");
  return dependencies.effectsQueueStorage(
    requiredString(input.effectsQueueRef, "effectsQueueRef"),
    optionalString(input.effectsLane, "effectsLane"),
  ).ack(
    requiredString(input.messageId, "messageId"),
    requiredString(input.leaseToken, "leaseToken"),
  );
}

export async function dispatchNackEffect(
  dependencies: DurableRuntimeServerDependencies,
  request: unknown,
) {
  const input = record(request, "nackEffect request");
  if (input.dead !== undefined && typeof input.dead !== "boolean") {
    throw new Error("dead must be a boolean.");
  }
  return dependencies.effectsQueueStorage(
    requiredString(input.effectsQueueRef, "effectsQueueRef"),
    optionalString(input.effectsLane, "effectsLane"),
  ).nack(
    requiredString(input.messageId, "messageId"),
    requiredString(input.leaseToken, "leaseToken"),
    {
      dead: input.dead as boolean | undefined,
      reason: optionalString(input.reason, "reason"),
    },
  );
}
