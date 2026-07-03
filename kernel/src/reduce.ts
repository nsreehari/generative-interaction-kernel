// The pure reducer: (document, store snapshot, event) -> ops + traces.
// It never mutates the store; the kernel applies the returned ops.

import type {
  Action,
  DocNode,
  DocumentPayload,
  GupEvent,
  Json,
  Machine,
  PatchOp,
  TraceEvent,
} from "./types";
import type { ExpressionProvider, StateModel } from "./providers";

export interface ReduceResult {
  ops: PatchOp[];
  traces: TraceEvent[];
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
  expr: ExpressionProvider;
  data: Record<string, Json>;
  bindings: Record<string, unknown>;
  emitted: GupEvent[];
  currentEvent: GupEvent;
}

async function resolveValue(args: Record<string, Json> | undefined, c: DispatchCtx): Promise<Json> {
  if (!args) return null;
  if ("value" in args) return args.value ?? null;
  if (typeof args.from === "string") return c.expr.eval(args.from, c.data, c.bindings);
  return null;
}

// The six closed action families. invoke/navigate/confirm are deferred to Phase 3
// (they cross the Orchestrator/HITL seam) and produce a trace but no store op yet.
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
    case "invoke":
    case "navigate":
    case "confirm": {
      c.traces.push({ event: "action", detail: { do: a.do, deferred: true } });
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
    if (guard && !truthy(await c.expr.eval(guard, c.data, c.bindings))) return;

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
  expr: ExpressionProvider
): Promise<ReduceResult> {
  const c: DispatchCtx = {
    ops: [],
    traces: [],
    expr,
    data: store.snapshot(),
    bindings: { event: event.payload ?? {} },
    emitted: [],
    currentEvent: event,
  };

  const queue: GupEvent[] = [event];
  while (queue.length > 0) {
    const current = queue.shift() as GupEvent;
    c.currentEvent = current;
    c.bindings = { event: current.payload ?? {} };

    const node = findNode(doc.root, current.node);
    const actions = node?.edges?.on?.[current.name] ?? [];
    for (const a of actions) {
      if (a.guard && !truthy(await expr.eval(a.guard, c.data, c.bindings))) continue;
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

  return { ops: c.ops, traces: c.traces };
}
