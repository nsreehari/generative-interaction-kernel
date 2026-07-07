// ReactiveStateModel — a genui `StateModel` backed by the vendored reactive dependency graph.
//
// See docs/decisions/ADR-0033. The kernel's reference StateModel is a passive bag, so derived
// state is only "live" because the interpreter re-evaluates every `derive` edge on every pass
// (whole-document, pull-based). This adapter instead wraps the proven push-based dependency graph
// (providers/vendor/continuous-event-graph/reactive.ts, dependency-mode) so that when one base
// cell changes, ONLY genuine downstream dependents recompute — incremental derived state.
//
// The engine's cascade is push/async (handlers initiate; resolveCallback completes across
// microtasks), so derived cells are EVENTUALLY consistent: read them via snapshot()/get() after
// `settle()`, or observe `onChange` to re-interpret when the graph quiesces. This is the defining
// property recorded in ADR-0033 — correct for a live reactive UI, not "derived within one tick".
//
// Cells may be dotted/namespaced paths (`app.count`, `form.email`). A derive `expr` is evaluated
// against the FULL snapshot — exactly as the kernel's `derive` reducer does (`expr.eval(e, c.data)`)
// — so JSONata navigates dotted paths natively; `deps` drive only which cells retrigger a recompute.
// Matching between a mutated op `path` and a derive's `deps`/`target` is PREFIX-AWARE: writing a
// parent object (`a`) retriggers a dependent on a child (`a.x`) and vice versa. Cyclic derivations
// (`a -> b -> a`) are rejected at construction (see `detectCycle`).

import { getPath, applyOp, type StateModel, type Json, type PatchOp } from "../../../kernel/src/index";
import { createReactiveGraph, type ReactiveGraph } from "../../vendor/continuous-event-graph/reactive.js";
import type { GraphConfig, TaskConfig } from "../../vendor/continuous-event-graph/types.js";
import { extractDeps } from "./jsonata-deps.js";

/** One derived cell: `target = expr(deps...)`. `expr` is evaluated against a scope of the deps. */
export interface DeriveEdge {
  target: string;
  expr: string;
  deps: string[];
}

/** Evaluate a derive expression against a scope object. Sync or async (e.g. the kernel's JSONata provider). */
export type Evaluate = (expr: string, scope: Record<string, unknown>) => Json | Promise<Json>;

export interface ReactiveStateModelOptions {
  edges: DeriveEdge[];
  evaluate: Evaluate;
  /** Seed values for base cells. */
  initial?: Record<string, Json>;
  /** Notified after each derived-cell settle — the kernel bridge re-interprets on this. */
  onChange?: () => void;
}

/**
 * A declarative `computed` map (`cell → expression`) plus the runtime knobs. The dependency set of
 * each cell is INFERRED from its expression (see `ReactiveStateModel.fromComputed`), so an author
 * declares only *what* a cell equals, never *when* to recompute it.
 */
export interface ComputedOptions {
  evaluate: Evaluate;
  initial?: Record<string, Json>;
  onChange?: () => void;
  /** Override the dependency extractor (defaults to the JSONata AST walk). */
  extractDeps?: (expr: string) => string[];
}

export class ReactiveStateModel implements StateModel {
  private readonly graph: ReactiveGraph;
  private readonly evaluate: Evaluate;
  private readonly onChange?: () => void;
  private readonly edgeByTarget = new Map<string, DeriveEdge>();
  private readonly baseCells = new Set<string>();
  private readonly derivedCells = new Set<string>();
  /** Base-cell tokens that own an actual graph task (frozen at construction). */
  private readonly graphBaseTokens: ReadonlySet<string>;

  private baseValues: Record<string, Json> = {};
  private derivedValues: Record<string, Json> = {};
  private lastSig = "";

