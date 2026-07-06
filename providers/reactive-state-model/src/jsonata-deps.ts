// JSONata dependency extractor for the `computed` construct (ADR-0033 amendment).
//
// A declarative `computed` cell says WHAT it equals (`total: "a + b"`); the dependency set — WHICH
// cells trigger a recompute — is inferred from the expression's parse tree rather than hand-listed.
// We walk the JSONata AST for `path` nodes and read their leading run of `name` steps as one dotted
// cell token (`form.first`), exactly the shape the reactive graph keys on. This mirrors the
// `denyUnsafe` AST walk in kernel/src/providers.ts (same cycle guard for the optimizer's back-refs).

// @ts-ignore -- vendored CommonJS bundle ships no type declarations.
import jsonataFactory from "../../../kernel/src/vendor/jsonata.cjs";

const jsonata = jsonataFactory as unknown as (expr: string) => { ast(): unknown };

/** The distinct state cells an expression reads, as dotted tokens (deduped, e.g. `["a", "form.x"]`). */
export function extractDeps(expr: string): string[] {
  const deps = new Set<string>();
  collect(jsonata(expr).ast(), deps, new WeakSet());
  return [...deps];
}

function collect(node: unknown, deps: Set<string>, seen: WeakSet<object>): void {
  if (node === null || typeof node !== "object") return;
  if (seen.has(node)) return; // the optimized AST carries ancestor back-refs — guard cycles.
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) collect(item, deps, seen);
    return;
  }
  const n = node as Record<string, unknown>;
  if (n.type === "path" && Array.isArray(n.steps)) {
    // A cell reference is the maximal leading run of `name` steps; stop at a predicate/function step.
    const parts: string[] = [];
    for (const raw of n.steps as unknown[]) {
      const step = raw as Record<string, unknown> | null;
      if (step && step.type === "name" && typeof step.value === "string") parts.push(step.value);
      else break;
    }
    if (parts.length > 0) deps.add(parts.join("."));
  }
  // Keep walking: nested paths can appear inside predicates, function args, binary operands, etc.
  for (const key of Object.keys(n)) collect(n[key], deps, seen);
}
