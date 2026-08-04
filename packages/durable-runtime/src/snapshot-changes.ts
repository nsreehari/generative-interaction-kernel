import jsonPatch, { type Operation } from "fast-json-patch";

import type {
  RuntimeSnapshot,
  RuntimeSnapshotChanges,
  RuntimeSnapshotPatch,
  RuntimeSnapshotPatchOperation,
} from "./contracts";

type SnapshotDocument<TState, TSpec> = { state: TState; spec: TSpec };
const { applyPatch, compare } = jsonPatch;

export function createRuntimeSnapshotPatch<TState, TSpec>(
  previous: RuntimeSnapshot<TState, TSpec>,
  next: RuntimeSnapshot<TState, TSpec>,
): RuntimeSnapshotPatch {
  const operations = compare(
    { state: previous.state, spec: previous.spec },
    { state: next.state, spec: next.spec },
  ).map((operation): RuntimeSnapshotPatchOperation => {
    if (operation.op === "remove") return operation;
    if (operation.op === "add" || operation.op === "replace") return operation;
    throw new Error(`Unsupported generated snapshot patch operation: ${operation.op}.`);
  });
  return {
    baseRevision: previous.revision,
    revision: next.revision,
    operations,
  };
}

export function applyRuntimeSnapshotChanges<TState, TSpec>(
  current: RuntimeSnapshot<TState, TSpec>,
  changes: RuntimeSnapshotChanges<TState, TSpec>,
): RuntimeSnapshot<TState, TSpec> {
  if (changes.kind === "reset") return changes.snapshot;
  if (changes.kind === "unchanged") {
    if (changes.revision !== current.revision) {
      throw new Error(`Snapshot revision ${current.revision} does not match ${changes.revision}.`);
    }
    return current;
  }
  if (changes.baseRevision !== current.revision) {
    throw new Error(`Snapshot patch starts at ${changes.baseRevision}, not ${current.revision}.`);
  }
  const document = applyPatch(
    { state: current.state, spec: current.spec },
    changes.operations as Operation[],
    true,
    false,
  ).newDocument as SnapshotDocument<TState, TSpec>;
  return { ...document, revision: changes.revision };
}