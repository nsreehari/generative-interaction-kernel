// StepOrchestrator — a genui `Orchestrator` backed by the vendored StepMachine (ADR-0033 item 1).
//
// The kernel's reducer turns an `invoke` action into a pure `OrchestratorEffect` request; the
// Orchestrator provider owns time + side effects and returns `{ ops?, events? }`. The reference
// orchestrator is a no-op, so every runtime that wants a real tool call wires it imperatively.
//
// This adapter makes `invoke` DECLARATIVE-behind-the-seam: a tool is a named `StepFlowConfig`
// (branching, retry, circuit-breaker, forEach, resumable over a pluggable store — the proven
// StepMachine crux, vendored verbatim). `invoke(tool, args)` runs the matching flow to completion
// and maps its terminal result back into a follow-up event (and/or store ops). Unregistered tools
// are left unhandled, exactly as the kernel expects (traced, no store change).
//
// Kernel untouched: this is a drop-in `orchestrator` for `new Kernel(m, d, { orchestrator })`.

import type {
  Orchestrator,
  OrchestratorEffect,
  OrchestratorResult,
  GupEvent,
  Json,
} from "../../../kernel/src/index";
import { StepMachine } from "../../vendor/step-machine/index.js";
import type {
  StepFlowConfig,
  StepHandler,
  StepMachineResult,
  StepMachineStore,
} from "../../vendor/step-machine/index.js";

/** One tool: a `StepFlowConfig` plus its step handlers and optional durability / result shaping. */
export interface FlowRegistration {
  /** The flow the StepMachine executes for this tool. */
  flow: StepFlowConfig;
  /** Step handlers referenced by the flow's steps (the actual side-effecting work). */
  handlers: Record<string, StepHandler>;
  /** Optional store factory for durable/resumable runs (defaults to StepMachine's in-memory store). */
  store?: () => StepMachineStore;
  /** Map a completed run into the genui result. Defaults to a `${tool}:${intent}` follow-up event. */
  onResult?: (result: StepMachineResult, effect: OrchestratorEffect) => OrchestratorResult;
}

/** Tools this orchestrator can fulfil, keyed by the `tool` name an `invoke` action names. */
export type FlowRegistry = Record<string, FlowRegistration>;

export class StepOrchestrator implements Orchestrator {
  private readonly flows: FlowRegistry;

  constructor(flows: FlowRegistry) {
    this.flows = flows;
  }

  async invoke(effect: OrchestratorEffect): Promise<OrchestratorResult | void> {
    const tool = effect.tool;
    if (!tool) return; // no tool named — leave unhandled
    const reg = this.flows[tool];
    if (!reg) return; // unregistered tool — the kernel traces this and applies no change

    const machine = new StepMachine(reg.flow, reg.handlers, reg.store ? { store: reg.store() } : {});
    const result = await machine.run(effect.args);
    return (reg.onResult ?? defaultResult)(result, effect);
  }
}

/**
 * Default result mapping: emit a single follow-up event back to the invoking node, named
 * `${tool}:${intent-or-status}`, carrying the run's return data as the payload. A document's `on`
 * handler for that event name resumes the declarative flow (e.g. assign the returned data). Custom
 * `onResult` can instead (or additionally) return store `ops`.
 */
function defaultResult(result: StepMachineResult, effect: OrchestratorEffect): OrchestratorResult {
  const event: GupEvent = {
    node: effect.node,
    name: `${effect.tool}:${result.intent ?? result.status}`,
    payload: asJsonObject(result.data),
  };
  return { events: [event] };
}

/** Coerce a StepMachine's `Record<string, unknown>` return bag into a JSON-safe payload. */
function asJsonObject(value: unknown): Record<string, Json> {
  try {
    const json = JSON.parse(JSON.stringify(value ?? {}));
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, Json>) : {};
  } catch {
    return {};
  }
}
