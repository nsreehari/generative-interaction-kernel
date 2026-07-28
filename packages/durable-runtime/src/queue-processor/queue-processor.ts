export type QueueProcessResult = {
  status: "idle" | "completed" | "retry" | "dead";
};

export type QueueNotificationSubscription = (
  notify: () => void,
  signal: AbortSignal
) => void | (() => void) | Promise<void | (() => void)>;

export type DurableQueueProcessorOptions = {
  processNext(): Promise<QueueProcessResult>;
  subscribe: QueueNotificationSubscription;
  onError?: (error: unknown) => void;
};

export function createDurableQueueProcessor(options: DurableQueueProcessorOptions) {
  let started = false;
  let pending = false;
  let draining: Promise<void> | null = null;
  let abortController: AbortController | null = null;
  let unsubscribe: (() => void) | undefined;

  async function drain(): Promise<void> {
    if (draining) return draining;
    draining = (async () => {
      while (started && pending) {
        pending = false;
        while (started) {
          const result = await options.processNext();
          if (result.status === "idle" || result.status === "retry") break;
        }
      }
    })().catch((error) => {
      options.onError?.(error);
    }).finally(() => {
      draining = null;
      if (started && pending) void drain();
    });
    return draining;
  }

  function notify(): void {
    if (!started) return;
    pending = true;
    void drain();
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

    drain(): Promise<void> {
      if (!started) return Promise.resolve();
      pending = true;
      return drain();
    },

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
