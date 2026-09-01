// The pure reducer: (document, store snapshot, event) -> ops + traces.
// It never mutates the store; the kernel applies the returned ops.

import type {
  Action,
  CompletedWithinRun,
  DocNode,
  ExecutableProgramDefinition,
  GIKEvent,
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
  completedWithinRun: CompletedWithinRun[];
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
  completedWithinRun: CompletedWithinRun[];
  expr: ExpressionProvider;
  predicateExpr: ExpressionProvider;
  data: Record<string, Json>;
  bindings: Record<string, unknown>;
  currentEvent: GIKEvent;
  emitted: GIKEvent[];
}

async function resolveValue(args: Extract<Action, { do: "assign" }>["args"], c: DispatchCtx): Promise<Json> {
  if ("value" in args) return args.value ?? null;
  return c.expr.eval(args.from, c.data, c.bindings);
}

async function resolveRequestData(
  action: Extract<Action, { do: "request" }>,
  c: DispatchCtx,
): Promise<Record<string, Json>> {
  if (!action.args) return action.data;
  const dynamicData = await c.expr.eval(action.args.from, c.data, c.bindings);
  if (!dynamicData || typeof dynamicData !== "object" || Array.isArray(dynamicData)) {
    throw new Error("Request action data expression must evaluate to an object");
  }
  return { ...(dynamicData as Record<string, Json>), ...action.data };
}

function traceDetail(c: DispatchCtx, detail: Record<string, unknown>): Record<string, unknown> {
  return c.currentEvent.actorId ? { ...detail, actorId: c.currentEvent.actorId } : detail;
}

// assign/emit settle inside reduction; invoke/route/request cross the host boundary.
// kernel to route after the reduction, rather than writing a store op here.
async function dispatchAction(a: Action, c: DispatchCtx): Promise<void> {
  switch (a.do) {
    case "assign": {
      if (!a.target) break;
      const value = await resolveValue(a.args, c);
      c.ops.push({ op: "set", path: a.target, value });
      c.completedWithinRun.push({ kind: "assign", node: c.currentEvent.node, target: a.target, value });
      c.traces.push({ event: "action", detail: traceDetail(c, { do: "assign", target: a.target }) });
      break;
    }
    case "emit": {
      const event: GIKEvent = {
        node: c.currentEvent.node,
        name: a.event,
        ...(a.data !== undefined || c.currentEvent.payload !== undefined
          ? { payload: a.data ?? c.currentEvent.payload }
          : {}),
        ...(c.currentEvent.actorId !== undefined ? { actorId: c.currentEvent.actorId } : {}),
      };
      c.emitted.push(event);
      c.completedWithinRun.push({ kind: "emit", node: c.currentEvent.node, event });
      c.traces.push({ event: "action", detail: traceDetail(c, { do: "emit", event: a.event }) });
      break;
    }
    case "invoke": {
      c.effects.push({
        kind: "invoke",
        node: c.currentEvent.node,
        actorId: c.currentEvent.actorId,
        control: structuredClone(a.control),
        data: structuredClone(a.data ?? c.currentEvent.payload ?? {}),
      });
      c.traces.push({ event: "effect", detail: traceDetail(c, { do: "invoke", tool: a.control.tool }) });
      break;
    }
    case "route": {
      c.effects.push({
        kind: "route",
        node: c.currentEvent.node,
        actorId: c.currentEvent.actorId,
        control: structuredClone(a.control),
        data: structuredClone(a.data ?? c.currentEvent.payload ?? {}),
      });
      c.traces.push({ event: "effect", detail: traceDetail(c, { do: "route", to: a.control.to }) });
      break;
    }
    case "request": {
      const data = await resolveRequestData(a, c);
      c.effects.push({
        kind: "request",
        node: c.currentEvent.node,
        actorId: c.currentEvent.actorId,
        control: structuredClone(a.control),
        data: structuredClone(data),
      });
      c.traces.push({ event: "effect", detail: traceDetail(c, { do: "request", kind: a.control.kind }) });
      break;
    }
  }
}

function reduceMachine(
  m: Machine,
  store: StateModel,
  event: GIKEvent,
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
      detail: traceDetail(c, { machine: m.id, from: current, to: target, on: event.name }),
    });
    c.ops.push({ op: "set", path: `${m.context}.state`, value: target });

    if (typeof t !== "string" && t.actions) {
      for (const a of t.actions) await dispatchAction(a, c);
    }
  })();
}

export async function reduce(
  doc: ExecutableProgramDefinition,
  store: StateModel,
  event: GIKEvent,
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
    completedWithinRun: [],
    expr,
    predicateExpr,
    data: store.snapshot(),
    bindings: { event: event.payload ?? {} },
    currentEvent: event,
    emitted: [],
  };

  const queue: GIKEvent[] = [event];
  while (queue.length > 0) {
    const current = queue.shift() as GIKEvent;
    c.currentEvent = current;
    c.bindings = { event: current.payload ?? {} };

    const node = doc.root ? findNode(doc.root, current.node) : undefined;
    const handler = doc.handlers?.find(({ id }) => id === current.node);
    const actions = [
      ...(handler?.on[current.name] ?? []),
      ...(node?.edges?.on?.[current.name] ?? []),
    ];
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

  return { ops: c.ops, traces: c.traces, effects: c.effects, completedWithinRun: c.completedWithinRun };
}

/** {@link ReduceResult} plus the events an action list queued via `emit`, for the caller to settle. */
export interface ActionRunResult extends ReduceResult {
  emitted: GIKEvent[];
}

/**
 * Run an ordered list of closed-grammar actions owned by a node, against the current store snapshot.
 * Graph action nodes use the same guard, effect, and event semantics as event handlers.
 * `bindings` is merged into the expression scope.
 */
export async function reduceActions(
  store: StateModel,
  ownerNodeId: string,
  actions: Action[],
  expr: ExpressionProvider,
  predicateExpr: ExpressionProvider,
  bindings: Record<string, unknown> = {}
): Promise<ActionRunResult> {
  const c: DispatchCtx = {
    ops: [],
    traces: [],
    effects: [],
    completedWithinRun: [],
    expr,
    predicateExpr,
    data: store.snapshot(),
    bindings: { event: {}, ...bindings },
    currentEvent: { node: ownerNodeId, name: "__react__" },
    emitted: [],
  };

  for (const a of actions) {
    if (a.guard && !truthy(await predicateExpr.eval(a.guard, c.data, c.bindings))) {
      if (a.do === "invoke" && a.control.sourceId) {
        c.traces.push({
          event: "effect",
          node: ownerNodeId,
          detail: {
            kind: "invoke",
            tool: a.control.tool,
            phase: "outcome",
            outcome: "skipped",
            sourceId: a.control.sourceId,
            ...(a.control.sourceCellId ? { sourceCellId: a.control.sourceCellId } : {}),
            reason: "when-false",
          },
        });
      }
      continue;
    }
    await dispatchAction(a, c);
  }

  return {
    ops: c.ops,
    traces: c.traces,
    effects: c.effects,
    completedWithinRun: c.completedWithinRun,
    emitted: c.emitted,
  };
}
