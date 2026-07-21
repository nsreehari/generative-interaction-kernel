// The control-plane projection over the shared full catalog.

import { createMcpDispatcher, type McpDispatcher, type McpTool } from "../tool-surface";
import type { ControlFace } from "../live/controlface";
import { fullCatalogTools } from "./full-catalog";

export function controlFaceTools(face: ControlFace): McpTool[] {
  return fullCatalogTools(face);
}

export function createControlFaceDispatcher(face: ControlFace): McpDispatcher {
  return createMcpDispatcher(controlFaceTools(face), { name: "genui-controlface", version: "0.1" });
}
