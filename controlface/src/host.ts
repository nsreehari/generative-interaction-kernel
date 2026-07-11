// The ControlFace host: the composition that binds a live bundle to a kernel and co-hosts BOTH
// faces on one HTTP surface — the UI/API render+drive channel (SSE `/gup`) and the agent channel
// (MCP `/mcp`, serving the AgentFace projection). This is the genui analogue of a hosted-board
// runtime's `http-mcp-controlface`: one runtime, two audiences, the trust boundary drawn by which
// face each route exposes.
//
// `handle()` returns true when it matched a route so a host app can fall through to its own routing
// (same contract as SseTransportServer / McpHttpServer). Live drive from in-process (UI/API or a
// co-located agent) goes through `emit()`, which routes through the broker so the patch broadcasts
// to every SSE client — never a silent kernel poke.

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  Kernel,
  KernelTransportHost,
  type Checkpoint,
  type DocumentPayload,
  type Enveloped,
  type GupEvent,
  type Json,
  type ManifestPayload,
  type Patch,
  type RecordedEffect,
  type ResolvedNode,
  type StateModel,
} from "../../kernel/src/index";
import { SseTransportServer } from "../../transports/http-sse/src/index";
import { McpHttpServer, type McpMessageHandler } from "../../transports/mcp-http/src/index";
import { checkpoint, effectsSince, getState, getTree } from "./ops";

export interface ControlfaceHostOptions {
  /** Base path for the SSE render/drive channel; defaults to `/gup`. */
  gupPath?: string;
  /** Path for the agent MCP channel; defaults to `/mcp`. */
  mcpPath?: string;
  /** The face served on the MCP channel; defaults to the AgentFace projection. */
  mcpHandler?: McpMessageHandler;
  /** Pre-seeded state model for the kernel (namespaces already populated). */
  state?: StateModel;
}

export class ControlfaceHost {
  readonly kernel: Kernel;
  readonly transportHost: KernelTransportHost;
  private readonly sse: SseTransportServer;
  private readonly mcp: McpHttpServer;

  constructor(
    manifest: Enveloped<ManifestPayload>,
    document: Enveloped<DocumentPayload>,
    opts: ControlfaceHostOptions = {}
  ) {
    this.kernel = new Kernel(manifest, document, opts.state ? { state: opts.state } : {});
    this.transportHost = new KernelTransportHost(manifest, document, this.kernel);
    this.sse = new SseTransportServer(this.transportHost, { path: opts.gupPath ?? "/gup" });
    this.mcp = new McpHttpServer({ path: opts.mcpPath ?? "/mcp", handler: opts.mcpHandler });
  }

  /**
   * Route a request: SSE render/drive (`/gup/stream`, `/gup/event`), agent MCP (`/mcp`), then
   * `/healthz`. Returns false if nothing matched so a host app can add its own routes.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (await this.sse.handle(req, res)) return true;
    if (await this.mcp.handle(req, res)) return true;
    if ((req.url ?? "") === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
    return false;
  }

  // --- In-process control-plane surface (the UI/API face) --------------------

  /** Drive the kernel and broadcast the patch to every connected render client. */
  emit(event: GupEvent): Promise<Patch> {
    return this.transportHost.dispatch(event);
  }

  getState(): Record<string, Json> {
    return getState(this.kernel);
  }

  getTree(): Promise<ResolvedNode> {
    return getTree(this.kernel);
  }

  checkpoint(): Checkpoint {
    return checkpoint(this.kernel);
  }

  effectsSince(rev: number): RecordedEffect[] {
    return effectsSince(this.kernel, rev);
  }

  /** Detach every connection (the caller owns the node server lifecycle). */
  stop(): void {
    this.transportHost.stop();
  }
}
