import {
  createDurableQueueProcessor,
  type QueueNotificationSubscription,
  type QueueProcessResult,
} from "./queue-processor";

export type BrowserQueueProcessorRequest = {
  stateRef: string;
  effectsQueueRef: string;
  effectsLane?: string;
  journalRef: string;
  visibilityMs?: number;
  maxAttempts?: number;
};

export type BrowserQueueRuntime = {
  processQueueLaneItem(request: BrowserQueueProcessorRequest): Promise<QueueProcessResult>;
};

export function createBrowserRuntimeQueueProcessor(options: {
  runtime: BrowserQueueRuntime;
  request: BrowserQueueProcessorRequest;
  subscribe: QueueNotificationSubscription;
  onError?: (error: unknown) => void;
}) {
  return createDurableQueueProcessor({
    processNext: () => options.runtime.processQueueLaneItem(options.request),
    subscribe: options.subscribe,
    onError: options.onError,
  });
}
