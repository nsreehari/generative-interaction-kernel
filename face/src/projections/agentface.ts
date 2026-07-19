// The FILTERED agent-facing catalog/view over the same underlying face package. AgentFace does not
// implement anything separately; it is just an allowlisted projection of the full catalog.

import { createMcpDispatcher, type McpDispatcher, type McpTool } from "../tool-surface";
import { authoringTools } from "../pure/authoring-tools";
import { controlFaceTools } from "./controlface";
import type { ControlFace } from "../live/controlface";

const AGENT_SAFE_RUNTIME = ["getState", "getTree", "describeServiceKinds"] as const;

// Agent-safety is a property of each tool (`McpTool.agentSafe`), so the projection is a uniform
// predicate filter that also covers profile-contributed tools. AGENTFACE_ALLOWLIST stays exported
// as the derived set of agent-safe names for the built-in surface.
export const AGENTFACE_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  ...authoringTools.filter((t) => t.agentSafe).map((t) => t.name),
  ...AGENT_SAFE_RUNTIME,
]);

export function agentFaceProjection(face: ControlFace): McpTool[] {
  return controlFaceTools(face).filter((t) => t.agentSafe);
}

export function createAgentFaceDispatcher(face: ControlFace): McpDispatcher {
  return createMcpDispatcher(agentFaceProjection(face), { name: "genui-agentface", version: "0.1" });
}

// A stateless projection for hosts that only want the pure authoring tools and do not have a live
// runtime. Callers compose profile-contributed tools (e.g. a genui profile's declared authoring
// surface via `toolsFromProfile`) by passing them as `extraTools`; the projection stays a uniform
// agent-safe filter over the combined catalog, so face itself carries no profile-specific tools.
export function createStatelessAgentFaceDispatcher(extraTools: McpTool[] = []): McpDispatcher {
  const tools = [...authoringTools, ...extraTools].filter((t) => t.agentSafe);
  return createMcpDispatcher(tools, { name: "genui-agentface", version: "0.1" });
}
