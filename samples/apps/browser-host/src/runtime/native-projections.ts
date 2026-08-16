import type { ProjectionView } from "@gik/react";
import copilotC2Leaves from "../../../../blueprints/copilot-c2/native/projection_views/copilotC2Leaves";
import liveWorkspaceSocLeaves from "../../../../blueprints/live-workspace-soc/native/projection_views/liveWorkspaceSocLeaves";
import manageBlueprintsLeaves from "../../../../blueprints/manage-blueprints/native/projection_views/manageBlueprintsLeaves";
import portfolioTrackerLeaves from "../../../../blueprints/portfolio-tracker-new/native/projection_views/portfolioTrackerLeaves";
import samplesOverviewLeaves from "../../../../blueprints/samples-overview/native/projection_views/samplesOverviewLeaves";

const modules: Readonly<Record<string, Record<string, ProjectionView>>> = {
  "copilot-c2": copilotC2Leaves,
  "live-workspace-soc": liveWorkspaceSocLeaves,
  "manage-blueprints": manageBlueprintsLeaves,
  "portfolio-tracker-new": portfolioTrackerLeaves,
  "samples-overview": samplesOverviewLeaves,
};

export function resolveSampleNativeProjectionViews(
  id: string,
): Record<string, ProjectionView> | undefined {
  return modules[id];
}