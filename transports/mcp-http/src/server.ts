// Server-side HTTP binding for the MCP (agent) transport seam. A single route speaks
// JSON-RPC 2.0 over an injected, transport-free dispatcher (the agentface projection by
// default). The adapter is pure wire glue — CORS, method routing, body framing — and knows
// nothing about which tools the face exposes; swapping the `handler` swaps the face. This is
// the MCP analogue of `SseTransportServer`: `handle()` returns true when it matched the route
// so a host app can fall through to its own routing.

import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMcpMessage, MCP_PROTOCOL_VERSION } from "../../../agentface/ts/src/index";

/** A pure JSON-RPC 2.0 dispatcher: one message in, one reply out (or `undefined` for a notification). */
export type McpMessageHandler = (message: unknown) => Record<string, unknown> | undefined;

export interface McpHttpServerOptions {
  /** The path the JSON-RPC route mounts at; defaults to `/mcp`. */
  path?: string;
  /** The face to expose. Defaults to the agentface projection (`handleMcpMessage`). */
  handler?: McpMessageHandler;
  /** The protocol version advertised on `GET {path}`; defaults to the agentface MCP revision. */
  protocolVersion?: string;
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

export class McpHttpServer {
  private readonly path: string;
  private readonly handler: McpMessageHandler;
  private readonly protocolVersion: string;

  constructor(opts: McpHttpServerOptions = {}) {
    this.path = opts.path ?? "/mcp";
    this.handler = opts.handler ?? handleMcpMessage;
    this.protocolVersion = opts.protocolVersion ?? MCP_PROTOCOL_VERSION;
  }

  /**
   * Try to handle a request. Returns true if it matched the MCP route (`GET`/`POST`/`OPTIONS`
   * at `{path}`), false otherwise so a host app can fall through to its own routing.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== this.path) return false;

    if (req.method === "OPTIONS") {
      this.writeCorsHeaders(req, res);
      res.writeHead(204).end();
      return true;
    }
    if (req.method === "GET") {
      this.writeCorsHeaders(req, res);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ transport: "mcp/jsonrpc", protocol: this.protocolVersion }));
      return true;
    }
    if (req.method !== "POST") {
      this.writeCorsHeaders(req, res);
      res.writeHead(405).end();
      return true;
    }

    const body = await readBody(req);
    this.writeCorsHeaders(req, res);
    let message: unknown;
    try {
      message = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } })
      );
      return true;
    }
    const reply = this.handler(message);
    if (reply === undefined) {
      res.writeHead(204).end(); // notification — no body
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(reply));
    return true;
  }

  private writeCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
}