  /**
   * Build a reactive store from a declarative `computed` map (`{ target: expr }`) — the ADR-0033
   * amendment's construct for standing derivations. Each cell's dependencies are inferred from its
   * expression's parse tree (JSONata `path` nodes); a self-reference is dropped. This is the surface
   * humans and AI agents author against: declare the relationship, not the recompute timing.
   */
  static fromComputed(computed: Record<string, string>, opts: ComputedOptions): ReactiveStateModel {
    const extract = opts.extractDeps ?? extractDeps;
    const edges: DeriveEdge[] = Object.entries(computed).map(([target, expr]) => ({
      target,
      expr,
      deps: extract(expr).filter((d) => d !== target),
    }));
    return new ReactiveStateModel({ edges, evaluate: opts.evaluate, initial: opts.initial, onChange: opts.onChange });
  }

  constructor(opts: ReactiveStateModelOptions) {
    this.evaluate = opts.evaluate;
    this.onChange = opts.onChange;

    // Guard against cyclic derivations (`a -> b -> a`): in dependency-mode the graph would otherwise
    // recompute forever. Fail fast at construction with the offending cycle path.
    const cycle = detectCycle(opts.edges);
    if (cycle) {
      throw new Error(`ReactiveStateModel: cyclic computed dependency detected: ${cycle.join(" -> ")}`);
    }

    for (const edge of opts.edges) {
      this.derivedCells.add(edge.target);
      this.edgeByTarget.set(edge.target, edge);
    }
    // Every dependency that is not itself derived is a base (source) cell.
    for (const edge of opts.edges) {
      for (const dep of edge.deps) {
        if (!this.derivedCells.has(dep)) this.baseCells.add(dep);
      }
    }
    // Seed base cells. `initial` keys are cell TOKENS (may be dotted, e.g. "form.email"); nest them
    // via applyOp so they compose with dotted derive targets and JSONata can navigate the snapshot.
    for (const [token, value] of Object.entries(opts.initial ?? {})) {
      if (this.derivedCells.has(token)) continue;
      applyOp(this.baseValues, { op: "set", path: token, value });
      this.baseCells.add(token);
    }
    // Freeze the set of base-cell tokens that will own a graph task; `apply` retriggers against these.
    this.graphBaseTokens = new Set(this.baseCells);

    const tasks: Record<string, TaskConfig> = {};
    for (const cell of this.baseCells) {
      tasks[cell] = { provides: [cell], taskHandlers: ["base"], refreshStrategy: "data-changed" };
    }
    for (const edge of opts.edges) {
      tasks[edge.target] = {
        requires: edge.deps,
        provides: [edge.target],
        taskHandlers: ["derive"],
        refreshStrategy: "data-changed",
      };
    }

    // dependency-mode: run ALL eligible tasks (deterministic forward dataflow) — not the
    // eligibility/exploratory selection mode. completion:'manual' keeps the graph long-lived.
    const config: GraphConfig = {
      settings: { completion: "manual", execution_mode: "dependency-mode", refreshStrategy: "data-changed" },
      tasks,
    };

    this.graph = createReactiveGraph(config, {
      handlers: {
        // Base cell: publish its token so downstream `requires` resolve. The derive handler reads the
        // full snapshot, so this value is only a liveness signal — dotted-safe via getPath.
        base: async ({ nodeId, callbackToken }) => {
          this.graph.resolveCallback(callbackToken, { [nodeId]: getPath(this.baseValues, nodeId) });
          return "task-initiated";
        },
        // Derived cell: evaluate against the full snapshot (kernel-reducer semantics — dotted paths
        // navigate natively), publish into derivedValues, and cascade downstream.
        derive: async ({ nodeId, callbackToken }) => {
          const edge = this.edgeByTarget.get(nodeId)!;
          const value = await this.evaluate(edge.expr, this.snapshot());
          applyOp(this.derivedValues, { op: "set", path: nodeId, value });
          this.onChange?.();
          this.graph.resolveCallback(callbackToken, { [nodeId]: value });
          return "task-initiated";
        },
      },
    });

    // Kick the initial cascade so derived cells compute from the seed.
    if (this.baseCells.size > 0) this.graph.retriggerAll([...this.baseCells]);
  }

  // ---- StateModel -------------------------------------------------------

