import React from "react";

// The dispatch model is atomic: a single `emit` resolves only AFTER the kernel has reduced,
// run any invoke effect, and re-rendered once — so a store flag can never paint an in-flight
// state. This hook holds that pending state in LOCAL React state instead: `run` brackets the
// emit's returned promise with `pending = true/false`, giving views (and the floor button) a
// spinner during async work without any kernel change.

export type AsyncEmitFn = (
  name: string,
  payload?: Record<string, unknown>,
  actorId?: string
) => void | Promise<unknown>;

export interface UseAsyncEmitOptions {
  /**
   * Delay (ms) before `pending` flips true, so fast/synchronous dispatches don't flash a spinner.
   * Defaults to 0 (pending is observable immediately).
   */
  delayMs?: number;
}

export interface AsyncEmit {
  /** True while the most recent `run` is in flight (after the optional `delayMs`). */
  pending: boolean;
  /** Emit and track the returned dispatch promise as `pending`. Never rejects to the caller. */
  run: (name: string, payload?: Record<string, unknown>, actorId?: string) => Promise<void>;
}

export function useAsyncEmit(emit: AsyncEmitFn, options?: UseAsyncEmitOptions): AsyncEmit {
  const delayMs = options?.delayMs ?? 0;
  const [pending, setPending] = React.useState(false);
  const mountedRef = React.useRef(true);
  const emitRef = React.useRef(emit);
  emitRef.current = emit;

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = React.useCallback<AsyncEmit["run"]>(
    async (name, payload, actorId) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (delayMs > 0) {
        timer = setTimeout(() => {
          if (mountedRef.current) setPending(true);
        }, delayMs);
      } else if (mountedRef.current) {
        setPending(true);
      }
      try {
        await emitRef.current(name, payload, actorId);
      } finally {
        if (timer) clearTimeout(timer);
        if (mountedRef.current) setPending(false);
      }
    },
    [delayMs]
  );

  return { pending, run };
}
