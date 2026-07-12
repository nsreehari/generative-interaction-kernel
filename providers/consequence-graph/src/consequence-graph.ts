export type ConsequenceNodeKind = "source" | "compute" | "effect" | "materialize";

export interface ConsequenceNode {
  id: string;
  kind: ConsequenceNodeKind;
  label?: string;
  dependsOn?: string[];
}

export interface ConsequenceGraphDefinition {
  id: string;
  nodes: Record<string, ConsequenceNode>;
}

export interface ConsequenceEdge {
  from: string;
  to: string;
}

export interface ConsequenceGraphInspection {
  nodes: ConsequenceNode[];
  edges: ConsequenceEdge[];
}

export interface BlockedNode {
  node: string;
  waitingOn: string[];
}

export interface ConsequenceActivation {
  triggered: string[];
  reachable: string[];
  parallelStages: string[][];
  blocked: BlockedNode[];
}

export function inspectConsequenceGraph(def: ConsequenceGraphDefinition): ConsequenceGraphInspection {
  const nodes = Object.values(def.nodes).sort((a, b) => a.id.localeCompare(b.id));
  const edges: ConsequenceEdge[] = [];
  for (const node of nodes) {
    for (const dep of node.dependsOn ?? []) edges.push({ from: dep, to: node.id });
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { nodes, edges };
}

export function activateConsequenceGraph(
  def: ConsequenceGraphDefinition,
  changed: readonly string[],
  completed: readonly string[] = []
): ConsequenceActivation {
  const inspection = inspectConsequenceGraph(def);
  const triggered = unique([...changed, ...completed]);
  const reachable = reachableFrom(inspection.edges, triggered).filter((id) => !triggered.includes(id));

  const available = new Set(triggered);
  const scheduled = new Set<string>();
  const parallelStages: string[][] = [];

  while (true) {
    const ready = reachable.filter((id) => {
      if (scheduled.has(id)) return false;
      const node = def.nodes[id];
      if (!node) return false;
      return (node.dependsOn ?? []).every((dep) => available.has(dep));
    });
    if (ready.length === 0) break;
    ready.sort((a, b) => a.localeCompare(b));
    parallelStages.push(ready);
    for (const id of ready) {
      scheduled.add(id);
      available.add(id);
    }
  }

  const blocked = reachable
    .filter((id) => !scheduled.has(id))
    .map((id) => {
      const deps = def.nodes[id]?.dependsOn ?? [];
      return { node: id, waitingOn: deps.filter((dep) => !available.has(dep)).sort() };
    })
    .sort((a, b) => a.node.localeCompare(b.node));

  return {
    triggered: triggered.sort(),
    reachable: reachable.sort(),
    parallelStages,
    blocked,
  };
}

function reachableFrom(edges: readonly ConsequenceEdge[], roots: readonly string[]): string[] {
  const down = new Map<string, string[]>();
  for (const edge of edges) {
    const list = down.get(edge.from) ?? [];
    list.push(edge.to);
    down.set(edge.from, list);
  }
  const seen = new Set<string>(roots);
  const out = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of down.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      out.add(next);
      queue.push(next);
    }
  }
  return [...out];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}