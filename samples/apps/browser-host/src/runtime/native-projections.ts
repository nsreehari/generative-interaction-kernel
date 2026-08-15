import type { ProjectionView } from "@gik/react";
import copilotC2Leaves from "../../../../blueprints/copilot-c2/native/projection_views/copilotC2Leaves";
import foundryAgentLeaves from "../../../../blueprints/foundry-agent/native/projection_views/foundryAgentLeaves";
import liveWorkspaceSocLeaves from "../../../../blueprints/live-workspace-soc/native/projection_views/liveWorkspaceSocLeaves";
import manageBlueprintsLeaves from "../../../../blueprints/manage-blueprints/native/projection_views/manageBlueprintsLeaves";
import portfolioTrackerLeaves from "../../../../blueprints/portfolio-tracker/native/projection_views/portfolioTrackerLeaves";
import samplesOverviewLeaves from "../../../../blueprints/samples-overview/native/projection_views/samplesOverviewLeaves";

const modules: Readonly<Record<string, Record<string, ProjectionView>>> = {
  "copilot-c2": copilotC2Leaves,
  "foundry-agent": foundryAgentLeaves,
  "live-workspace-soc": liveWorkspaceSocLeaves,
  "manage-blueprints": manageBlueprintsLeaves,
  "portfolio-tracker": portfolioTrackerLeaves,
  "samples-overview": samplesOverviewLeaves,
};

export function resolveSampleNativeProjectionViews(
  id: string,
): Record<string, ProjectionView> | undefined {
  return modules[id];
}