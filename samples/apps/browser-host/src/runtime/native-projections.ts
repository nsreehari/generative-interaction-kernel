import type { ProjectionView } from "@gik/react";
import manageBlueprintsLeaves from "../../../../blueprints/manage-blueprints/native/projection_views/manageBlueprintsLeaves";

const modules: Readonly<Record<string, Record<string, ProjectionView>>> = {
  "manage-blueprints": manageBlueprintsLeaves,
};

export function resolveSampleNativeProjectionViews(
  id: string,
): Record<string, ProjectionView> | undefined {
  return modules[id];
}