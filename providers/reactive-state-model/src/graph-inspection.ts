import { extractDeps } from "./jsonata-deps";

export interface ComputedGraphNode {
  id: string;
  kind: "source" | "derived";
  expr?: string;
}

export interface ComputedGraphEdge {
  from: string;
  to: string;
}

export interface ComputedGraph {
  nodes: ComputedGraphNode[];
  edges: ComputedGraphEdge[];
}

export function inspectComputedGraph(
  computed: Record<string, string>,
  inferDeps: (expr: string) => string[] = extractDeps
): ComputedGraph {
  const derived = new Set(Object.keys(computed));
  const sources = new Set<string>();
  const edges: ComputedGraphEdge[] = [];

  for (const [target, expr] of Object.entries(computed)) {
    for (const dep of inferDeps(expr).filter((dep) => dep !== target)) {
      edges.push({ from: dep, to: target });
      if (!derived.has(dep)) sources.add(dep);
    }
  }

  const nodes: ComputedGraphNode[] = [
    ...[...sources].sort().map((id) => ({ id, kind: "source" as const })),
    ...Object.entries(computed)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, expr]) => ({ id, kind: "derived" as const, expr })),
  ];

  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { nodes, edges };
}

function mermaidId(token: string): string {
  return token.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function computedGraphToMermaid(
  computed: Record<string, string>,
  opts: { title?: string; direction?: "TD" | "TB" | "LR" | "RL" | "BT" } = {}
): string {
  const { title = "Computed Dependency Graph", direction = "TD" } = opts;
  const graph = inspectComputedGraph(computed);
  const lines = [`%% ${title}`, `graph ${direction}`];

  if (graph.nodes.length === 0) {
    lines.push("  empty[No computed cells]");
    return lines.join("\n");
  }

  for (const node of graph.nodes) {
    const id = mermaidId(node.id);
    if (node.kind === "source") lines.push(`  ${id}([${node.id}])`);
    else lines.push(`  ${id}[${node.id}]`);
  }

  for (const edge of graph.edges) {
    lines.push(`  ${mermaidId(edge.from)} --> ${mermaidId(edge.to)}`);
  }

  return lines.join("\n");
}