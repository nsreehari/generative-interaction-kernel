export interface ExploratoryNode {
  id: string;
  label?: string;
  unlocks?: string[];
}

export interface ExploratoryOption {
  id: string;
  label: string;
  unlocks: string[];
}

export interface ExploratoryChoice {
  id: string;
  label: string;
  requires?: string[];
  options: ExploratoryOption[];
}

export interface ExploratoryGraphDefinition {
  id: string;
  nodes: Record<string, ExploratoryNode>;
  choices: Record<string, ExploratoryChoice>;
}

export interface ExploratoryEdge {
  from: string;
  to: string;
  kind: "unlock" | "option";
  optionId?: string;
}

export interface ExploratoryGraphInspection {
  nodes: Array<ExploratoryNode & { kind: "node" | "choice" }>;
  edges: ExploratoryEdge[];
}

export interface ExploratoryFrontier {
  unlocked: string[];
  availableChoices: Array<{ id: string; label: string; options: ExploratoryOption[] }>;
}

export function inspectExploratoryGraph(def: ExploratoryGraphDefinition): ExploratoryGraphInspection {
  const nodes = [
    ...Object.values(def.nodes).map((node) => ({ ...node, kind: "node" as const })),
    ...Object.values(def.choices).map((choice) => ({ id: choice.id, label: choice.label, kind: "choice" as const })),
  ].sort((a, b) => a.id.localeCompare(b.id));

  const edges: ExploratoryEdge[] = [];
  for (const node of Object.values(def.nodes)) {
    for (const unlocked of node.unlocks ?? []) edges.push({ from: node.id, to: unlocked, kind: "unlock" });
  }
  for (const choice of Object.values(def.choices)) {
    for (const option of choice.options) {
      for (const unlocked of option.unlocks) {
        edges.push({ from: choice.id, to: unlocked, kind: "option", optionId: option.id });
      }
    }
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || (a.optionId ?? "").localeCompare(b.optionId ?? ""));
  return { nodes, edges };
}

export function evaluateExploratoryFrontier(
  def: ExploratoryGraphDefinition,
  completed: readonly string[],
  selections: Readonly<Record<string, string>> = {}
): ExploratoryFrontier {
  const unlocked = new Set<string>(completed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of [...unlocked]) {
      for (const next of def.nodes[nodeId]?.unlocks ?? []) {
        if (!unlocked.has(next)) {
          unlocked.add(next);
          changed = true;
        }
      }
    }
    for (const [choiceId, optionId] of Object.entries(selections)) {
      const choice = def.choices[choiceId];
      const option = choice?.options.find((entry) => entry.id === optionId);
      if (!choice || !option) continue;
      const requirements = choice.requires ?? [];
      if (!requirements.every((req) => unlocked.has(req))) continue;
      if (!unlocked.has(choiceId)) {
        unlocked.add(choiceId);
        changed = true;
      }
      for (const next of option.unlocks) {
        if (!unlocked.has(next)) {
          unlocked.add(next);
          changed = true;
        }
      }
    }
  }

  const availableChoices = Object.values(def.choices)
    .filter((choice) => (choice.requires ?? []).every((req) => unlocked.has(req)))
    .map((choice) => ({ id: choice.id, label: choice.label, options: choice.options }));

  availableChoices.sort((a, b) => a.id.localeCompare(b.id));
  return { unlocked: [...unlocked].sort(), availableChoices };
}