export interface ExplorationNode {
  id: string;
  label?: string;
  unlocks?: readonly string[];
}

export interface ExplorationOption {
  id: string;
  label: string;
  unlocks: readonly string[];
}

export interface ExplorationChoice {
  id: string;
  label: string;
  requires?: readonly string[];
  options: readonly ExplorationOption[];
}

export interface ExplorationDefinition {
  id: string;
  nodes: Readonly<Record<string, ExplorationNode>>;
  choices: Readonly<Record<string, ExplorationChoice>>;
}

export interface ExplorationState {
  completed: readonly string[];
  selections?: Readonly<Record<string, string>>;
}

export interface ExplorationFrontier {
  unlocked: readonly string[];
  availableChoices: readonly ExplorationChoice[];
}

export interface ExplorationEdge {
  from: string;
  to: string;
  kind: "unlock" | "option";
  optionId?: string;
}

export interface ExplorationInspection {
  participants: readonly { id: string; label?: string; kind: "node" | "choice" }[];
  edges: readonly ExplorationEdge[];
}

export function defineExploration(definition: ExplorationDefinition): ExplorationDefinition {
  validateExploration(definition);
  return structuredClone(definition);
}

export function inspectExploration(definition: ExplorationDefinition): ExplorationInspection {
  validateExploration(definition);
  const participants = [
    ...Object.values(definition.nodes).map((node) => ({ ...node, kind: "node" as const })),
    ...Object.values(definition.choices).map((choice) => ({
      id: choice.id,
      ...(choice.label ? { label: choice.label } : {}),
      kind: "choice" as const,
    })),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const edges: ExplorationEdge[] = [];
  for (const node of Object.values(definition.nodes)) {
    for (const unlocked of node.unlocks ?? []) edges.push({ from: node.id, to: unlocked, kind: "unlock" });
  }
  for (const choice of Object.values(definition.choices)) {
    for (const option of choice.options) {
      for (const unlocked of option.unlocks) {
        edges.push({ from: choice.id, to: unlocked, kind: "option", optionId: option.id });
      }
    }
  }
  edges.sort((left, right) =>
    left.from.localeCompare(right.from)
    || left.to.localeCompare(right.to)
    || (left.optionId ?? "").localeCompare(right.optionId ?? "")
  );
  return { participants, edges };
}

export function analyzeExploration(
  definition: ExplorationDefinition,
  state: ExplorationState,
): ExplorationFrontier {
  validateExploration(definition);
  const participants = new Set([...Object.keys(definition.nodes), ...Object.keys(definition.choices)]);
  const completed = uniqueSorted(state.completed);
  for (const participant of completed) {
    if (!participants.has(participant)) throw new Error(`Unknown exploration participant '${participant}'`);
  }
  for (const [choiceId, optionId] of Object.entries(state.selections ?? {})) {
    const choice = definition.choices[choiceId];
    if (!choice) throw new Error(`Unknown exploration choice '${choiceId}'`);
    if (!choice.options.some(({ id }) => id === optionId)) {
      throw new Error(`Unknown option '${optionId}' for exploration choice '${choiceId}'`);
    }
  }

  const unlocked = new Set(completed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const participant of [...unlocked]) {
      for (const next of definition.nodes[participant]?.unlocks ?? []) {
        if (!unlocked.has(next)) {
          unlocked.add(next);
          changed = true;
        }
      }
    }
    for (const [choiceId, optionId] of Object.entries(state.selections ?? {})) {
      const choice = definition.choices[choiceId];
      if (!(choice.requires ?? []).every((requirement) => unlocked.has(requirement))) continue;
      const option = choice.options.find(({ id }) => id === optionId)!;
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

  for (const choiceId of Object.keys(state.selections ?? {})) {
    const choice = definition.choices[choiceId];
    if (!(choice.requires ?? []).every((requirement) => unlocked.has(requirement))) {
      throw new Error(`Exploration choice '${choiceId}' is not available`);
    }
  }

  const availableChoices = Object.values(definition.choices)
    .filter((choice) => (choice.requires ?? []).every((requirement) => unlocked.has(requirement)))
    .map((choice) => structuredClone(choice))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { unlocked: [...unlocked].sort(), availableChoices };
}

function validateExploration(definition: ExplorationDefinition): void {
  if (!definition.id) throw new Error("Exploration id must not be empty");
  const participants = new Set([...Object.keys(definition.nodes), ...Object.keys(definition.choices)]);
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (node.id !== nodeId) throw new Error(`Exploration node key '${nodeId}' does not match id '${node.id}'`);
    validateReferences(node.unlocks ?? [], participants, `node '${nodeId}'`);
  }
  for (const [choiceId, choice] of Object.entries(definition.choices)) {
    if (choice.id !== choiceId) throw new Error(`Exploration choice key '${choiceId}' does not match id '${choice.id}'`);
    validateReferences(choice.requires ?? [], participants, `choice '${choiceId}'`);
    const optionIds = new Set<string>();
    for (const option of choice.options) {
      if (!option.id) throw new Error(`Exploration choice '${choiceId}' has an option without an id`);
      if (optionIds.has(option.id)) throw new Error(`Duplicate option '${option.id}' in exploration choice '${choiceId}'`);
      optionIds.add(option.id);
      validateReferences(option.unlocks, participants, `option '${choiceId}.${option.id}'`);
    }
  }
}

function validateReferences(values: readonly string[], participants: ReadonlySet<string>, owner: string): void {
  for (const value of values) {
    if (!participants.has(value)) throw new Error(`Exploration ${owner} references unknown participant '${value}'`);
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}