import {
  applyOp,
  getPath,
  jsonataExpressionAst,
  type BlueprintRunState,
  type Json,
  type PatchOp,
  type ServiceTransform,
  type ServiceUse,
} from "../../kernel/src/index";

import { evalFullSyncJsonata, evalSyncJsonata, validateJsonataExpression } from "./evaluators";
import {
  isSystemInputToken,
  resolveSystemInputs,
  systemInputDefinitions,
  type SystemInputToken,
} from "./system-inputs";

export interface EvaluatorCellInput {
  token: string;
  as?: string;
  required?: boolean;
}

export type EvaluatorCellSource = ServiceUse & {
  id: string;
  when?: string;
  input?: ServiceTransform;
  output?: ServiceTransform;
};

export interface EvaluatorCellComputation {
  id: string;
  expression: string;
  assign: string;
  dependencies?: readonly string[];
}

export interface EvaluatorCellOutput {
  token: string;
  from: string;
  when?: string;
}

export interface EvaluatorCellViewBinding {
  from?: string;
  expression?: string;
}

export interface EvaluatorCellViewDecoration {
  bindings?: Readonly<Record<string, EvaluatorCellViewBinding>>;
  visibility?: string;
}

export interface EvaluatorCellView extends EvaluatorCellViewDecoration {
  before?: readonly EvaluatorCellViewDecoration[];
  after?: readonly EvaluatorCellViewDecoration[];
}

export interface EvaluatorCellDefinition {
  id: string;
  blueprint?: unknown;
  behavior?: unknown;
  potentialViews?: Readonly<Record<string, EvaluatorCellView>>;
  inputs?: readonly EvaluatorCellInput[];
  systemInputs?: readonly SystemInputToken[];
  sources?: readonly EvaluatorCellSource[];
  compute?: readonly EvaluatorCellComputation[];
  outputs?: readonly EvaluatorCellOutput[];
}

export interface EvaluateCellInput {
  materializedProgramCell: EvaluatorCellDefinition;
  inputs: Record<string, Json>;
  settledSources: Record<string, Json>;
  systemContext: {
    blueprintRunState: BlueprintRunState;
    cellId: string;
  };
}

export interface CellSourceEffect {
  kind: "source";
  cellId: string;
  source: EvaluatorCellSource;
  sourceInputs: Record<string, Json>;
}

export interface EvaluateCellResult {
  computed: Record<string, Json>;
  operations: PatchOp[];
  outputs: Record<string, Json>;
  effects: CellSourceEffect[];
}

export interface CellValidationIssue {
  code: string;
  detail: string;
  node?: string;
}

export interface CellValidationResult {
  ok: boolean;
  errors: CellValidationIssue[];
  warnings: CellValidationIssue[];
}

function expressionPaths(expression: string): string[][] {
  const paths: string[][] = [];
  const evaluatorNamespaces = new Set([
    "inputs",
    "sources",
    "systemInputs",
    "computed",
    "blueprintRunState",
    "cellRunState",
  ]);
  const visit = (value: unknown, parentType?: unknown, contextRelative = false): void => {
    if (!value || typeof value !== "object") return;
    const node = value as { type?: unknown; steps?: unknown[] } & Record<string, unknown>;
    if (node.type === "path" && Array.isArray(node.steps)) {
      const firstStep = node.steps[0] as { type?: unknown } | undefined;
      const names = node.steps.map((step) => {
        if (!step || typeof step !== "object") return undefined;
        const candidate = step as { type?: unknown; value?: unknown };
        return candidate.type === "name" && typeof candidate.value === "string" ? candidate.value : undefined;
      });
      const path = names.filter((name): name is string => name !== undefined);
      if (firstStep?.type === "name" && (!contextRelative || evaluatorNamespaces.has(path[0] ?? ""))) {
        paths.push(path);
      }
    } else if (!contextRelative && node.type === "name" && parentType !== "path" && typeof node.value === "string") {
      paths.push([node.value]);
    }
    for (const [key, child] of Object.entries(node)) {
      if (Array.isArray(child)) {
        child.forEach((item, index) => visit(
          item,
          node.type,
          contextRelative || (node.type === "path" && key === "steps" && index > 0),
        ));
      } else {
        visit(child, node.type, contextRelative);
      }
    }
  };
  visit(jsonataExpressionAst(expression));
  return paths;
}

