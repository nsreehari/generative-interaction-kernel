// The PLATFORM FLOOR, part 2: the standardized, declarative effect vocabulary.
//
// Mirrors the demo-boards-frontend model where a leaf never holds an effect handler — it declares
// intent (`onSave(value, meta)`) and ONE central router maps that to the real effect. Here, a
// bundle's document declares `invoke("<name>", args)`; this dispatcher routes the named effect to a
// registered native handler. Handlers are the only place imperative/effectful work lives, they are
// written once and registered on the host, and documents reach them purely by name — so app logic
// stays JSON, never a bespoke Orchestrator subclass.

import type {
  Json,
  Orchestrator,
  OrchestratorEffect,
  OrchestratorResult,
  PatchOp,
  StateModel,
} from "../../../../kernel/src/index";

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
  store: StateModel;
}

export type EffectHandler = (
  ctx: EffectContext
) => OrchestratorResult | void | Promise<OrchestratorResult | void>;

export type EffectHandlerMap = Record<string, EffectHandler>;

/**
 * Build an Orchestrator that routes every `invoke("<name>")` to `handlers[name]`. Unregistered
 * names are a no-op (traced by the kernel). The dispatcher shares the SAME state model the kernel
 * reduces into, so handlers read current values and return computed ops.
 */
export function createEffectDispatcher(store: StateModel, handlers: EffectHandlerMap): Orchestrator {
  const run = async (effect: OrchestratorEffect): Promise<OrchestratorResult | void> => {
    const handler = effect.tool ? handlers[effect.tool] : undefined;
    if (!handler) return;
    const ctx: EffectContext = {
      get: (path) => store.get(path),
      set: setOp,
      args: effect.args ?? {},
      payload: effect.payload ?? {},
      store,
    };
    return handler(ctx);
  };
  return { invoke: run, confirm: run, route: run };
}
