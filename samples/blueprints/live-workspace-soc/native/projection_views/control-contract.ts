export interface ControlCommandDescriptor {
  command: string;
  nodeId: string;
  event: string;
}

export interface OrganismControlContract {
  blueprintId: string;
  commands: ControlCommandDescriptor[];
  humanGates: string[];
  observableOutcomes: string[];
}

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
] as const;

export const socControlContract: OrganismControlContract = {
  blueprintId: "live-workspace-soc",
  commands: commands.map((command) => ({
    command,
    nodeId: "soc-workspace",
    event: command,
  })),
  humanGates: ["authorizeContainment"],
  observableOutcomes: ["soc.journal", "soc.actors", "soc.authorization", "soc.incident"],
};
