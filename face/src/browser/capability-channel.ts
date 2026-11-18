export interface CapabilityChannelOptions {
  label?: string;
  maxMessageBytes?: number;
  timeoutMs?: number;
  errorFields?: readonly string[];
}

function assertWireValue(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object" || ancestors.has(value)
    || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new Error("Capability messages require finite JSON values without cycles.");
  ancestors.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) assertWireValue(child, ancestors);
  ancestors.delete(value);
}

/** Transport only: the handler must admit every operation against host-owned capabilities. */
export function createCapabilityChannel(port: MessagePort,
  handle: (operation: string, input: unknown, signal: AbortSignal) => Promise<unknown>,
  { label = "Capability", maxMessageBytes = 8 * 1024 * 1024, timeoutMs = 120_000, errorFields = ["code", "status"] }: CapabilityChannelOptions = {}) {
  if (!Number.isSafeInteger(maxMessageBytes) || maxMessageBytes < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new Error("Capability channel limits must be positive safe integers.");
  let sequence = 0, closed: Error | undefined;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }>();
  const active = new Map<number, AbortController>();
  const encoder = new TextEncoder();
  function bounded(value: unknown) {
    assertWireValue(value);
    if (encoder.encode(JSON.stringify(value)).byteLength > maxMessageBytes)
      throw new Error(`${label} message exceeds its size limit.`);
  }
  function close(reason = new Error(`${label} channel closed. Inspect interrupted work before retrying.`), notify = true) {
    if (closed) return;
    closed = reason;
    for (const request of pending.values()) { request.cleanup(); request.reject(reason); }
    for (const controller of active.values()) controller.abort();
    pending.clear(); active.clear();
    try { if (notify) port.postMessage({ type: "closed", id: 1 }); }
    finally { port.close(); }
  }
  port.onmessageerror = () => close(new Error(`${label} message could not be decoded.`));
  port.onmessage = event => {
    const message: unknown = event.data;
    try { bounded(message); } catch { close(new Error(`${label} message failed validation.`)); return; }
    if (!message || typeof message !== "object" || !("id" in message) || !Number.isSafeInteger(message.id)
      || Number(message.id) < 1 || !("type" in message)) { close(new Error(`${label} message envelope is invalid.`)); return; }
    const id = Number(message.id);
    if (message.type === "closed") { close(undefined, false); return; }
    if (message.type === "cancel") { active.get(id)?.abort(); return; }
    if (message.type === "result" || message.type === "error") {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id); request.cleanup();
      try {
        if (message.type === "result") {
          request.resolve("value" in message ? message.value : undefined);
        } else if (message.type === "error" && "message" in message && typeof message.message === "string") {
          bounded(message.message);
          const error = new Error(message.message);
          for (const key of errorFields) {
            const value: unknown = Reflect.get(message, key);
            if (["string", "boolean", "number"].includes(typeof value)) {
              bounded(value); Object.defineProperty(error, key, { value, enumerable: true });
            }
          }
          request.reject(error);
        } else throw new Error(`${label} response is invalid.`);
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(`${label} response failed validation.`));
        close(new Error(`${label} response failed validation.`));
      }
      return;
    }
    if (message.type !== "request" || !("operation" in message) || typeof message.operation !== "string"
      || !("input" in message) || active.has(id)) { close(new Error(`${label} request is invalid.`)); return; }
    const controller = new AbortController();
    const { operation, input } = message;
    active.set(id, controller);
    void (async () => {
      try {
        const value = await handle(operation, input, controller.signal);
        controller.signal.throwIfAborted();
        const result = { type: "result", id, ...(value === undefined ? {} : { value }) };
        bounded(result);
        if (!closed) port.postMessage(result);
      } catch (error) {
        if (!closed) {
          const details: Record<string, unknown> = {};
          if (error instanceof Error) for (const key of errorFields) {
            const value: unknown = Reflect.get(error, key);
            if (["string", "boolean", "number"].includes(typeof value)) details[key] = value;
          }
          const failure = { type: "error", id, message: error instanceof Error ? error.message : `${label} operation failed.`, ...details };
          try { bounded(failure); port.postMessage(failure); }
          catch { close(new Error(`${label} failure could not be delivered within the channel limits.`)); }
        }
      } finally { active.delete(id); }
    })();
  };
  port.start();
  return {
    close: () => close(),
    call<T = unknown>(operation: string, input: unknown = {}, signal?: AbortSignal): Promise<T> {
      if (closed) return Promise.reject(closed);
      const lifetime = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]);
      lifetime.throwIfAborted();
      const id = ++sequence;
      const request = { type: "request", id, operation, input };
      try { bounded(request); }
      catch (error) { return Promise.reject(error); }
      return new Promise<T>((resolve, reject) => {
        const abort = () => {
          pending.delete(id); lifetime.removeEventListener("abort", abort);
          port.postMessage({ type: "cancel", id });
          reject(lifetime.reason);
        };
        pending.set(id, { resolve: value => resolve(value as T), reject, cleanup: () => lifetime.removeEventListener("abort", abort) });
        lifetime.addEventListener("abort", abort, { once: true });
        try { port.postMessage(request); }
        catch (error) { pending.delete(id); lifetime.removeEventListener("abort", abort); reject(error); }
      });
    },
  };
}
