export type QueueProcessResult = {
  status: "idle" | "completed" | "retry" | "dead";
  appended?: readonly unknown[];
  retryAfterMs?: number;
};

export type QueueNotificationSubscription = (
  notify: () => void,
  signal: AbortSignal
) => void | (() => void) | Promise<void | (() => void)>;

export type DurableQueueProcessorOptions = {
  processNext(signal: AbortSignal): Promise<QueueProcessResult>;
  subscribe: QueueNotificationSubscription;
  onError?: (error: unknown) => void;
};

export function createDurableQueueProcessor(options: DurableQueueProcessorOptions) {
  let started = false;
  let pending = false;
  let processing: Promise<void> | null = null;
  let abortController: AbortController | null = null;
  let unsubscribe: (() => void) | undefined;

  async function processPending(): Promise<void> {
    if (processing) return processing;
    processing = (async () => {
      while (started && pending) {
        pending = false;
        await options.processNext(abortController!.signal);
      }
    })().catch((error) => {
      options.onError?.(error);
    }).finally(() => {
      processing = null;
      if (started && pending) void processPending();
    });
    return processing;
  }

  function notify(): void {
    if (!started) return;
    pending = true;
    void processPending();
  }

  return {
    async start(): Promise<void> {
      if (started) return;
      started = true;
      abortController = new AbortController();
      try {
        unsubscribe = await options.subscribe(notify, abortController.signal) ?? undefined;
      } catch (error) {
        started = false;
        abortController.abort();
        abortController = null;
        throw error;
      }
    },

    notify,

    stop(): void {
      if (!started) return;
      started = false;
      pending = false;
      abortController?.abort();
      abortController = null;
      unsubscribe?.();
      unsubscribe = undefined;
    },

    get isRunning(): boolean {
      return started;
    },
  };
}
