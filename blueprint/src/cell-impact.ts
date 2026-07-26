import type { ExecutableCellEdge, ExecutableCellTopology } from "./cells";

export interface CellImpactRequest {
  changedCells: readonly string[];
  completedCells?: readonly string[];
}

export interface CellImpactBlocker {
  cellId: string;
  waitingOn: readonly string[];
}

export interface CellImpactAnalysis {
  changedCells: readonly string[];
  affectedCells: readonly string[];
  stages: readonly (readonly string[])[];
  blockers: readonly CellImpactBlocker[];
}

export function analyzeCellImpact(
  topology: ExecutableCellTopology,
  request: CellImpactRequest,
): CellImpactAnalysis {
  const cellIds = new Set(topology.cells.map(({ id }) => id));
  const changedCells = uniqueSorted(request.changedCells);
  const completedCells = uniqueSorted(request.completedCells ?? []);
  for (const cellId of [...changedCells, ...completedCells]) {
    if (!cellIds.has(cellId)) throw new Error(`Unknown Cell '${cellId}' in topology '${topology.id}'`);
  }

  const affectedCells = reachableCells(topology.edges, [...changedCells, ...completedCells]);
  const dependencies = dependenciesByConsumer(topology.edges);
  const available = new Set([...changedCells, ...completedCells]);
  const scheduled = new Set<string>();
  const stages: string[][] = [];

  while (true) {
    const ready = affectedCells.filter((cellId) =>
      !scheduled.has(cellId)
      && [...(dependencies.get(cellId) ?? [])].every((dependency) => available.has(dependency))
    );
    if (ready.length === 0) break;
    stages.push(ready);
    for (const cellId of ready) {
      scheduled.add(cellId);
      available.add(cellId);
    }
  }

  const blockers = affectedCells
    .filter((cellId) => !scheduled.has(cellId))
    .map((cellId) => ({
      cellId,
      waitingOn: [...(dependencies.get(cellId) ?? [])]
        .filter((dependency) => !available.has(dependency))
        .sort(),
    }));

  return { changedCells, affectedCells, stages, blockers };
}

function dependenciesByConsumer(edges: readonly ExecutableCellEdge[]): Map<string, Set<string>> {
  const dependencies = new Map<string, Set<string>>();
  for (const edge of edges) {
    const current = dependencies.get(edge.consumerCellId) ?? new Set<string>();
    current.add(edge.providerCellId);
    dependencies.set(edge.consumerCellId, current);
  }
  return dependencies;
}

function reachableCells(edges: readonly ExecutableCellEdge[], roots: readonly string[]): string[] {
  const consumers = new Map<string, Set<string>>();
  for (const edge of edges) {
    const current = consumers.get(edge.providerCellId) ?? new Set<string>();
    current.add(edge.consumerCellId);
    consumers.set(edge.providerCellId, current);
  }
  const seen = new Set(roots);
  const affected = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const consumer of consumers.get(current) ?? []) {
      if (seen.has(consumer)) continue;
      seen.add(consumer);
      affected.add(consumer);
      queue.push(consumer);
    }
  }
  return [...affected].sort();
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}