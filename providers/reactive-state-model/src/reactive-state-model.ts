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
// v1 scope: cells are top-level state keys (flat). Nested/dotted namespaced paths are a follow-up.

import { getPath, applyOp, type StateModel, type Json, type PatchOp } from "../../../kernel/src/index";
import { createReactiveGraph, type ReactiveGraph } from "../../vendor/continuous-event-graph/reactive.js";
import type { GraphConfig, TaskConfig } from "../../vendor/continuous-event-graph/types.js";

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

export class ReactiveStateModel implements StateModel {
  private readonly graph: ReactiveGraph;
  private readonly evaluate: Evaluate;
  private readonly onChange?: () => void;
  private readonly edgeByTarget = new Map<string, DeriveEdge>();
  private readonly baseCells = new Set<string>();
  private readonly derivedCells = new Set<string>();

  private baseValues: Record<string, Json> = {};
  private derivedValues: Record<string, Json> = {};
  private lastSig = "";

  constructor(opts: ReactiveStateModelOptions) {
    this.evaluate = opts.evaluate;
    this.onChange = opts.onChange;
    this.baseValues = { ...(opts.initial ?? {}) };

    for (const edge of opts.edges) {
      this.derivedCells.add(edge.target);
      this.edgeByTarget.set(edge.target, edge);
    }
    // Every dependency that is not itself derived is a base (source) cell; so is any seed key.
    for (const edge of opts.edges) {
      for (const dep of edge.deps) {
        if (!this.derivedCells.has(dep)) this.baseCells.add(dep);
      }
    }
    for (const key of Object.keys(this.baseValues)) {
      if (!this.derivedCells.has(key)) this.baseCells.add(key);
    }

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
        // Base cell: emit its current value so downstream requires resolve.
        base: async ({ nodeId, callbackToken }) => {
          this.graph.resolveCallback(callbackToken, { [nodeId]: this.baseValues[nodeId] ?? null });
          return "task-initiated";
        },
        // Derived cell: compute from upstream `state`, publish, and cascade downstream.
        derive: async ({ nodeId, state, callbackToken }) => {
          const edge = this.edgeByTarget.get(nodeId)!;
          const scope: Record<string, unknown> = {};
          for (const dep of edge.deps) {
            const upstream = state[dep];
            scope[dep] = upstream && dep in upstream ? upstream[dep] : this.cellValue(dep);
          }
          const value = await this.evaluate(edge.expr, scope);
          this.derivedValues[nodeId] = value;
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
    return { ...this.baseValues, ...this.derivedValues };
  }

  get(path: string): Json {
    return getPath(this.snapshot(), path);
  }

  /**
   * Write base cells and push the change into the dependency graph. Derived cells settle
   * asynchronously — await `settle()` (or observe `onChange`) before reading them back.
   */
  apply(ops: PatchOp[]): void {
    const touched: string[] = [];
    for (const op of ops) {
      const cell = op.path;
      if (this.derivedCells.has(cell)) continue; // derived cells are engine-owned, never written directly
      applyOp(this.baseValues, op);
      this.baseCells.add(cell);
      touched.push(cell);
    }
    if (touched.length > 0) this.graph.retriggerAll(touched);
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

  private cellValue(cell: string): Json {
    return this.derivedCells.has(cell) ? this.derivedValues[cell] ?? null : this.baseValues[cell] ?? null;
  }
}
