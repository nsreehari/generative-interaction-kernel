import type { OrganismControlContract } from "../../../shared/control-runtime";

const commands = [
  "establishIntent",
  "addConstraint",
  "suggestExploration",
  "amendExploration",
  "replanExploration",
  "commitPartialFindings",
  "proposeDc01",
  "completeCorrelation",
  "proposeHostA",
  "reviseResponse",
  "calculateResponse",
  "recommendContainment",
  "authorizeContainment",
  "executeContainment",
  "$reset",
] as const;

export const socControlContract: OrganismControlContract = {
  blueprintId: "live-workspace-soc",
  commands: commands.map((command) => ({
    command,
    nodeId: "soc-workspace",
    event: command === "$reset" ? "reset" : command,
  })),
  humanGates: ["authorizeContainment"],
  observableOutcomes: ["soc.journal", "soc.actors", "soc.authorization", "soc.incident"],
};
