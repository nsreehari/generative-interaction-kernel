import type {
  Action,
  DocNode,
  ExecutableProgramDefinition,
  Json,
  Reaction,
  RuntimeHandler,
  RuntimeReaction,
  ServiceUse,
} from "../../kernel/src/index";
import { HOSTED_BLUEPRINT_CAPABILITY } from "./hosted-blueprint";
import type { BlueprintArtifact } from "./types";

export interface CellInput {
  token: string;
  as?: string;
  required?: boolean;
  cardinality?: "one" | "many";
  schema?: Record<string, Json>;
}

export interface CellOutput {
  token: string;
  from?: string;
  when?: string;
  schema?: Record<string, Json>;
}

export type CellSource = ServiceUse & {
  id: string;
  when?: string;
};

export interface CellComputation {
  id: string;
  expression: string;
  assign: string;
  dependencies: readonly string[];
  when?: string;
}

export interface CellBehavior {
  events?: Record<string, Action[]>;
  reactions?: Reaction[];
}

export type CellViewBinding =
  | { from: string; expression?: never }
  | { from?: never; expression: string };

export interface CellView {
  capability?: string;
  props?: Record<string, Json>;
  bindings?: Record<string, CellViewBinding>;
  visibility?: string;
}

export type CellBlueprint =
  | { $ref: string; inline?: never }
  | { inline: BlueprintArtifact; $ref?: never };

/** An independently addressable reactive participant in a Blueprint. */
export interface CellDefinition {
  id: string;
  kind?: string;
  metadata?: Record<string, Json>;
  state?: {
    initial?: Record<string, Json>;
    schema?: Record<string, Json>;
    persistence?: "ephemeral" | "checkpointed" | "durable";
  };
  inputs?: readonly CellInput[];
  sources?: readonly CellSource[];
  compute?: readonly CellComputation[];
  outputs?: readonly CellOutput[];
  behavior?: CellBehavior;
  view?: CellView;
  /** A recursively composed Blueprint whose live instance is represented by this Cell. */
  blueprint?: CellBlueprint;
}

export interface CellPlacement {
  cell: string;
  parent?: string;
  slot?: string;
  order?: number;
}

export interface CellProjectionDefinition {
  cells: Readonly<Record<string, CellDefinition>>;
  projections?: {
    presentation?: {
    roots: readonly string[];
    placements?: readonly CellPlacement[];
    };
  };
}

export interface ExecutableCellEdge {
  token: string;
  providerCellId: string;
  consumerCellId: string;
}

export interface ExecutableCellTopology {
  id: string;
  cells: readonly CellDefinition[];
  edges: readonly ExecutableCellEdge[];
  externalInputs: readonly string[];
  providers: Readonly<Record<string, string>>;
  diagnostics: readonly CellDiagnostic[];
}

export interface TokenPattern {
  source: string;
  parameters: readonly string[];
  match(token: string): Readonly<Record<string, string>> | undefined;
}

export interface CellDiagnostic {
  code:
    | "duplicate-cell-id"
    | "invalid-token-pattern"
    | "ambiguous-provider"
    | "invalid-output-binding";
  detail: string;
  cellId?: string;
  tokenPattern?: string;
}

export interface CellComposition {
  externalInputs: readonly string[];
  providers: Readonly<Record<string, string>>;
  diagnostics: readonly CellDiagnostic[];
}

const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function tokenPattern(source: string): TokenPattern {
  if (!source) throw new Error("Token pattern must not be empty");

  const parameters: string[] = [];
  const parts: Array<{ literal?: string; parameter?: string }> = [];
  let literalStart = 0;
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] !== "$") {
      cursor += 1;
      continue;
    }

    if (cursor > literalStart) parts.push({ literal: source.slice(literalStart, cursor) });
    let end = cursor + 1;
    while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end += 1;
    const parameter = source.slice(cursor + 1, end);
    if (!PARAMETER_NAME.test(parameter)) {
      throw new Error(`Invalid parameter in token pattern '${source}'`);
    }
    if (parameters.includes(parameter)) {
      throw new Error(`Duplicate parameter '$${parameter}' in token pattern '${source}'`);
    }
    parameters.push(parameter);
    parts.push({ parameter });
    cursor = end;
    literalStart = cursor;
  }

  if (literalStart < source.length) parts.push({ literal: source.slice(literalStart) });

  return {
    source,
    parameters,
    match(token) {
      let tokenCursor = 0;
      const bindings: Record<string, string> = {};

      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (part.literal !== undefined) {
          if (!token.startsWith(part.literal, tokenCursor)) return undefined;
          tokenCursor += part.literal.length;
          continue;
        }

        const nextLiteral = parts.slice(index + 1).find((candidate) => candidate.literal !== undefined)?.literal;
        const end = nextLiteral === undefined ? token.length : token.indexOf(nextLiteral, tokenCursor);
        if (end === -1 || end === tokenCursor) return undefined;
        bindings[part.parameter!] = token.slice(tokenCursor, end);
        tokenCursor = end;
      }

      return tokenCursor === token.length ? bindings : undefined;
    },
  };
}

