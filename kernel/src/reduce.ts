// The pure reducer: (document, store snapshot, event) -> ops + traces.
// It never mutates the store; the kernel applies the returned ops.

import type {
  Action,
  DocNode,
  DocumentPayload,
  GupEvent,
  Json,
  Machine,
  OrchestratorEffect,
  PatchOp,
  TraceEvent,
} from "./types";
import type { ExpressionProvider, StateModel } from "./providers";

export interface ReduceResult {
  ops: PatchOp[];
  traces: TraceEvent[];
  effects: OrchestratorEffect[];
}

function truthy(v: Json): boolean {
  return v !== null && v !== undefined && v !== false;
}

function findNode(node: DocNode, id: string): DocNode | undefined {
  if (node.id === id) return node;
  for (const child of node.edges?.children ?? []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return undefined;
}

interface DispatchCtx {
  ops: PatchOp[];
  traces: TraceEvent[];
  effects: OrchestratorEffect[];
  expr: ExpressionProvider;
  predicateExpr: ExpressionProvider;
  data: Record<string, Json>;
  bindings: Record<string, unknown>;
  currentEvent: GupEvent;
  emitted: GupEvent[];
}

async function resolveValue(args: Record<string, Json> | undefined, c: DispatchCtx): Promise<Json> {
  if (!args) return null;
  if ("value" in args) return args.value ?? null;
  if (typeof args.from === "string") return c.expr.eval(args.from, c.data, c.bindings);
  return null;
}

// The six closed action families. assign/derive/emit mutate store/queue directly; invoke/route/
// confirm cross the Orchestrator/HITL seam (ADR-0009) — they push an OrchestratorEffect for the
// kernel to route after the reduction, rather than writing a store op here.
async function dispatchAction(a: Action, c: DispatchCtx): Promise<void> {
  switch (a.do) {
    case "assign": {
      if (!a.target) break;
      c.ops.push({ op: "set", path: a.target, value: await resolveValue(a.args, c) });
      c.traces.push({ event: "action", detail: { do: "assign", target: a.target } });
      break;
    }
    case "derive": {
      if (!a.target) break;
      const e = a.args?.expr;
      const value = typeof e === "string" ? await c.expr.eval(e, c.data, c.bindings) : null;
      c.ops.push({ op: "set", path: a.target, value });
      c.traces.push({ event: "action", detail: { do: "derive", target: a.target } });
      break;
    }
    case "emit": {
      if (a.event) {
        c.emitted.push({
          node: c.currentEvent.node,
          name: a.event,
          payload: (a.args?.payload as Record<string, Json> | undefined) ?? c.currentEvent.payload,
        });
      }
      c.traces.push({ event: "action", detail: { do: "emit", event: a.event } });
      break;
    }
    case "invoke": {
      c.effects.push({
        kind: "invoke",
        node: c.currentEvent.node,
        tool: typeof a.args?.tool === "string" ? a.args.tool : undefined,
        args: a.args ?? {},
        payload: c.currentEvent.payload,
      });
      c.traces.push({ event: "effect", detail: { do: "invoke", tool: a.args?.tool } });
      break;
    }
    case "route": {
      c.effects.push({
        kind: "route",
        node: c.currentEvent.node,
        to: a.args?.to ?? null,
        args: a.args ?? {},
        payload: c.currentEvent.payload,
      });
      c.traces.push({ event: "effect", detail: { do: "route", to: a.args?.to } });
      break;
    }
    case "confirm": {
      c.effects.push({
        kind: "confirm",
        node: c.currentEvent.node,
        args: a.args ?? {},
        payload: c.currentEvent.payload,
      });
      c.traces.push({ event: "effect", detail: { do: "confirm" } });
      break;
    }
    default: {
      c.traces.push({ event: "action", detail: { do: a.do, unknown: true } });
    }
  }
}

function reduceMachine(
  m: Machine,
  store: StateModel,
  event: GupEvent,
  c: DispatchCtx
): Promise<void> | void {
  const current = (store.get(`${m.context}.state`) as string | null) ?? m.initial;
  const state = m.states[current];
  const t = state?.on?.[event.name];
  if (t === undefined) return;

  const target = typeof t === "string" ? t : t.target;
  const guard = typeof t === "string" ? undefined : t.guard;

  return (async () => {
    if (guard && !truthy(await c.predicateExpr.eval(guard, c.data, c.bindings))) return;

    c.traces.push({
      event: "transition",
      detail: { machine: m.id, from: current, to: target, on: event.name },
    });
    c.ops.push({ op: "set", path: `${m.context}.state`, value: target });

    if (typeof t !== "string" && t.actions) {
      for (const a of t.actions) await dispatchAction(a, c);
    }
  })();
}

export async function reduce(
  doc: DocumentPayload,
  store: StateModel,
  event: GupEvent,
  expr: ExpressionProvider,
  // Predicate positions (action + machine transition guards) are agent-authored and
  // adversarial; the platform routes them through the safe subset. Falls back to the full
  // provider when a low-level caller does not distinguish the positions.
  predicateExpr: ExpressionProvider = expr
): Promise<ReduceResult> {
  const c: DispatchCtx = {
    ops: [],
    traces: [],
    effects: [],
    expr,
    predicateExpr,
    data: store.snapshot(),
    bindings: { event: event.payload ?? {} },
    currentEvent: event,
    emitted: [],
  };

  const queue: GupEvent[] = [event];
  while (queue.length > 0) {
    const current = queue.shift() as GupEvent;
    c.currentEvent = current;
    c.bindings = { event: current.payload ?? {} };

    const node = findNode(doc.root, current.node);
    const actions = node?.edges?.on?.[current.name] ?? [];
    for (const a of actions) {
      if (a.guard && !truthy(await predicateExpr.eval(a.guard, c.data, c.bindings))) continue;
      await dispatchAction(a, c);
    }

    for (const m of doc.machines ?? []) {
      await reduceMachine(m, store, current, c);
    }

    if (c.emitted.length > 0) {
      queue.push(...c.emitted);
      c.emitted.length = 0;
    }
  }

  return { ops: c.ops, traces: c.traces, effects: c.effects };
}

/** {@link ReduceResult} plus the events a run queued via `emit`, for the caller to settle. */
export interface ReactionRunResult extends ReduceResult {
  emitted: GupEvent[];
}

/**
 * Run an ordered list of closed-grammar actions owned by a node, against the current store snapshot.
 * This is the shared engine behind a reaction's `run` (ADR-0034): actions dispatch exactly as an event
 * handler's would (guards honored, effects collected), but the trigger is a state change the kernel
 * detected rather than an inbound event. `bindings` is merged into the expression scope (e.g. `$when`).
 */
export async function reduceActions(
  store: StateModel,
  ownerNodeId: string,
  actions: Action[],
  expr: ExpressionProvider,
  predicateExpr: ExpressionProvider,
  bindings: Record<string, unknown> = {}
): Promise<ReactionRunResult> {
  const c: DispatchCtx = {
    ops: [],
    traces: [],
    effects: [],
    expr,
    predicateExpr,
    data: store.snapshot(),
    bindings: { event: {}, ...bindings },
    currentEvent: { node: ownerNodeId, name: "__react__" },
    emitted: [],
  };

  for (const a of actions) {
    if (a.guard && !truthy(await predicateExpr.eval(a.guard, c.data, c.bindings))) continue;
    await dispatchAction(a, c);
  }

  return { ops: c.ops, traces: c.traces, effects: c.effects, emitted: c.emitted };
}
