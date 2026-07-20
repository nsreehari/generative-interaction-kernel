import type { DocNode, Edges, Json, ServiceUse } from "../../kernel/src/index";

export interface CellOutputBinding {
  token: string;
  read: string;
  when?: string;
}

export interface CellEdges extends Omit<Edges, "children"> {
  children?: CellDefinition[];
}

/** An ordinary runtime node with standing dataflow metadata. */
export interface CellDefinition {
  capability: string;
  id: string;
  props?: Record<string, Json>;
  edges?: CellEdges;
  requires?: readonly string[];
  provides?: readonly (string | CellOutputBinding)[];
  service?: ServiceUse;
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

    for (const pattern of [...(cell.requires ?? []), ...providedTokens(cell)]) {
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

    for (const output of cell.provides ?? []) {
      const provided = typeof output === "string" ? output : output.token;
      if (typeof output !== "string" && (!output.token || !output.read || (output.when !== undefined && !output.when))) {
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

  const required = new Set(cells.flatMap((cell) => [...(cell.requires ?? [])]));
  const externalInputs = [...required]
    .filter((pattern) => !providerIds.has(pattern))
    .sort((left, right) => left.localeCompare(right));

  return { externalInputs, providers, diagnostics };
}

export function compileCellTopology(
  id: string,
  organism: CellDefinition | readonly CellDefinition[]
): ExecutableCellTopology {
  const roots: readonly CellDefinition[] = Array.isArray(organism)
    ? organism
    : [organism as CellDefinition];
  const cells = flattenCells(roots);
  const composition = analyzeCellComposition(cells);
  const edges = cells
    .flatMap((cell) => (cell.requires ?? []).flatMap((token): ExecutableCellEdge[] => {
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

/** Lower a cell tree by removing authoring-only dataflow metadata. */
export function composeCellDocument(organism: CellDefinition, topology: ExecutableCellTopology): { root: DocNode } {
  if (topology.diagnostics.length > 0) {
    throw new Error(`Invalid cell topology '${topology.id}': ${topology.diagnostics.map(({ detail }) => detail).join("; ")}`);
  }
  return { root: toDocNode(organism) };
}

function providedTokens(cell: CellDefinition): string[] {
  return (cell.provides ?? []).map((output) => typeof output === "string" ? output : output.token);
}

function flattenCells(roots: readonly CellDefinition[]): CellDefinition[] {
  const cells: CellDefinition[] = [];
  const visit = (cell: CellDefinition): void => {
    if ((cell.requires?.length ?? 0) > 0 || (cell.provides?.length ?? 0) > 0 || cell.service) cells.push(cell);
    for (const child of cell.edges?.children ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return cells;
}

function toDocNode(cell: CellDefinition): DocNode {
  const children = cell.edges?.children?.map(toDocNode);
  return {
    capability: cell.capability,
    id: cell.id,
    ...(cell.props ? { props: structuredClone(cell.props) } : {}),
    ...(cell.edges ? {
      edges: {
        ...structuredClone(cell.edges),
        ...(children ? { children } : {}),
      },
    } : {}),
  };
}
