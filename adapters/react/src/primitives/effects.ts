// The standardized, declarative effect vocabulary.
//
// Mirrors the demo-boards-frontend model where a leaf never holds an effect handler — it declares
// intent (`onSave(value, meta)`) and ONE central router maps that to the real effect. Here, a
// bundle's program declares `invoke("<name>", args)`; this dispatcher routes the named effect to a
// registered native handler. Handlers are the only place imperative/effectful work lives, they are
// written once and registered on the host, and programs reach them purely by name — so app logic
// stays JSON, never a bespoke Orchestrator subclass.

import type {
  InvocationControl,
  InvocationId,
  Json,
  Orchestrator,
  OrchestratorEffect,
  OrchestratorProgress,
  OrchestratorResult,
  PatchOp,
  StateModel,
} from "@gik/kernel";

/** A store delta helper: set `path` to `value`. */
export function setOp(path: string, value: Json): PatchOp {
  return { op: "set", path, value };
}

/** What a named effect handler receives: current-state reads plus the effect's args/payload. */
export interface EffectContext {
  /** Read the up-to-date store (the kernel applies reducer ops BEFORE effects run). */
  get(path: string): Json;
  /** Build a `set` op for the returned result. */
  set(path: string, value: Json): PatchOp;
  /** Args declared on the invoke action. */
  args: Record<string, Json>;
  /** The triggering event payload (e.g. { id } from a list select). */
  payload: Record<string, Json>;
  /** Identity of the human or agent that emitted the triggering event, when supplied. */
  actorId?: string;
  /** Identity of the active invocation. Present for `invoke`; absent for one-shot route/confirm. */
  invocationId?: InvocationId;
  /** Aborted when the active invocation is cancelled. Present for `invoke` only. */
  signal?: AbortSignal;
  /** Publish non-terminal, non-durable progress. Present for `invoke` only. */
  emitProgress?: (progress: OrchestratorProgress) => Promise<void>;
  /** Settle the active invocation exactly once. Present for `invoke` only. */
  emit?: (result?: OrchestratorResult) => Promise<void>;
  store: StateModel;
}

export type EffectHandler = (
  ctx: EffectContext
) => OrchestratorResult | void | Promise<OrchestratorResult | void>;

export type EffectHandlerMap = Record<string, EffectHandler>;

function contextFor(store: StateModel, effect: OrchestratorEffect): EffectContext {
  return {
    get: (path) => store.get(path),
    set: setOp,
    args: effect.args ?? {},
    payload: effect.payload ?? {},
    actorId: effect.actorId,
    store,
  };
}

/**
 * Build an Orchestrator that routes every `invoke("<name>")` to `handlers[name]`. Unregistered
 * names are a no-op (traced by the kernel). The dispatcher shares the SAME state model the kernel
 * reduces into, so handlers read current values and return computed ops.
 */
export function createEffectDispatcher(store: StateModel, handlers: EffectHandlerMap): Orchestrator {
  const handlerFor = (effect: OrchestratorEffect): EffectHandler | undefined =>
    effect.tool ? handlers[effect.tool] : undefined;

  const invoke = async (
    effect: OrchestratorEffect,
    control: InvocationControl
  ): Promise<OrchestratorResult | void> => {
    const handler = handlerFor(effect);
    if (!handler) return;
    return handler({
      ...contextFor(store, effect),
      invocationId: control.id,
      signal: control.signal,
      emitProgress: control.emitProgress,
      emit: control.emit,
    });
  };

  const runOneShot = async (effect: OrchestratorEffect): Promise<OrchestratorResult | void> => {
    const handler = handlerFor(effect);
    if (!handler) return;
    return handler(contextFor(store, effect));
  };
  return { invoke, confirm: runOneShot, route: runOneShot };
}
