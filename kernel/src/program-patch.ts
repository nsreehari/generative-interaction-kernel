import type {
  ExecutableProgramDefinition,
  GraphMutation,
  ProgramGraph,
  ProgramPatch,
} from "./types";

export function applyGraphMutations(
  graph: ProgramGraph,
  mutations: readonly GraphMutation[],
): ProgramGraph {
  const next = structuredClone(graph);
  for (const mutation of mutations) {
    switch (mutation.op) {
      case "addNode":
        if (next.nodes.some(({ id }) => id === mutation.node.id)) {
          throw new Error(`Duplicate graph node '${mutation.node.id}'`);
        }
        next.nodes.push(structuredClone(mutation.node));
        break;
      case "removeNode":
        next.nodes = next.nodes.filter(({ id }) => id !== mutation.nodeId);
        break;
      case "replaceNode": {
        const index = next.nodes.findIndex(({ id }) => id === mutation.nodeId);
        if (index === -1) throw new Error(`Unknown graph node '${mutation.nodeId}'`);
        next.nodes[index] = structuredClone(mutation.node);
        break;
      }
      case "addPort":
        next.ports = {
          ...(next.ports ?? {}),
          [mutation.token]: structuredClone(mutation.definition ?? {}),
        };
        break;
      case "removePort":
        if (next.ports) delete next.ports[mutation.token];
        break;
      case "updatePort":
        next.ports = {
          ...(next.ports ?? {}),
          [mutation.token]: structuredClone(mutation.definition),
        };
        break;
    }
  }
  return next;
}

function upsertById<T extends { id: string }>(items: readonly T[] | undefined, value: T): T[] {
  const next = structuredClone(items ?? []) as T[];
  const index = next.findIndex(({ id }) => id === value.id);
  if (index === -1) next.push(structuredClone(value));
  else next[index] = structuredClone(value);
  return next;
}

function removeById<T extends { id: string }>(items: readonly T[] | undefined, id: string): T[] | undefined {
  const remaining = structuredClone(items ?? []).filter((item) => item.id !== id) as T[];
  return remaining.length > 0 ? remaining : undefined;
}

/** Apply a patch to a clone, leaving the current program unchanged. */
export function applyProgramPatch(
  program: ExecutableProgramDefinition,
  patch: ProgramPatch,
): ExecutableProgramDefinition {
  const next = structuredClone(program) as ExecutableProgramDefinition;
  for (const operation of patch) {
    switch (operation.op) {
      case "mutateGraph":
        if (!next.graph) throw new Error("Cannot mutate a program without a graph");
        next.graph = applyGraphMutations(next.graph, operation.mutations);
        break;
      case "setGraph":
        next.graph = structuredClone(operation.graph);
        break;
      case "removeGraph":
        delete next.graph;
        break;
      case "setRoot":
        next.root = structuredClone(operation.root);
        break;
      case "removeRoot":
        delete next.root;
        break;
      case "upsertHandler":
        next.handlers = upsertById(next.handlers, operation.handler);
        break;
      case "removeHandler":
        next.handlers = removeById(next.handlers, operation.id);
        break;
      case "upsertReaction":
        next.reactions = upsertById(next.reactions, operation.reaction);
        break;
      case "removeReaction":
        next.reactions = removeById(next.reactions, operation.id);
        break;
      case "upsertMachine":
        next.machines = upsertById(next.machines, operation.machine);
        break;
      case "removeMachine":
        next.machines = removeById(next.machines, operation.id);
        break;
      case "upsertDerivation":
        next.derivations = upsertById(next.derivations, operation.derivation);
        break;
      case "removeDerivation":
        next.derivations = removeById(next.derivations, operation.id);
        break;
    }
  }
  return next;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffById<T extends { id: string }>(
  current: readonly T[] | undefined,
  target: readonly T[] | undefined,
  upsert: (value: T) => ProgramPatch[number],
  remove: (id: string) => ProgramPatch[number],
): ProgramPatch[number][] {
  const targetById = new Map((target ?? []).map((value) => [value.id, value]));
  const operations = (current ?? [])
    .filter(({ id }) => !targetById.has(id))
    .map(({ id }) => remove(id));
  for (const value of target ?? []) {
    const existing = (current ?? []).find(({ id }) => id === value.id);
    if (!existing || !same(existing, value)) operations.push(upsert(value));
  }
  return operations;
}

/** Produce typed operations that make one program structurally equal to another. */
export function diffProgram(
  current: ExecutableProgramDefinition,
  target: ExecutableProgramDefinition,
): ProgramPatch {
  const patch: ProgramPatch[number][] = [];
  if (!same(current.graph, target.graph)) {
    patch.push(target.graph ? { op: "setGraph", graph: structuredClone(target.graph) } : { op: "removeGraph" });
  }
  if (!same(current.root, target.root)) {
    patch.push(target.root ? { op: "setRoot", root: structuredClone(target.root) } : { op: "removeRoot" });
  }
  patch.push(
    ...diffById(current.handlers, target.handlers, (handler) => ({ op: "upsertHandler", handler }), (id) => ({ op: "removeHandler", id })),
    ...diffById(current.reactions, target.reactions, (reaction) => ({ op: "upsertReaction", reaction }), (id) => ({ op: "removeReaction", id })),
    ...diffById(current.machines, target.machines, (machine) => ({ op: "upsertMachine", machine }), (id) => ({ op: "removeMachine", id })),
    ...diffById(current.derivations, target.derivations, (derivation) => ({ op: "upsertDerivation", derivation }), (id) => ({ op: "removeDerivation", id })),
  );
  return patch;
}