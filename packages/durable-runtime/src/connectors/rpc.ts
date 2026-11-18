import type { DurableProvider } from "../contracts";

export const durableProviderOperations = [
  "initializeRuntime", "appendJournal", "readEngineWake", "markEngineWakeProcessed",
  "readSnapshot", "readSnapshotChanges", "acquireTransition", "commitTransition", "abortTransition",
  "leaseQueueItem", "ackQueueItem", "nackQueueItem",
] as const;
export type DurableProviderOperation = typeof durableProviderOperations[number];
export type DurableProviderRpc = (operation: DurableProviderOperation, args: unknown[], signal?: AbortSignal) => Promise<unknown>;

/** Mutation receipts must survive caller cancellation; only snapshot/wake reads are cancellable. */
export function connectDurableProvider(call: DurableProviderRpc): DurableProvider {
  async function invoke<T>(operation: DurableProviderOperation, ...args: unknown[]): Promise<T> {
    const request = args[0];
    const cancellable = operation === "readEngineWake" || operation === "readSnapshot" || operation === "readSnapshotChanges";
    const signal = cancellable && request && typeof request === "object" && "signal" in request && request.signal instanceof AbortSignal
      ? request.signal : undefined;
    return await call(operation, args.map(value => value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([key, item]) => key !== "signal" && item !== undefined)) : value), signal) as T;
  }
  return {
    initializeRuntime: request => invoke("initializeRuntime", request),
    appendJournal: request => invoke("appendJournal", request),
    readEngineWake: request => invoke("readEngineWake", request),
    markEngineWakeProcessed: (request, processedAt) => invoke("markEngineWakeProcessed", request, processedAt),
    readSnapshot: request => invoke("readSnapshot", request),
    readSnapshotChanges: request => invoke("readSnapshotChanges", request),
    acquireTransition: request => invoke("acquireTransition", request),
    commitTransition: request => invoke("commitTransition", request),
    abortTransition: request => invoke("abortTransition", request),
    leaseQueueItem: request => invoke("leaseQueueItem", request),
    ackQueueItem: request => invoke("ackQueueItem", request),
    nackQueueItem: request => invoke("nackQueueItem", request),
  };
}
