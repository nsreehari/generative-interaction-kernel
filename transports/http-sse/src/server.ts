// Server-side HTTP/SSE binding for the transport seam. Host -> client messages stream
// over an SSE response; client -> host `event`s arrive as POSTs correlated by a session
// id (returned as the `X-GUP-Session` header on the stream). Each SSE stream is one
// connection attached to the KernelTransportHost broker; a reconnecting client passes
// `?fromRev=N` to resume with an incremental replay instead of a full re-onboard.

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  GupMessage,
  KernelTransportHost,
  TransportListener,
  TransportProvider,
} from "../../../kernel/src/index";
import { encodeSseFrame } from "./codec";

class SseServerEndpoint implements TransportProvider {
  private listener?: TransportListener;

  constructor(private readonly res: ServerResponse) {}

  send(message: GupMessage): void {
    this.res.write(encodeSseFrame(message));
  }

  subscribe(listener: TransportListener): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  }

  /** Deliver a client-originated message (a POSTed event) to the host. */
  deliver(message: GupMessage): void | Promise<void> {
    return this.listener?.(message);
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export interface SseTransportServerOptions {
  /** Base path the two routes mount under; defaults to `/gup`. */
  path?: string;
}

export class SseTransportServer {
  private readonly path: string;
  private readonly endpoints = new Map<string, SseServerEndpoint>();
  private readonly detachers = new Map<string, () => void>();

  constructor(
    private readonly host: KernelTransportHost,
    opts: SseTransportServerOptions = {}
  ) {
    this.path = opts.path ?? "/gup";
  }

  /**
   * Try to handle a request. Returns true if it matched a GUP route (`GET {path}/stream`
   * or `POST {path}/event`), false otherwise so a host app can fall through to its own
   * routing.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === `${this.path}/stream`) {
      await this.openStream(req, res, url);
      return true;
    }
    if (req.method === "POST" && url.pathname === `${this.path}/event`) {
      await this.receiveEvent(req, res, url);
      return true;
    }
    return false;
  }

  private async openStream(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const sessionId = randomUUID();
    const fromRevRaw = url.searchParams.get("fromRev");
    const fromRev = fromRevRaw !== null && fromRevRaw !== "" ? Number(fromRevRaw) : undefined;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-GUP-Session": sessionId,
    });

    const endpoint = new SseServerEndpoint(res);
    this.endpoints.set(sessionId, endpoint);
    const detach = await this.host.attach(
      endpoint,
      fromRev !== undefined && Number.isFinite(fromRev) ? fromRev : undefined
    );
    this.detachers.set(sessionId, detach);

    const cleanup = () => {
      this.detachers.get(sessionId)?.();
      this.detachers.delete(sessionId);
      this.endpoints.delete(sessionId);
    };
    req.on("close", cleanup);
  }

  private async receiveEvent(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const headerSession = req.headers["x-gup-session"];
    const sessionId =
      url.searchParams.get("session") ??
      (typeof headerSession === "string" ? headerSession : undefined);
    const endpoint = sessionId ? this.endpoints.get(sessionId) : undefined;

    const body = await readBody(req);
    if (!endpoint) {
      res.writeHead(404).end();
      return;
    }
    await endpoint.deliver(JSON.parse(body) as GupMessage);
    res.writeHead(204).end();
  }
}
