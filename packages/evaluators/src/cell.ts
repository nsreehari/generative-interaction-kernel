import {
  applyOp,
  getPath,
  jsonataExpressionAst,
  type BlueprintRunState,
  type CellSense,
  type GuardrailRule,
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
  acceptanceCriteria?: readonly GuardrailRule[];
};

export interface DppManifest extends Record<string, Json> {
  "manifest-version": string;
  participant: { "stable-id": string; "human-readable-name": string };
  "durable-charter": Record<string, Json>;
  "evolving-working-model": Record<string, Json>;
  "context-store": { query: string; ingest: string };
}

export interface CellDpp<TSource = EvaluatorCellSource> {
  manifest: DppManifest;
  context: {
    sources: readonly TSource[];
    senses?: readonly CellSense[];
  };
}

export function cellSources<T>(cell: {
  sources?: readonly T[];
  dpp?: { context: { sources?: readonly T[] } };
}): readonly T[] {
  return [...(cell.sources ?? []), ...(cell.dpp?.context.sources ?? [])];
}

export function cellSenses<T>(cell: {
  senses?: readonly T[];
  dpp?: { context: { senses?: readonly T[] } };
}): readonly T[] {
  return [...(cell.senses ?? []), ...(cell.dpp?.context.senses ?? [])];
}

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
  senses?: readonly CellSense[];
  dpp?: CellDpp;
  events?: Readonly<Record<string, unknown>>;
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
  senseBindings?: { sense: CellSense; input: Json }[];
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
    "fetched_sources",
    "dpp",
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
  if (cell.dpp !== undefined) {
    const dpp = cell.dpp;
    if (!dpp || typeof dpp !== "object" || !dpp.manifest || typeof dpp.manifest !== "object"
      || !dpp.context || !Array.isArray(dpp.context.sources) || dpp.context.sources.length < 2) {
      return {
        ok: false,
        errors: [...errors, { code: "invalid-dpp", detail: "DPP requires a full manifest and context sources for query and ingest", node: "dpp" }],
        warnings: [],
      };
    }
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
    const allowedRoots = new Set(["inputs", "fetched_sources", "systemInputs", "computed", ...(cell.dpp ? ["dpp"] : [])]);
    for (const detail of validateCellExpression(computation.expression, "full", declaredSystemInputs, allowedRoots)) {
      errors.push({ code: "invalid-compute-expression", detail, node });
    }
    if (computeAssignments.includes(computation.assign)) {
      errors.push({ code: "duplicate-compute-assignment", detail: `Compute assignment '${computation.assign}' is duplicated`, node });
    }
    computeAssignments.push(computation.assign);
  }

  const usageIds = new Set<string>();
  for (const usage of [...cellSources(cell), ...cellSenses(cell)]) {
    if (usageIds.has(usage.id)) errors.push({
      code: "duplicate-service-use",
      detail: `Source and Sense ids must be unique within a Cell: '${usage.id}'`,
      node: usage.id,
    });
    usageIds.add(usage.id);
  }
  for (const source of cellSources(cell)) {
    if (source.when) {
      const allowedRoots = new Set(["inputs", "fetched_sources", "systemInputs", "computed", ...(cell.dpp ? ["dpp"] : [])]);
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

  const senseIds = new Set<string>();
  for (const sense of cellSenses(cell)) {
    const node = `senses.${sense.id}`;
    if (senseIds.has(sense.id)) errors.push({ code: "duplicate-sense", detail: `Sense '${sense.id}' is duplicated`, node });
    senseIds.add(sense.id);
    for (const [name, expression] of [["when", sense.when], ["input", sense.input?.expr]] as const) {
      if (!expression) continue;
      for (const detail of validateCellExpression(expression, "safe", declaredSystemInputs, new Set(["inputs", "fetched_sources", "systemInputs", "computed", ...(cell.dpp ? ["dpp"] : [])]))) {
        errors.push({ code: "invalid-sense-expression", detail, node: `${node}.${name}` });
      }
    }
    if (sense.output) {
      const syntax = validateJsonataExpression(sense.output.expr, { mode: "safe" });
      if (!syntax.ok) errors.push({ code: "invalid-sense-expression", detail: syntax.error ?? "Invalid Sense output transform", node });
    }
    for (const event of Object.values(sense.on)) {
      if (!cell.events?.[event]) errors.push({ code: "undeclared-sense-event", detail: `Sense '${sense.id}' maps to undeclared event '${event}'`, node });
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
      const allowedRoots = new Set(["inputs", "fetched_sources", "systemInputs", "computed", ...(cell.dpp ? ["dpp"] : [])]);
      for (const detail of validateCellExpression(output.when, "safe", declaredSystemInputs, allowedRoots)) {
        errors.push({
          code: "invalid-output-expression",
          detail,
          node: `outputs.${output.token}.when`,
        });
      }
    }
    if (output.from === undefined) continue;
    const hasRuntimeOutputOwner = cell.blueprint || cell.behavior || (cell.potentialViews && Object.keys(cell.potentialViews).length > 0) || cellSources(cell).length > 0 || cellSenses(cell).length > 0;
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
    fetched_sources: structuredClone(input.settledSources),
    ...(input.materializedProgramCell.dpp
      ? { dpp: { manifest: structuredClone(input.materializedProgramCell.dpp.manifest) } }
      : {}),
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

  const effects = cellSources(input.materializedProgramCell)
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
  const senseBindings = cellSenses(input.materializedProgramCell).filter((sense) =>
    !sense.when || evalSyncJsonata(sense.when, computeContext) === true,
  ).map((sense) => ({
    sense: structuredClone(sense),
    input: sense.input ? evalSyncJsonata(sense.input.expr, computeContext) : structuredClone(computeContext),
  }));
  return { computed, operations, outputs, effects, ...(senseBindings ? { senseBindings } : {}) };
}
