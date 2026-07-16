import {
  resolveDemoEntry,
  validateDemoComposition,
  validateDemoCatalog,
  type DemoCatalog,
  type OrganismDemoContract,
  type ScenarioPlan,
} from "../shared/demo-runner";

import catalogArtifact from "./catalog.json" with { type: "json" };
import { socExecutiveScenarioPlan } from "./live-workspace-soc-executive/compile";
import { t3ScenarioPlan } from "./live-workspace-soc-t3/compile";

const scenarioPlans = new Map<string, ScenarioPlan>([
  [t3ScenarioPlan.id, t3ScenarioPlan],
  [socExecutiveScenarioPlan.id, socExecutiveScenarioPlan],
]);

export const socDemoContract: OrganismDemoContract = {
  blueprintId: "live-workspace-soc",
  commands: [
    "establishIntent", "addConstraint", "suggestExploration", "amendExploration",
    "replanExploration", "commitPartialFindings", "proposeDc01", "completeCorrelation",
    "proposeHostA", "reviseResponse", "calculateResponse", "recommendContainment",
    "executeContainment",
  ],
  actors: ["human-morgan", "human-priya", "agent-correlation", "agent-response"],
  presentationContexts: [
    "full-substrate", "war-room", "priya-mobile", "priya-laptop", "morgan-pager",
    "morgan-workstation", "correlation-agent", "response-agent",
  ],
  focusKinds: ["actor", "cell", "token", "entity", "record", "region", "action"],
  timelineSources: ["scenario", "organism"],
};

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
  validateDemoComposition(entry, scenarioPlan, socDemoContract);
  return { entry, scenarioPlan };
}