function validateCellExpression(
  expression: string,
  mode: "full" | "safe",
  declaredSystemInputs: ReadonlySet<string>,
  allowedRoots?: ReadonlySet<string>,
): string[] {
  const syntax = validateJsonataExpression(expression, { mode });
  if (!syntax.ok) return [syntax.error ?? "Invalid expression"];
  const errors: string[] = [];
  for (const path of expressionPaths(expression)) {
    const [root, token, nested] = path;
    if (root === "blueprintRunState" || root === "cellRunState") {
      errors.push(`Internal namespace '${root}' is not available to Cell expressions`);
      continue;
    }
    if (root === "systemInputs") {
      if (!token || !isSystemInputToken(token)) {
        errors.push(`Unknown system input '${token ?? ""}'`);
      } else if (!declaredSystemInputs.has(token)) {
        errors.push(`System input '${token}' must be declared in systemInputs`);
      } else if (nested) {
        const schema = systemInputDefinitions[token].schema;
        const properties = schema.properties;
        if (!properties || typeof properties !== "object" || !(nested in properties)) {
          errors.push(`Unknown path '${path.join(".")}' for system input '${token}'`);
        }
      }
      continue;
    }
    if (allowedRoots && root && !allowedRoots.has(root)) {
      errors.push(`Unknown evaluator expression root '${root}'`);
    }
  }
  return [...new Set(errors)];
}