  snapshot(): Record<string, Json> {
    // Derived cells win over base cells; deep-merge so dotted targets (`form.valid`) and dotted base
    // cells (`form.email`) compose into one object JSONata can navigate uniformly.
    return deepMerge(this.baseValues, this.derivedValues);
  }

  get(path: string): Json {
    return getPath(this.snapshot(), path);
  }

  /**
   * Write base cells and push the change into the dependency graph. Derived cells settle
   * asynchronously — await `settle()` (or observe `onChange`) before reading them back.
   */
  apply(ops: PatchOp[]): void {
    const touched = new Set<string>();
    for (const op of ops) {
      const cell = op.path;
      if (this.derivedCells.has(cell)) continue; // derived cells are engine-owned, never written directly
      applyOp(this.baseValues, op);
      this.baseCells.add(cell);
      for (const tok of this.relatedBaseTokens(cell)) touched.add(tok);
    }
    if (touched.size > 0) this.graph.retriggerAll([...touched]);
  }

  /**
   * Map a mutated op path to the graph base tokens it should retrigger. Beyond exact equality this is
   * PREFIX-AWARE: writing a parent object (`a`) retriggers dependents on a child cell (`a.x`), and
   * writing a child (`a.x`) retriggers dependents on the parent (`a`) — because a derive reads the
   * full snapshot, either write changes the value it observes.
   */
  private relatedBaseTokens(cell: string): string[] {
    const out: string[] = [];
    for (const tok of this.graphBaseTokens) {
      if (tok === cell || isPrefixPath(tok, cell) || isPrefixPath(cell, tok)) out.push(tok);
    }
    // No graph task owns a related token (e.g. a directly-read-only cell): retrigger the raw token,
    // which no-ops harmlessly if the graph has no matching task.
    if (out.length === 0) out.push(cell);
    return out;
  }

  // ---- Reactive extensions (beyond the passive StateModel contract) -----

  /** Resolve once the dependency cascade has fully quiesced (all derive waves settled). */
  async settle(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await this.graph.waitForHandlers();
      const sig = JSON.stringify(this.derivedValues);
      if (sig === this.lastSig) return;
      this.lastSig = sig;
    }
  }

  async dispose(): Promise<void> {
    await this.graph.dispose({ wait: true });
  }
}

/** Deep-merge two namespaced snapshots (plain objects); `over` wins on scalar/array conflicts. */
function deepMerge(base: Record<string, Json>, over: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = { ...base };
  for (const [key, val] of Object.entries(over)) {
    const prev = out[key];
    if (isPlainObject(prev) && isPlainObject(val)) {
      out[key] = deepMerge(prev, val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function isPlainObject(v: Json | undefined): v is Record<string, Json> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** True when `parent` is a strict dotted-path ancestor of `child` (`a` of `a.x`, not of `ax`). */
function isPrefixPath(parent: string, child: string): boolean {
  return child.startsWith(parent + ".");
}

/**
 * Detect a cycle among derived (`computed`) cells. Two derived cells are adjacent when one's `dep`
 * is prefix-related to the other's `target` (either direction), matching the prefix-aware retrigger
 * semantics. Returns the cycle path (`["a", "b", "a"]`) or null when the derivation graph is acyclic.
 */
function detectCycle(edges: DeriveEdge[]): string[] | null {
  const derived = new Set(edges.map((e) => e.target));
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    const outs = adj.get(e.target) ?? new Set<string>();
    for (const dep of e.deps) {
      for (const u of derived) {
        if (u === dep || isPrefixPath(u, dep) || isPrefixPath(dep, u)) outs.add(u);
      }
    }
    adj.set(e.target, outs);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  const visit = (n: string): string[] | null => {
    color.set(n, GRAY);
    stack.push(n);
    for (const m of adj.get(n) ?? []) {
      const c = color.get(m) ?? WHITE;
      if (c === GRAY) return stack.slice(stack.indexOf(m)).concat(m);
      if (c === WHITE) {
        const found = visit(m);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(n, BLACK);
    return null;
  };

  for (const t of derived) {
    if ((color.get(t) ?? WHITE) === WHITE) {
      const found = visit(t);
      if (found) return found;
    }
  }
  return null;
}
