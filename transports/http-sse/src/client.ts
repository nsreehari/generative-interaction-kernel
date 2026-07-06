// Client-side HTTP/SSE transport. Implements the transport seam so a GenUIClient can run
// over the network unchanged: `subscribe` opens the SSE stream (host -> client), `send`
// POSTs an event (client -> host) correlated by the session id the stream returned.

import type {
  GupMessage,
  TransportListener,
  TransportProvider,
} from "../../../kernel/src/index";
import { SseFrameParser } from "./codec";

export interface SseClientTransportOptions {
  /** Resume from this revision on connect (reconnection); omit for a full onboard. */
  fromRev?: number;
  /** Injectable fetch (defaults to the global). */
  fetch?: typeof fetch;
  /** Base path the server mounts under; defaults to `/gup`. */
  path?: string;
}

export class SseClientTransport implements TransportProvider {
  private readonly base: string;
  private readonly path: string;
  private readonly fetchImpl: typeof fetch;
  private readonly fromRev?: number;

  private controller?: AbortController;
  private readonly sessionReady: Promise<string>;
  private resolveSession!: (id: string) => void;

  constructor(baseUrl: string, opts: SseClientTransportOptions = {}) {
    this.base = baseUrl.replace(/\/$/, "");
    this.path = opts.path ?? "/gup";
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.fromRev = opts.fromRev;
    this.sessionReady = new Promise((resolve) => (this.resolveSession = resolve));
  }

  subscribe(listener: TransportListener): () => void {
    this.controller = new AbortController();
    void this.stream(listener, this.controller.signal);
    return () => this.controller?.abort();
  }

  async send(message: GupMessage): Promise<void> {
    // Wait until the stream has established a session before routing events back.
    const session = await this.sessionReady;
    await this.fetchImpl(`${this.base}${this.path}/event?session=${session}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  }

  private async stream(listener: TransportListener, signal: AbortSignal): Promise<void> {
    const query = this.fromRev !== undefined ? `?fromRev=${this.fromRev}` : "";
    const res = await this.fetchImpl(`${this.base}${this.path}/stream${query}`, {
      headers: { Accept: "text/event-stream" },
      signal,
    });

    const session = res.headers.get("x-gup-session");
    if (session) this.resolveSession(session);
    if (!res.body) return;

    const parser = new SseFrameParser();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const message of parser.push(decoder.decode(value, { stream: true }))) {
          await listener(message);
        }
      }
    } catch (err) {
      // Aborting on unsubscribe surfaces as an AbortError; anything else propagates.
      if (!signal.aborted) throw err;
    }
  }
}
