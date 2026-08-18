import type { ProjectionView } from "@gik/react";
import copilotC2Leaves from "../../../../blueprints/half-baked/copilot-c2/native/projection_views/copilotC2Leaves";
import liveWorkspaceSocLeaves from "../../../../blueprints/half-baked/live-workspace-soc/native/projection_views/liveWorkspaceSocLeaves";
import manageBlueprintsLeaves from "../../../../blueprints/manage-blueprints/native/projection_views/manageBlueprintsLeaves";
import samplesOverviewLeaves from "../../../../blueprints/half-baked/samples-overview/native/projection_views/samplesOverviewLeaves";

const modules: Readonly<Record<string, Record<string, ProjectionView>>> = {
  "copilot-c2": copilotC2Leaves,
  "live-workspace-soc": liveWorkspaceSocLeaves,
  "manage-blueprints": manageBlueprintsLeaves,
  "samples-overview": samplesOverviewLeaves,
};

export function resolveSampleNativeProjectionViews(
  id: string,
): Record<string, ProjectionView> | undefined {
  return modules[id];
}