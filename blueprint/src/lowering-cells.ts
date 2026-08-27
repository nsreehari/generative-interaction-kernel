import type { Json } from "@gik-ai/kernel";
import type { CellDefinition } from "./types";

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

export interface LoweringCellGraphIssue {
  cellId: string;
  message: string;
}

/**
 * ADR-0045 Phase 4: cross-reference a declared Lowering Cell meta-graph (authoring-time
 * metadata — kind, ports, policy) against the actual runtime `cells` of a hand-authored
 * compiler Blueprint. The two graphs stay distinct by design (the meta-graph declares intent;
 * the Blueprint's `cells` map is what actually executes on the Kernel) — this only checks that
 * they have not drifted apart: every declared Lowering Cell has a matching runtime Cell, and
 * every declared port token appears on that Cell's actual `inputs`/`outputs`.
 */
export function validateLoweringCellGraph(
  cells: readonly LoweringCellDefinition[],
  runtimeCells: Readonly<Record<string, CellDefinition>>,
): readonly LoweringCellGraphIssue[] {
  const issues: LoweringCellGraphIssue[] = [];
  for (const cell of cells) {
    const runtimeCell = runtimeCells[cell.id];
    if (!runtimeCell) {
      issues.push({ cellId: cell.id, message: `declared Lowering Cell '${cell.id}' has no matching runtime Cell` });
      continue;
    }
    const runtimeInputTokens = new Set((runtimeCell.inputs ?? []).map((port) => port.token));
    const runtimeOutputTokens = new Set((runtimeCell.outputs ?? []).map((port) => port.token));
    for (const port of cell.inputs ?? []) {
      if (!runtimeInputTokens.has(port.token)) {
        issues.push({ cellId: cell.id, message: `declared input token '${port.token}' is not among the runtime Cell's inputs` });
      }
    }
    for (const port of cell.outputs ?? []) {
      if (!runtimeOutputTokens.has(port.token)) {
        issues.push({ cellId: cell.id, message: `declared output token '${port.token}' is not among the runtime Cell's outputs` });
      }
    }
  }
  return issues;
}