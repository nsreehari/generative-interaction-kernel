// The control-plane projection over the shared full catalog.

import { createMcpDispatcher, type McpDispatcher, type McpTool } from "../tool-surface";
import type { RuntimeFace } from "../live/runtime-tools";
import { fullCatalogTools } from "./full-catalog";

export function controlFaceTools(face: RuntimeFace): McpTool[] {
  return fullCatalogTools(face);
}

export function createControlFaceDispatcher(face: RuntimeFace): McpDispatcher {
  return createMcpDispatcher(controlFaceTools(face), { name: "genui-controlface", version: "0.1" });
}
