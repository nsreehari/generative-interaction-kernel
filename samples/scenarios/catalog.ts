import {
  resolveDemoEntry,
  validateDemoCatalog,
  type DemoCatalog,
  type ScenarioPlan,
} from "../shared/demo-runner";

import catalogArtifact from "./catalog.json" with { type: "json" };
import { socExecutiveScenarioPlan } from "./live-workspace-soc-executive/compile";
import { t3ScenarioPlan } from "./live-workspace-soc-t3/compile";

const scenarioPlans = new Map<string, ScenarioPlan>([
  [t3ScenarioPlan.id, t3ScenarioPlan],
  [socExecutiveScenarioPlan.id, socExecutiveScenarioPlan],
]);

export const demoCatalog = validateDemoCatalog(
  catalogArtifact as DemoCatalog,
  scenarioPlans
);

export function resolveDemoComposition(requestedId?: string | null): {
  entry: ReturnType<typeof resolveDemoEntry>;
  scenarioPlan: ScenarioPlan;
} {
  const entry = resolveDemoEntry(demoCatalog, requestedId);
  const scenarioPlan = scenarioPlans.get(entry.scenarioBlueprintId);
  if (!scenarioPlan) throw new Error(`Scenario '${entry.scenarioBlueprintId}' is not registered`);
  return { entry, scenarioPlan };
}