import {
  createCapabilityDescribeTool,
  capabilityDescribeInputSchema,
  type AgentTool,
  type AgentToolExecutionContext,
} from "@gik/agent-lifecycle-exp";
import type { AgentFacingCapabilityCatalog } from "@gik/components/agent-facing";

export function createSampleAgentTools(
  extensions: readonly AgentFacingCapabilityCatalog[] = [],
): readonly AgentTool[] {
  // `@gik/components/agent-facing` carries generated per-component capability metadata (~470KB) that
  // only matters once an agent actually calls `describe`. Loading it eagerly here pulls that weight
  // into every Blueprint's service host at render time, even for purely human-facing sessions. Defer
  // the import (and the catalog merge/tool construction it feeds) until the tool is first invoked.
  let describeToolPromise: Promise<AgentTool> | undefined;
  const resolveDescribeTool = (): Promise<AgentTool> => {
    describeToolPromise ??= import("@gik/components/agent-facing").then(
      ({ agentFacingComponentCatalog, mergeAgentFacingCapabilityCatalogs }) =>
        createCapabilityDescribeTool(
          mergeAgentFacingCapabilityCatalogs(agentFacingComponentCatalog, ...extensions),
        ),
    );
    return describeToolPromise;
  };

  return [
    {
      name: "describe",
      description: "Discover projection capabilities or retrieve compact contracts for multiple shortlisted capabilities in one call.",
      inputSchema: capabilityDescribeInputSchema,
      lifecycle: "agent",
      handler: async (args: unknown, context?: AgentToolExecutionContext) =>
        (await resolveDescribeTool()).handler(args, context),
    },
  ];
}
