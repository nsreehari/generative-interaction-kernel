// The shared FULL catalog over the face package: every pure authoring tool plus every live runtime
// tool. Other projections (controlface, agentface) derive filtered views from this list.

import { runtimeTools, type RuntimeFace } from "../live/runtime-tools";
import { authoringTools } from "../pure/authoring-tools";
import type { McpTool } from "../tool-surface";

export function fullCatalogTools(face: RuntimeFace): McpTool[] {
  return [...authoringTools, ...runtimeTools(face)];
}