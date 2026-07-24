import type { Json } from "../../kernel/src/index";

export type LoweringCellKind =
  | "transform"
  | "select-strategy"
  | "synthesize-strategy"
  | "validate"
  | "approve"
  | "emit-blueprint";

export interface ArtifactPort {
  token: string;
  artifactType: string;
  required?: boolean;
  schema?: Record<string, Json>;
}

export interface LoweringStrategyRef {
  id: string;
  version?: string;
  executor?: string;
}

export interface LoweringCellPolicy {
  deterministic?: boolean;
  requiresValidation?: boolean;
  requiresApproval?: boolean;
}

/** One artifact-processing participant in the compiler meta-graph above Kernel execution. */
export interface LoweringCellDefinition {
  id: string;
  kind: LoweringCellKind;
  fromLayer?: string;
  toLayer?: string;
  inputs?: readonly ArtifactPort[];
  outputs?: readonly ArtifactPort[];
  strategy?: LoweringStrategyRef;
  policy?: LoweringCellPolicy;
  metadata?: Record<string, Json>;
}

/** Clone and minimally validate an authored lowering-cell definition. */
export function defineLoweringCell(definition: LoweringCellDefinition): LoweringCellDefinition {
  if (!definition.id) throw new Error("Lowering Cell id must not be empty");
  validatePorts(definition.id, "input", definition.inputs ?? []);
  validatePorts(definition.id, "output", definition.outputs ?? []);
  if (definition.kind === "emit-blueprint" && definition.policy?.requiresValidation !== true) {
    throw new Error(`Lowering Cell '${definition.id}' must require validation before emitting a Blueprint`);
  }
  return structuredClone(definition);
}

function validatePorts(cellId: string, direction: "input" | "output", ports: readonly ArtifactPort[]): void {
  const tokens = new Set<string>();
  for (const port of ports) {
    if (!port.token || !port.artifactType) {
      throw new Error(`Lowering Cell '${cellId}' has an invalid ${direction} artifact port`);
    }
    if (tokens.has(port.token)) {
      throw new Error(`Lowering Cell '${cellId}' has duplicate ${direction} token '${port.token}'`);
    }
    tokens.add(port.token);
  }
}