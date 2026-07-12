// ControlFace as an MCP tool catalog. The full control-plane surface is a single `McpTool[]`:
//   - the design-time authoring/validation tools (AgentFace's `agentFaceTools`, re-used verbatim), plus
//   - the live RUNTIME tools below (getState/getTree/emit/checkpoint/effectsSince), bound to a live
//     ControlFace so they read and drive the running kernel.
// AgentFace is this catalog filtered to `AGENTFACE_ALLOWLIST` — the projection is literally "filter
// the tool list", and both faces dispatch through the same `createMcpDispatcher`. The SSE render
// stream (`ControlFace.attach`) is separate streaming plumbing, not a tool on this surface.

import {
  agentFaceTools,
  createMcpDispatcher,
  type McpDispatcher,
  type McpTool,
} from "../../agentface/ts/src/index";
import type { GupEvent } from "../../kernel/src/index";
import type { ControlFace } from "./controlface";

const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const any = { type: "object" } as const;

/**
 * The live runtime tools — each a JSON->JSON op bound to a running {@link ControlFace}. These read
 * or drive the live kernel, so unlike the pure AgentFace tools they need an instance.
 */
export function runtimeTools(face: ControlFace): McpTool[] {
  return [
    {
      name: "getState",
      description: "Snapshot the live kernel state (all namespaces) as JSON.",
      inputSchema: obj({}),
      handler: () => face.getState(),
    },
    {
      name: "getTree",
      description: "Resolve and return the current render tree as JSON.",
      inputSchema: obj({}),
      handler: () => face.getTree(),
    },
    {
      name: "emit",
      description: "Drive the kernel with a GUP event and return the resulting patch (also broadcast to render clients).",
      inputSchema: obj({ event: any }, ["event"]),
      handler: (a) => face.emit(a.event as GupEvent),
    },
    {
      name: "checkpoint",
      description: "Capture a restorable checkpoint (rev + state) of the live kernel.",
      inputSchema: obj({}),
      handler: () => face.checkpoint(),
    },
    {
      name: "effectsSince",
      description: "List the recorded external effects since a given revision.",
      inputSchema: obj({ rev: { type: "number" } }, ["rev"]),
      handler: (a) => face.effectsSince(Number(a.rev)),
    },
  ];
}

/** The full control-plane catalog: the AgentFace subset plus the live runtime tools. */
export function controlFaceTools(face: ControlFace): McpTool[] {
  return [...agentFaceTools, ...runtimeTools(face)];
}

/**
 * Read-only runtime tools that are safe to hand to agents: they observe live state but never drive
 * the kernel or touch lifecycle. `emit`/`checkpoint`/`effectsSince` stay control-plane-only.
 */
const AGENT_SAFE_RUNTIME = ["getState", "getTree"] as const;

/**
 * The agent-safe allowlist: every AgentFace tool name — the pure authoring/validation tools PLUS the
 * read-only runtime inspect tools. AgentFace === the ControlFace catalog filtered to these names, so
 * this Set is the single source of truth for the projection (and the trust boundary).
 */
export const AGENTFACE_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  ...agentFaceTools.map((t) => t.name),
  ...AGENT_SAFE_RUNTIME,
]);

/**
 * The agent-safe projection of the full catalog over a live face: the authoring tools plus read-only
 * runtime inspect (getState/getTree). Needs a face because the inspect tools read the live kernel; a
 * kernel-free host can only serve the pure `agentFaceTools` subset (see agentface `handleMcpMessage`).
 */
export function agentFaceProjection(face: ControlFace): McpTool[] {
  return controlFaceTools(face).filter((t) => AGENTFACE_ALLOWLIST.has(t.name));
}

/** Build the JSON-RPC dispatcher for the FULL control-plane catalog over a live face. */
export function createControlFaceDispatcher(face: ControlFace): McpDispatcher {
  return createMcpDispatcher(controlFaceTools(face), { name: "genui-controlface", version: "0.1" });
}

/** Build the JSON-RPC dispatcher for the agent-safe projection over a live face (adds read-only inspect). */
export function createAgentFaceDispatcher(face: ControlFace): McpDispatcher {
  return createMcpDispatcher(agentFaceProjection(face), { name: "genui-agentface", version: "0.1" });
}
