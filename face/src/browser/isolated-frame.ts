import { createCapabilityChannel, type CapabilityChannelOptions } from "./capability-channel";

export async function openIsolatedCapabilityFrame(
  handle: Parameters<typeof createCapabilityChannel>[1],
  options: CapabilityChannelOptions & { source: URL; protocol: string; signal?: AbortSignal; loadTimeoutMs?: number },
) {
  options.signal?.throwIfAborted();
  if (!["http:", "https:"].includes(options.source.protocol) || options.source.origin !== window.location.origin)
    throw new Error("The isolated runtime must use a host-owned same-origin HTTP resource.");
  if (!options.protocol) throw new Error("An isolated runtime protocol is required.");
  const frame = document.createElement("iframe");
  frame.hidden = true; frame.title = `Isolated ${options.label ?? "Capability"} Runtime`;
  frame.setAttribute("sandbox", "allow-scripts");
  const channel = new MessageChannel();
  const bridge = createCapabilityChannel(channel.port1, handle, options);
  function close() { try { bridge.close(); } finally { frame.remove(); } }
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout); options.signal?.removeEventListener("abort", abort);
        frame.onload = null; frame.onerror = null;
      };
      const abort = () => { cleanup(); reject(options.signal?.reason); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error("The isolated runtime did not load.")); }, options.loadTimeoutMs ?? 30_000);
      frame.onload = () => { cleanup(); resolve(); };
      frame.onerror = () => { cleanup(); reject(new Error("The isolated runtime could not load.")); };
      options.signal?.addEventListener("abort", abort, { once: true });
      frame.src = options.source.href; document.body.append(frame);
    });
    options.signal?.throwIfAborted();
    if (!frame.contentWindow) throw new Error("The isolated runtime has no execution window.");
    // Opaque sandbox origins require "*"; possession of this private port is the scoped capability.
    frame.contentWindow.postMessage({ type: options.protocol }, "*", [channel.port2]);
    return { call: bridge.call, close };
  } catch (error) { try { close(); } finally { channel.port2.close(); } throw error; }
}

export function acceptCapabilityPort(event: MessageEvent, binding: { source: MessageEventSource; origin: string; protocol: string }): MessagePort | undefined {
  if (event.source !== binding.source || event.origin !== binding.origin || event.ports.length !== 1
    || !event.data || typeof event.data !== "object" || event.data.type !== binding.protocol) return undefined;
  return event.ports[0];
}
