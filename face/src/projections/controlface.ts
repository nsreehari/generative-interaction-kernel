// The FULL catalog/view over the face package: every pure authoring tool plus every live runtime
// tool. This is the implementation surface first-party UI/API can expose.

import { createMcpDispatcher, type McpDispatcher, type McpTool } from "../tool-surface";
import { authoringTools } from "../pure/authoring-tools";
import { runtimeTools } from "../live/runtime-tools";
import type { ControlFace } from "../live/controlface";

export function controlFaceTools(face: ControlFace): McpTool[] {
  return [...authoringTools, ...runtimeTools(face)];
}

export function createControlFaceDispatcher(face: ControlFace): McpDispatcher {
  return createMcpDispatcher(controlFaceTools(face), { name: "genui-controlface", version: "0.1" });
}
