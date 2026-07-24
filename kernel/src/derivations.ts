import { getPath, type ExpressionProvider, type StateModel } from "./providers";
import type { Json, PatchOp, StandingDerivation } from "./types";

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function jsonEqual(left: Json, right: Json): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cycleIn(derivations: readonly StandingDerivation[]): string[] | undefined {
  const derivationByTarget = new Map(derivations.map((derivation) => [derivation.target, derivation]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const visit = (target: string): string[] | undefined => {
    if (visiting.has(target)) return [...path.slice(path.indexOf(target)), target];
    if (visited.has(target)) return undefined;
    visiting.add(target);
    path.push(target);
    const derivation = derivationByTarget.get(target);
    for (const dependency of derivation?.dependencies ?? []) {
      for (const candidate of derivations) {
        if (!pathsOverlap(dependency, candidate.target)) continue;
        const cycle = visit(candidate.target);
        if (cycle) return cycle;
      }
    }
    path.pop();
    visiting.delete(target);
    visited.add(target);
    return undefined;
  };

  for (const target of derivationByTarget.keys()) {
    const cycle = visit(target);
    if (cycle) return cycle;
  }
  return undefined;
}

function orderedDerivations(derivations: readonly StandingDerivation[]): StandingDerivation[] {
  const ordered: StandingDerivation[] = [];
  const visited = new Set<string>();
  const visit = (derivation: StandingDerivation): void => {
    if (visited.has(derivation.id)) return;
    for (const dependency of derivation.dependencies) {
      for (const candidate of derivations) {
        if (pathsOverlap(dependency, candidate.target)) visit(candidate);
      }
    }
    visited.add(derivation.id);
    ordered.push(derivation);
  };
  for (const derivation of derivations) visit(derivation);
  return ordered;
}

export class DerivationScheduler {
  private readonly derivations: readonly StandingDerivation[];

  constructor(derivations: readonly StandingDerivation[] = []) {
    const ids = new Set<string>();
    const targets = new Set<string>();
    for (const derivation of derivations) {
      if (ids.has(derivation.id)) throw new Error(`Duplicate standing derivation id '${derivation.id}'`);
      if (targets.has(derivation.target)) throw new Error(`Duplicate standing derivation target '${derivation.target}'`);
      ids.add(derivation.id);
      targets.add(derivation.target);
    }
    const cycle = cycleIn(derivations);
    if (cycle) throw new Error(`Standing derivation cycle: ${cycle.join(" -> ")}`);
    this.derivations = orderedDerivations(derivations);
  }

  settleAll(store: StateModel, expression: ExpressionProvider): Promise<PatchOp[]> {
    return this.settle(
      this.derivations.flatMap((derivation) => derivation.dependencies),
      store,
      expression,
    );
  }

  async settle(
    changedPaths: readonly string[],
    store: StateModel,
    expression: ExpressionProvider,
  ): Promise<PatchOp[]> {
    const pending = [...changedPaths];
    const operations: PatchOp[] = [];
    const evaluated = new Set<string>();

    while (pending.length > 0) {
      const changed = pending.splice(0);
      for (const derivation of this.derivations) {
        if (evaluated.has(derivation.id)) continue;
        if (!derivation.dependencies.some((dependency) => changed.some((path) => pathsOverlap(dependency, path)))) {
          continue;
        }
        const value = await expression.eval(derivation.expression, store.snapshot());
        if (!jsonEqual(getPath(store.snapshot(), derivation.target), value)) {
          const operation: PatchOp = { op: "set", path: derivation.target, value };
          store.apply([operation]);
          operations.push(operation);
          pending.push(derivation.target);
        }
        evaluated.add(derivation.id);
      }
    }

    return operations;
  }
}