import type { Json } from "@gik/kernel";

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

export interface LoweringCellDefinition {
  id: string;
  kind: LoweringCellKind;
  fromTier?: string;
  toTier?: string;
  inputs?: readonly ArtifactPort[];
  outputs?: readonly ArtifactPort[];
  strategy?: { id: string; version?: string; executor?: string };
  policy?: { deterministic?: boolean; requiresValidation?: boolean; requiresApproval?: boolean };
  metadata?: Record<string, Json>;
}

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
    if (!port.token || !port.artifactType) throw new Error(`Lowering Cell '${cellId}' has an invalid ${direction} artifact port`);
    if (tokens.has(port.token)) throw new Error(`Lowering Cell '${cellId}' has duplicate ${direction} token '${port.token}'`);
    tokens.add(port.token);
  }
}