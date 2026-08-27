import { runDeclarativeValidators } from "@gik-ai/evaluators";
import type { CellDefinition } from "./types";

export interface CellDiagnostic {
  code: "duplicate-cell-id" | "invalid-token-pattern" | "invalid-output-binding";
  detail: string;
  cellId?: string;
  tokenPattern?: string;
}

export interface CellComposition {
  externalInputs: readonly string[];
  providers: Readonly<Record<string, readonly string[]>>;
  diagnostics: readonly CellDiagnostic[];
}

export interface TokenPattern {
  source: string;
  parameters: readonly string[];
  match(token: string): Readonly<Record<string, string>> | undefined;
}

const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function defineCell(definition: CellDefinition): CellDefinition {
  const report = runDeclarativeValidators([{
    kind: "blueprint-cell",
    message: "Invalid Blueprint Cell",
  }], definition as never);
  if (!report.ok) {
    throw new Error(report.errors.map(({ detail }) => detail).join("; "));
  }
  return structuredClone(definition);
}

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
    if (!PARAMETER_NAME.test(parameter)) throw new Error(`Invalid parameter in token pattern '${source}'`);
    if (parameters.includes(parameter)) throw new Error(`Duplicate parameter '$${parameter}' in token pattern '${source}'`);
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
    if (ids.has(cell.id)) diagnostics.push({ code: "duplicate-cell-id", cellId: cell.id, detail: `Duplicate cell id '${cell.id}'` });
    ids.add(cell.id);
    for (const pattern of [...(cell.inputs ?? []).map(({ token }) => token), ...(cell.outputs ?? []).map(({ token }) => token)]) {
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
      if (!output.token || (output.from !== undefined && !output.from)) {
        diagnostics.push({
          code: "invalid-output-binding",
          cellId: cell.id,
          tokenPattern: output.token,
          detail: `Cell '${cell.id}' has an invalid output binding`,
        });
      }
      const providers = providerIds.get(output.token) ?? [];
      providers.push(cell.id);
      providerIds.set(output.token, providers);
    }
  }

  const providers: Record<string, readonly string[]> = {};
  for (const [pattern, cellIds] of [...providerIds].sort(([left], [right]) => left.localeCompare(right))) {
    providers[pattern] = cellIds;
  }
  const required = new Set(cells.flatMap((cell) => (cell.inputs ?? []).map(({ token }) => token)));
  const externalInputs = [...required].filter((pattern) => !providerIds.has(pattern)).sort((left, right) => left.localeCompare(right));
  return { externalInputs, providers, diagnostics };
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
  providers: Readonly<Record<string, readonly string[]>>;
  diagnostics: readonly CellDiagnostic[];
}

export function compileCellTopology(
  id: string,
  cellsById: Readonly<Record<string, CellDefinition>>,
): ExecutableCellTopology {
  const cells = Object.values(cellsById);
  const composition = analyzeCellComposition(cells);
  const edges = cells
    .flatMap((cell) => (cell.inputs ?? []).flatMap(({ token }): ExecutableCellEdge[] => {
      return (composition.providers[token] ?? []).map((providerCellId) => ({
        token,
        providerCellId,
        consumerCellId: cell.id,
      }));
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