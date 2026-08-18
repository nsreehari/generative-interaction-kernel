import { createCapabilityDescribeTool, type AgentTool } from "@gik/agent-lifecycle-exp";
import {
  agentFacingComponentCatalog,
  mergeAgentFacingCapabilityCatalogs,
  type AgentFacingCapabilityCatalog,
} from "@gik/components";

export function createSampleAgentTools(
  extensions: readonly AgentFacingCapabilityCatalog[] = [],
): readonly AgentTool[] {
  const catalog = mergeAgentFacingCapabilityCatalogs(
    agentFacingComponentCatalog,
    ...extensions,
  );
  return [createCapabilityDescribeTool(catalog)];
}
