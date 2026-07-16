import { controlFaceTools, type ControlFace } from "@gik/controlface";
import { createMcpDispatcher, type McpDispatcher, type McpTool } from "../../../face/src/tool-surface";

export { AGENTFACE_ALLOWLIST, createStatelessAgentFaceDispatcher } from "../../../face/src/projections/agentface";
export { MCP_PROTOCOL_VERSION, type McpDispatcher, type McpServerInfo, type McpTool } from "../../../face/src/tool-surface";
// The generic profile->tools engine: hosts materialize a profile's declared authoring surface into
// agent-safe tools and compose them via `createStatelessAgentFaceDispatcher(extraTools)`.
export { toolsFromProfile, type AuthoringRegistry, type AuthoringReport } from "../../../face/src/pure/profile-tools";

export function agentFaceProjection(face: ControlFace): McpTool[] {
  return controlFaceTools(face).filter((tool) => tool.agentSafe);
}

export function createAgentFaceDispatcher(face: ControlFace): McpDispatcher {
  return createMcpDispatcher(agentFaceProjection(face), { name: "genui-agentface", version: "0.1" });
}
