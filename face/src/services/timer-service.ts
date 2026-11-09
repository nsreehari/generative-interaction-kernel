import type { ServiceKindFactory } from "./service-kinds";

/** A fixed-delay timer provider. Calendar schedules can be implemented by other service kinds. */
export function createIntervalTimerServiceKind(): ServiceKindFactory {
  const provider = { id: "interval-timer", version: "1" };
  function interval(input: unknown): number {
    if (!input || typeof input !== "object" || !("intervalMs" in input)
      || typeof input.intervalMs !== "number" || !Number.isSafeInteger(input.intervalMs)
      || input.intervalMs < 1 || input.intervalMs > 2_147_483_647) {
      throw new Error("interval-timer requires intervalMs between 1 and 2147483647");
    }
    return input.intervalMs;
  }
  return {
    manifest: {
      ...provider,
      configSchema: { type: "object", additionalProperties: false },
      executionModes: ["immediate"], subjects: ["cell"], supports: { observe: true },
    },
    validate(declaration) {
      const supported = Object.values(declaration.operations).every((operation) =>
        operation.operation === "interval" && operation.sense?.kind === "timer"
        && Object.keys(operation.sense.signals).length === 1 && Boolean(operation.sense.signals.due),
      );
      return supported ? { ok: true } : { ok: false, errors: ["interval-timer supports timer/interval with the due Signal only"] };
    },
    create: () => ({
      provider,
      async discover() { return { provider, revision: "1", discoveredAt: new Date().toISOString(), capabilities: [] }; },
      execute() { throw new Error("interval-timer requires a Sense usage"); },
      async observe(request, context) {
        if (context.kind !== "timer" || context.action !== "schedule") throw new Error("Unsupported timer lifecycle");
        const delay = interval(request.input);
        let sequence = 0;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const close = () => { stopped = true; clearTimeout(timer); };
        const tick = async () => {
          if (stopped || context.signal?.aborted) return;
          try {
            await context.emit({
              id: `${request.id}:${++sequence}`, name: "due",
              payload: { occurredAt: new Date().toISOString(), occurrence: sequence },
            });
            if (!stopped && !context.signal?.aborted) timer = setTimeout(() => { void tick(); }, delay);
          } catch (error) { close(); context.onError(error); }
        };
        timer = setTimeout(() => { void tick(); }, delay);
        context.signal?.addEventListener("abort", close, { once: true });
        if (context.signal?.aborted) close();
        return {
          close(action) {
            if (action !== "cancel") throw new Error("Unsupported timer cleanup action");
            close();
            context.signal?.removeEventListener("abort", close);
          },
        };
      },
    }),
  };
}