export function validateCell(value: unknown): CellValidationResult {
  const errors: CellValidationIssue[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: [{ code: "invalid-cell", detail: "Blueprint Cell must be an object" }], warnings: [] };
  }
  const cell = value as Partial<EvaluatorCellDefinition>;
  if (typeof cell.id !== "string" || cell.id.length === 0) {
    errors.push({ code: "invalid-cell-id", detail: "Blueprint Cell requires a non-empty id", node: "id" });
  }

  const declaredSystemInputs = new Set<string>();
  for (const token of cell.systemInputs ?? []) {
    if (!isSystemInputToken(token)) {
      errors.push({ code: "unknown-system-input", detail: `Unknown system input '${token}'`, node: "systemInputs" });
    } else if (declaredSystemInputs.has(token)) {
      errors.push({ code: "duplicate-system-input", detail: `System input '${token}' is duplicated`, node: "systemInputs" });
    } else {
      declaredSystemInputs.add(token);
    }
  }

  const computeAssignments: string[] = [];
  for (const computation of cell.compute ?? []) {
    const node = `compute.${computation.id}`;
    const allowedRoots = new Set(["inputs", "sources", "systemInputs", "computed"]);
    for (const detail of validateCellExpression(computation.expression, "full", declaredSystemInputs, allowedRoots)) {
      errors.push({ code: "invalid-compute-expression", detail, node });
    }
    if (computeAssignments.includes(computation.assign)) {
      errors.push({ code: "duplicate-compute-assignment", detail: `Compute assignment '${computation.assign}' is duplicated`, node });
    }
    computeAssignments.push(computation.assign);
  }

  for (const source of cell.sources ?? []) {
    if (source.when) {
      const allowedRoots = new Set(["inputs", "sources", "systemInputs", "computed"]);
      for (const detail of validateCellExpression(source.when, "safe", declaredSystemInputs, allowedRoots)) {
        errors.push({
          code: "invalid-source-expression",
          detail,
          node: `sources.${source.id}.when`,
        });
      }
    }
    for (const [name, transform] of [["input", source.input?.expr], ["output", source.output?.expr]] as const) {
      if (!transform) continue;
      const syntax = validateJsonataExpression(transform, { mode: "safe" });
      if (!syntax.ok) errors.push({
        code: "invalid-source-expression",
        detail: syntax.error ?? "Invalid source transform",
        node: `sources.${source.id}.${name}`,
      });
    }
  }

  const validateViewExpressions = (view: EvaluatorCellViewDecoration, node: string) => {
    if (view.visibility) {
      for (const detail of validateCellExpression(view.visibility, "full", declaredSystemInputs)) {
        errors.push({ code: "invalid-view-expression", detail, node: `${node}.visibility` });
      }
    }
    for (const [binding, definition] of Object.entries(view.bindings ?? {})) {
      if (!definition.expression) continue;
      for (const detail of validateCellExpression(definition.expression, "full", declaredSystemInputs)) {
        errors.push({ code: "invalid-view-expression", detail, node: `${node}.bindings.${binding}` });
      }
    }
  };
  if (cell.potentialViews) {
    for (const [viewName, view] of Object.entries(cell.potentialViews)) {
      validateViewExpressions(view, `potentialViews.${viewName}`);
      for (const [index, decoration] of (view.before ?? []).entries()) {
        validateViewExpressions(decoration, `potentialViews.${viewName}.before.${index}`);
      }
      for (const [index, decoration] of (view.after ?? []).entries()) {
        validateViewExpressions(decoration, `potentialViews.${viewName}.after.${index}`);
      }
    }
  }

  for (const output of cell.outputs ?? []) {
    if (output.when) {
      const allowedRoots = new Set(["inputs", "sources", "systemInputs", "computed"]);
      for (const detail of validateCellExpression(output.when, "safe", declaredSystemInputs, allowedRoots)) {
        errors.push({
          code: "invalid-output-expression",
          detail,
          node: `outputs.${output.token}.when`,
        });
      }
    }
    if (output.from === undefined) continue;
    const hasRuntimeOutputOwner = cell.blueprint || cell.behavior || (cell.potentialViews && Object.keys(cell.potentialViews).length > 0) || (cell.sources?.length ?? 0) > 0;
    const hasInputOwner = (cell.inputs ?? []).some((input) => {
      const path = `inputs.${input.as ?? input.token}`;
      return output.from === path || output.from.startsWith(`${path}.`);
    });
    if (!hasRuntimeOutputOwner && !hasInputOwner && !computeAssignments.some((assignment) => {
      const path = `computed.${assignment}`;
      return output.from === path || output.from.startsWith(`${path}.`);
    })) {
      errors.push({
        code: "unknown-output-compute",
        detail: `Output '${output.token}' references a value not produced by compute`,
        node: `outputs.${output.token}`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings: [] };
}

export function evaluateCell(input: EvaluateCellInput): EvaluateCellResult {
  const validation = validateCell(input.materializedProgramCell);
  if (!validation.ok) {
    throw new Error(validation.errors.map(({ detail }) => detail).join("; "));
  }

  const sourceContext = {
    inputs: structuredClone(input.inputs),
    sources: structuredClone(input.settledSources),
    systemInputs: resolveSystemInputs(
      input.materializedProgramCell.systemInputs ?? [],
      input.systemContext,
    ),
    computed: {} as Record<string, Json>,
  };
  const computed: Record<string, Json> = {};
  const operations: PatchOp[] = [];
  const computeContext = structuredClone(sourceContext) as unknown as Record<string, Json>;
  for (const computation of input.materializedProgramCell.compute ?? []) {
    const value = evalFullSyncJsonata(computation.expression, computeContext);
    const operation: PatchOp = {
      op: "set",
      path: computation.assign,
      value,
    };
    applyOp(computeContext, { ...operation, path: `computed.${computation.assign}` });
    applyOp(computed, operation);
    operations.push(operation);
  }

  const effects = (input.materializedProgramCell.sources ?? [])
    .filter((source) => !source.when || evalSyncJsonata(source.when, computeContext) === true)
    .map((source): CellSourceEffect => ({
      kind: "source",
      cellId: input.materializedProgramCell.id,
      source: structuredClone(source),
      sourceInputs: structuredClone(computeContext),
    }));

  const outputs: Record<string, Json> = {};
  for (const output of input.materializedProgramCell.outputs ?? []) {
    if (output.when && evalSyncJsonata(output.when, computeContext) !== true) continue;
    outputs[output.token] = getPath(computeContext, output.from);
  }
  return { computed, operations, outputs, effects };
}
