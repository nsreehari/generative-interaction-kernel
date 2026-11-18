import { test, expect, vi } from "vitest";
import { createCapabilityChannel } from "../src/browser/capability-channel";
import { acceptCapabilityPort, openIsolatedCapabilityFrame } from "../src/browser/isolated-frame";

test("capability RPC preserves shapes and admitted error fields without retrying failures", async () => {
  const ports = new MessageChannel();
  let calls = 0;
  const server = createCapabilityChannel(ports.port1, async operation => {
    calls++;
    if (operation === "fail") throw Object.assign(new Error("Inspect before retry"), { code: "UNCERTAIN", secret: "not forwarded" });
    return { nested: [1, null, false] };
  });
  const client = createCapabilityChannel(ports.port2, async () => { throw new Error("Not admitted"); });
  try {
    expect(await client.call("read")).toEqual({ nested: [1, null, false] });
    await expect(client.call("fail")).rejects.toMatchObject({ code: "UNCERTAIN" });
    await client.call("fail").catch(error => expect(error.secret).toBeUndefined());
    expect(calls).toBe(3);
  } finally { client.close(); server.close(); }
});

test("cancellation aborts the remote handler and closing rejects outstanding work", async () => {
  const ports = new MessageChannel();
  let entered!: () => void, aborted!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const cancelled = new Promise<void>(resolve => { aborted = resolve; });
  const server = createCapabilityChannel(ports.port1, async (_operation, _input, signal) => {
    entered();
    await new Promise<void>(resolve => signal.addEventListener("abort", () => { aborted(); resolve(); }, { once: true }));
    return "late";
  });
  const client = createCapabilityChannel(ports.port2, async () => undefined);
  try {
    const lifetime = new AbortController();
    const request = client.call("slow", {}, lifetime.signal);
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await ready; lifetime.abort(); await rejected; await cancelled;
    const outstanding = client.call("slow");
    const closed = expect(outstanding).rejects.toThrow("closed");
    client.close(); await closed;
  } finally { client.close(); server.close(); }
});

test("UTF-8 request limits and JSON checks run before the handler", async () => {
  const ports = new MessageChannel();
  let calls = 0;
  const server = createCapabilityChannel(ports.port1, async () => { calls++; });
  const client = createCapabilityChannel(ports.port2, async () => undefined, { maxMessageBytes: 80 });
  try {
    await expect(client.call("read", { text: "\u20ac".repeat(25) })).rejects.toThrow("size limit");
    await expect(client.call("read", { value: Number.POSITIVE_INFINITY })).rejects.toThrow("finite JSON");
    expect(calls).toBe(0);
  } finally { client.close(); server.close(); }
});

test("child port admission requires matching source, origin, protocol and one port", () => {
  const ports = new MessageChannel(), source = ports.port2;
  const binding = { source, origin: "https://example.test", protocol: "sample-v1" };
  try {
    const event = { source, origin: binding.origin, data: { type: binding.protocol }, ports: [ports.port1] };
    expect(acceptCapabilityPort(new MessageEvent("message", event), binding)).toBe(ports.port1);
    expect(acceptCapabilityPort(new MessageEvent("message", { ...event, origin: "https://other.test" }), binding)).toBeUndefined();
    expect(acceptCapabilityPort(new MessageEvent("message", { ...event, source: ports.port1 }), binding)).toBeUndefined();
  } finally { ports.port1.close(); ports.port2.close(); }
});

test("isolated frame enforces same-origin script-only sandboxing and cleans up on close", async () => {
  const attributes: Record<string, string> = {};
  const transferred: MessagePort[] = [];
  let removed = false;
  const frame: {
    hidden: boolean; title: string; src: string; onload: (() => void) | null; onerror: (() => void) | null;
    setAttribute(key: string, value: string): void; remove(): void;
    contentWindow: { postMessage(message: unknown, origin: string, ports: MessagePort[]): void };
  } = {
    hidden: false, title: "", src: "", onload: null, onerror: null,
    setAttribute: (key, value) => { attributes[key] = value; }, remove: () => { removed = true; },
    contentWindow: { postMessage: (_message, _origin, ports) => { transferred.push(...ports); } },
  };
  vi.stubGlobal("window", { location: { origin: "https://example.test" } });
  vi.stubGlobal("document", { createElement: () => frame, body: { append: () => frame.onload?.() } });
  try {
    await expect(openIsolatedCapabilityFrame(async () => null, {
      source: new URL("https://other.test/runtime"), protocol: "sample",
    })).rejects.toThrow("same-origin");
    const channel = await openIsolatedCapabilityFrame(async () => null, {
      source: new URL("https://example.test/runtime"), protocol: "sample",
    });
    expect(attributes.sandbox).toBe("allow-scripts");
    expect(frame.hidden).toBe(true);
    expect(transferred).toHaveLength(1);
    channel.close();
    expect(removed).toBe(true);
  } finally { transferred.forEach(port => port.close()); vi.unstubAllGlobals(); }
});
