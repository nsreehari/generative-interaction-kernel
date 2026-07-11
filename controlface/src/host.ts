// The ControlFace HTTP host: the composition that serves the faces over their transports.
// SSE (`/gup`) binds to the ControlFace boundary (render stream). Two MCP channels expose the same
// tool catalog at different trust levels: `/mcp` serves the AgentFace projection (the agent-safe
// subset), `/mcp-control` serves the FULL control-plane catalog (adds the live runtime tools). One
// runtime, one catalog, two audiences — the trust boundary is which face each route exposes. The
// kernel, broker, reducer, and GUP codec are composed INSIDE the ControlFace; no transport reaches
// past a face into an internal layer.
//
// `handle()` returns true when it matched a route so a host app can fall through to its own routing
// (same contract as SseTransportServer / McpHttpServer).

import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  Checkpoint,
  DocumentPayload,
  Enveloped,
  GupEvent,
  Json,
  ManifestPayload,
  Patch,
  RecordedEffect,
  ResolvedNode,
  StateModel,
} from "../../kernel/src/index";
import { SseTransportServer } from "../../transports/http-sse/src/index";
import { McpHttpServer, type McpMessageHandler } from "../../transports/mcp-http/src/index";
import { ControlFace } from "./controlface";
import { createControlFaceDispatcher } from "./tools";

export interface ControlfaceHostOptions {
  /** Base path for the SSE render/drive channel; defaults to `/gup`. */
  gupPath?: string;
  /** Path for the agent MCP channel (AgentFace subset); defaults to `/mcp`. */
  mcpPath?: string;
  /** Path for the control-plane MCP channel (full catalog); defaults to `/mcp-control`. */
  mcpControlPath?: string;
  /** The face served on the agent MCP channel; defaults to the AgentFace projection. */
  mcpHandler?: McpMessageHandler;
  /** Pre-seeded state model for the kernel (namespaces already populated). */
  state?: StateModel;
}

export class ControlfaceHost {
  /** The render/drive + control-plane face. SSE binds to this; the kernel/broker live inside it. */
  readonly controlface: ControlFace;
  private readonly sse: SseTransportServer;
  private readonly mcp: McpHttpServer;
  private readonly mcpControl: McpHttpServer;

  constructor(
    manifest: Enveloped<ManifestPayload>,
    document: Enveloped<DocumentPayload>,
    opts: ControlfaceHostOptions = {}
  ) {
    this.controlface = new ControlFace(manifest, document, { state: opts.state });
    // SSE binds to the FACE (a TransportBroker), not the internal broker.
    this.sse = new SseTransportServer(this.controlface, { path: opts.gupPath ?? "/gup" });
    // `/mcp` = AgentFace subset; `/mcp-control` = full control-plane catalog over the live face.
    this.mcp = new McpHttpServer({ path: opts.mcpPath ?? "/mcp", handler: opts.mcpHandler });
    this.mcpControl = new McpHttpServer({
      path: opts.mcpControlPath ?? "/mcp-control",
      handler: createControlFaceDispatcher(this.controlface).handleMcpMessage,
    });
  }

  /**
   * Route a request: SSE render/drive (`/gup/stream`, `/gup/event`), agent MCP (`/mcp`),
   * control-plane MCP (`/mcp-control`), then `/healthz`. Returns false if nothing matched so a
   * host app can add its own routes.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (await this.sse.handle(req, res)) return true;
    if (await this.mcp.handle(req, res)) return true;
    if (await this.mcpControl.handle(req, res)) return true;
    if ((req.url ?? "") === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
    return false;
  }

  // --- In-process control-plane surface, delegated to the face ---------------

  /** Drive the kernel and broadcast the patch to every connected render client. */
  emit(event: GupEvent): Promise<Patch> {
    return this.controlface.emit(event);
  }

  getState(): Record<string, Json> {
    return this.controlface.getState();
  }

  getTree(): Promise<ResolvedNode> {
    return this.controlface.getTree();
  }

  checkpoint(): Checkpoint {
    return this.controlface.checkpoint();
  }

  effectsSince(rev: number): RecordedEffect[] {
    return this.controlface.effectsSince(rev);
  }

  /** Detach every connection (the caller owns the node server lifecycle). */
  stop(): void {
    this.controlface.stop();
  }
}