export function analyzeCellComposition(cells: readonly CellDefinition[]): CellComposition {
  const diagnostics: CellDiagnostic[] = [];
  const ids = new Set<string>();
  const providerIds = new Map<string, string[]>();

  for (const cell of cells) {
    if (ids.has(cell.id)) {
      diagnostics.push({
        code: "duplicate-cell-id",
        cellId: cell.id,
        detail: `Duplicate cell id '${cell.id}'`,
      });
    }
    ids.add(cell.id);

    for (const pattern of [...(cell.inputs ?? []).map(({ token }) => token), ...providedTokens(cell)]) {
      try {
        tokenPattern(pattern);
      } catch (error) {
        diagnostics.push({
          code: "invalid-token-pattern",
          cellId: cell.id,
          tokenPattern: pattern,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const output of cell.outputs ?? []) {
      const provided = output.token;
      if (!output.token || (output.from !== undefined && !output.from) || (output.when !== undefined && !output.when)) {
        diagnostics.push({
          code: "invalid-output-binding",
          cellId: cell.id,
          tokenPattern: output.token,
          detail: `Cell '${cell.id}' has an invalid output binding`,
        });
      }
      const providers = providerIds.get(provided) ?? [];
      providers.push(cell.id);
      providerIds.set(provided, providers);
    }
  }

  const providers: Record<string, string> = {};
  for (const [pattern, cellIds] of [...providerIds].sort(([left], [right]) => left.localeCompare(right))) {
    if (cellIds.length === 1) {
      providers[pattern] = cellIds[0];
      continue;
    }
    diagnostics.push({
      code: "ambiguous-provider",
      tokenPattern: pattern,
      detail: `Token pattern '${pattern}' is provided by multiple cells: ${cellIds.join(", ")}`,
    });
  }

  const required = new Set(cells.flatMap((cell) => (cell.inputs ?? []).map(({ token }) => token)));
  const externalInputs = [...required]
    .filter((pattern) => !providerIds.has(pattern))
    .sort((left, right) => left.localeCompare(right));

  return { externalInputs, providers, diagnostics };
}

export function compileCellTopology(
  id: string,
  definition: CellProjectionDefinition,
): ExecutableCellTopology {
  const cells = Object.values(definition.cells);
  const composition = analyzeCellComposition(cells);
  const edges = cells
    .flatMap((cell) => (cell.inputs ?? []).flatMap(({ token }): ExecutableCellEdge[] => {
      const providerCellId = composition.providers[token];
      return providerCellId ? [{ token, providerCellId, consumerCellId: cell.id }] : [];
    }))
    .sort((left, right) =>
      left.providerCellId.localeCompare(right.providerCellId)
      || left.consumerCellId.localeCompare(right.consumerCellId)
      || left.token.localeCompare(right.token));

  return {
    id,
    cells,
    edges,
    externalInputs: composition.externalInputs,
    providers: composition.providers,
    diagnostics: composition.diagnostics,
  };
}

/** Compile a Blueprint's optional presentation into the executable Kernel program. */
export function composeCellProgram(
  definition: CellProjectionDefinition,
  topology: ExecutableCellTopology,
): ExecutableProgramDefinition {
  if (topology.diagnostics.length > 0) {
    throw new Error(`Invalid cell topology '${topology.id}': ${topology.diagnostics.map(({ detail }) => detail).join("; ")}`);
  }
  const presentation = definition.projections?.presentation;
  const derivations = topology.cells.flatMap((cell) => (cell.compute ?? []).map((computation) => ({
    id: `${cell.id}-${computation.id}`,
    target: computation.assign,
    expression: computation.expression,
    dependencies: [...computation.dependencies],
  })));
  if (!presentation) {
    const hostedCell = topology.cells.find((cell) => cell.blueprint);
    if (hostedCell) {
      throw new Error(`Headless Blueprint '${topology.id}' cannot host child Blueprint Cell '${hostedCell.id}'`);
    }
    const handlers: RuntimeHandler[] = topology.cells.flatMap((cell) => {
      const events = cellEvents(cell);
      return Object.keys(events).length > 0 ? [{ id: cell.id, on: events }] : [];
    });
    const reactions: RuntimeReaction[] = topology.cells.flatMap((cell) => (cell.behavior?.reactions ?? []).map(
      (reaction, index) => ({ id: `${cell.id}-reaction-${index}`, ...structuredClone(reaction) }),
    ));
    return {
      ...(handlers.length > 0 ? { handlers } : {}),
      ...(reactions.length > 0 ? { reactions } : {}),
      ...(derivations.length > 0 ? { derivations } : {}),
    };
  }
  const rootIds = presentation?.roots ?? [];
  if (rootIds.length !== 1) {
    throw new Error(`Blueprint '${topology.id}' requires exactly one presentation root`);
  }
  const byParent = new Map<string, CellPlacement[]>();
  for (const placement of presentation?.placements ?? []) {
    if (!placement.parent) continue;
    const siblings = byParent.get(placement.parent) ?? [];
    siblings.push(placement);
    byParent.set(placement.parent, siblings);
  }
  const compile = (cellId: string, ancestors: readonly string[]): DocNode => {
    if (ancestors.includes(cellId)) {
      throw new Error(`Blueprint '${topology.id}' has a presentation cycle at '${cellId}'`);
    }
    const cell = definition.cells[cellId];
    if (!cell) throw new Error(`Blueprint '${topology.id}' references unknown cell '${cellId}'`);
    if (!cell.blueprint && !cell.view?.capability) throw new Error(`Presentation cell '${cellId}' has no view capability`);
    const children = (byParent.get(cellId) ?? [])
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map(({ cell: childId }) => compile(childId, [...ancestors, cellId]));
    return toProgramNode(cell, children);
  };
  return {
    root: compile(rootIds[0], []),
    ...(derivations.length > 0 ? { derivations } : {}),
  };
}

function providedTokens(cell: CellDefinition): string[] {
  return (cell.outputs ?? []).map(({ token }) => token);
}

function toProgramNode(cell: CellDefinition, children: readonly DocNode[]): DocNode {
  const source = cell.sources?.[0];
  const directBindings = Object.entries(cell.view?.bindings ?? {})
    .filter(([, binding]) => binding.from !== undefined)
    .map(([prop, binding]) => [prop, binding.from!] as const);
  const expressionBindings = Object.entries(cell.view?.bindings ?? {})
    .filter(([, binding]) => binding.expression !== undefined)
    .map(([prop, binding]) => [prop, binding.expression!] as const);
  const viewProps = source
    ? {
        ...structuredClone(cell.view?.props ?? {}),
        externalSource: { refreshEvent: "refresh" },
      }
    : cell.view?.props
      ? structuredClone(cell.view.props)
      : undefined;
  const props = cell.blueprint
    ? { ...viewProps, hostedBlueprint: JSON.parse(JSON.stringify(cell.blueprint)) as Json }
    : viewProps;
  const events = cellEvents(cell);
  const edges = {
    ...(directBindings.length > 0 ? { read: Object.fromEntries(directBindings) } : {}),
    ...(expressionBindings.length > 0 ? { readExpr: Object.fromEntries(expressionBindings) } : {}),
    ...(cell.view?.visibility ? { gate: cell.view.visibility } : {}),
    ...(Object.keys(events).length > 0 ? { on: events } : {}),
    ...(cell.behavior?.reactions?.length ? { react: structuredClone(cell.behavior.reactions) } : {}),
    ...(children.length > 0 ? { children: [...children] } : {}),
  };
  return {
    capability: cell.blueprint ? HOSTED_BLUEPRINT_CAPABILITY : cell.view!.capability!,
    id: cell.id,
    ...(props ? { props } : {}),
    ...(Object.keys(edges).length > 0 ? { edges } : {}),
  };
}

function cellEvents(cell: CellDefinition): Record<string, Action[]> {
  const events = structuredClone(cell.behavior?.events ?? {});
  const source = cell.sources?.[0];
  if (source) {
    events.refresh = [{
      do: "invoke",
      args: { tool: source.operation },
      ...(source.when ? { guard: source.when } : {}),
    }];
  }
  return events;
}
