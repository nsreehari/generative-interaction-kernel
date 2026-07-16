import {
  compileScenarioBlueprint,
  type ScenarioBlueprintArtifact,
} from "../../shared/demo-runner";

import scenarioArtifact from "./scenario.json" with { type: "json" };

export const socExecutiveScenarioPlan = compileScenarioBlueprint(
  scenarioArtifact as ScenarioBlueprintArtifact
);