import { evalSyncJsonata, runDeclarativeValidators } from "gik-evaluators";
import type { CellSense, GIKEvent, Json, SenseSignal, ServiceDeclaration } from "gik-kernel";
import { validateJsonValue } from "gik-kernel";
import type { BlueprintTransitionResult, MaterializedBlueprint } from "./run-transition";

export interface BlueprintSenseBinding {
  instanceId: string;
  key: string;
  generation: number;
  cellId: string;
  sense: CellSense;
  declaration: ServiceDeclaration;
  events: Record<string, { payloadSchema: Record<string, Json>; description?: string }>;
  input: Json;
}

export interface BlueprintSenseState {
  instanceId: string;
  generation: number;
  bindings: Record<string, BlueprintSenseBinding>;
  deliveries: Record<string, string[]>;
}

export const BLUEPRINT_SENSE_SIGNAL_NODE = "$gik.sense";
export const SENSE_DELIVERY_WINDOW = 256;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function isBlueprintSenseBindingCurrent(materialized: MaterializedBlueprint, binding: BlueprintSenseBinding): boolean {
  const blueprint = materialized.payload.terminalBlueprint;
  const cell = blueprint.payload.cells?.[binding.cellId];
  const usage = cell?.senses?.find(({ id }) => id === binding.sense.id);
  return canonical(usage) === canonical(binding.sense)
    && canonical(blueprint.payload.services?.[binding.sense.service]) === canonical(binding.declaration)
    && canonical(cell?.events ?? {}) === canonical(binding.events);
}

export function reconcileBlueprintSenseState(
  materialized: MaterializedBlueprint,
  desiredBindings: NonNullable<BlueprintTransitionResult["senseBindings"]>,
  previous: BlueprintSenseState,
): BlueprintSenseState {
  const next: BlueprintSenseState = { instanceId: previous.instanceId, generation: previous.generation, bindings: {}, deliveries: {} };
  const blueprint = materialized.payload.terminalBlueprint;
  for (const { cellId, sense, input } of desiredBindings) {
      const declaration = blueprint.payload.services?.[sense.service];
      if (!declaration) throw new Error(`Unknown Sense service '${sense.service}'`);
      const key = JSON.stringify([cellId, sense.id]);
      const events = blueprint.payload.cells?.[cellId]?.events ?? {};
      const desired = { instanceId: previous.instanceId, key, cellId, sense, declaration, events, input };
      const old = previous.bindings[key];
      const { generation: _generation, ...oldDesired } = old ?? { generation: 0 };
      const generation = old && canonical(oldDesired) === canonical(desired)
        ? old.generation : ++next.generation;
      next.bindings[key] = { ...desired, generation };
      next.deliveries[key] = generation === old?.generation ? [...(previous.deliveries[key] ?? [])] : [];
  }
  return next;
}

function assertPayload(schema: Record<string, Json>, payload: Json, label: string): void {
  validateJsonValue(schema, payload, label);
}

export function mapBlueprintSenseSignal(binding: BlueprintSenseBinding, signal: SenseSignal, requestInput: Json = binding.input): GIKEvent {
  if (typeof signal.id !== "string" || !signal.id || signal.id.length > 200) throw new Error("Sense Signal requires an id of 1-200 characters");
  if (typeof signal.name !== "string" || !signal.payload || typeof signal.payload !== "object" || Array.isArray(signal.payload)) {
    throw new Error("Sense Signal requires a name and object payload");
  }
  const operation = binding.declaration.operations[binding.sense.operation];
  const signals = operation?.sense?.signals;
  const contract = signals && Object.hasOwn(signals, signal.name) ? signals[signal.name] : undefined;
  const event = Object.hasOwn(binding.sense.on, signal.name) ? binding.sense.on[signal.name] : undefined;
  if (!contract || !event) throw new Error(`Undeclared Sense Signal '${signal.name}'`);
  assertPayload(contract.payloadSchema, signal.payload, "Invalid Sense Signal");
  const response = operation.response?.transform
    ? evalSyncJsonata(operation.response.transform.expr, { response: signal.payload })
    : signal.payload;
  const report = runDeclarativeValidators(operation.response?.validators ?? [], response, {
    bindings: { request: requestInput },
  });
  if (!report.ok) throw new Error(`Sense response validation failed: ${report.errors.map(({ detail }) => detail).join("; ")}`);
  const payload = binding.sense.output
    ? evalSyncJsonata(binding.sense.output.expr, { response, signal: { ...signal } })
    : response;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Sense event payload must be an object");
  }
  const target = Object.hasOwn(binding.events, event) ? binding.events[event] : undefined;
  if (!target) throw new Error(`Undeclared Sense target event '${event}'`);
  assertPayload(target.payloadSchema, payload, "Invalid Sense target event");
  return { node: binding.cellId, name: event, payload };
}

export function createBlueprintSenseSignalEvent(binding: BlueprintSenseBinding, signal: SenseSignal, requestInput: Json = binding.input): GIKEvent {
  mapBlueprintSenseSignal(binding, signal, requestInput);
  return {
    node: BLUEPRINT_SENSE_SIGNAL_NODE,
    name: "signal",
    payload: { instanceId: binding.instanceId, key: binding.key, generation: binding.generation, signal: { ...signal }, requestInput },
  };
}

export function admitBlueprintSenseSignal(
  senses: BlueprintSenseState,
  event: GIKEvent,
  materialized: MaterializedBlueprint,
): { status: "accepted"; event: GIKEvent } | { status: "duplicate" | "retired" } {
  const key = event.payload?.key;
  const generation = event.payload?.generation;
  const value = event.payload?.signal;
  if (event.payload?.instanceId !== senses.instanceId) throw new Error("Sense delivery belongs to another Blueprint instance");
  if (event.name !== "signal" || typeof key !== "string" || typeof generation !== "number"
    || !value || typeof value !== "object" || Array.isArray(value)
    || typeof value.id !== "string" || typeof value.name !== "string"
    || !value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) {
    throw new Error("Invalid Sense delivery envelope");
  }
  const binding = senses.bindings[key];
  if (!binding || binding.generation !== generation || !isBlueprintSenseBindingCurrent(materialized, binding)) return { status: "retired" };
  const signal: SenseSignal = { id: value.id, name: value.name, payload: value.payload };
  const mapped = mapBlueprintSenseSignal(binding, signal, event.payload && Object.hasOwn(event.payload, "requestInput") ? event.payload.requestInput : binding.input);
  const contract = materialized.payload.terminalBlueprint.payload.cells?.[binding.cellId]?.events?.[mapped.name];
  if (!contract) throw new Error(`Undeclared Sense target event '${mapped.name}'`);
  assertPayload(contract.payloadSchema, mapped.payload ?? {}, "Invalid Sense target event");
  const deliveries = senses.deliveries[key] ?? [];
  if (deliveries.includes(signal.id)) return { status: "duplicate" };
  senses.deliveries[key] = [...deliveries, signal.id].slice(-SENSE_DELIVERY_WINDOW);
  return { status: "accepted", event: mapped };
}

export interface BlueprintSenseHandle {
  close(): void | Promise<void>;
}

/** Reconciles host-owned connections against already committed, durable binding intent. */
export class BlueprintSenseReconciler {
  private readonly active = new Map<string, { binding: BlueprintSenseBinding; handle: BlueprintSenseHandle; lifetime: { live: boolean } }>();
  private operation: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(private readonly options: {
    open(binding: BlueprintSenseBinding, emit: (signal: SenseSignal, requestInput?: Json) => Promise<void>): Promise<BlueprintSenseHandle>;
    append(event: GIKEvent): Promise<void>;
    onError(error: unknown, binding: BlueprintSenseBinding): void;
  }) {}

  reconcile(state: BlueprintSenseState): Promise<void> {
    const desired = structuredClone(state);
    return this.enqueue(async () => {
      if (this.stopped) throw new Error("Sense reconciler is stopped");
      for (const [key, active] of this.active) {
        if (desired.bindings[key]?.generation === active.binding.generation) continue;
        active.lifetime.live = false;
        try { await active.handle.close(); }
        catch (error) { this.options.onError(error, active.binding); throw error; }
        this.active.delete(key);
      }
      for (const binding of Object.values(desired.bindings)) {
        if (this.active.has(binding.key)) continue;
        const lifetime = { live: true };
        try {
          const handle = await this.options.open(structuredClone(binding), async (signal, requestInput) => {
            if (!lifetime.live || this.stopped) throw new Error("Sense binding is retired");
            try { await this.options.append(createBlueprintSenseSignalEvent(binding, signal, requestInput)); }
            catch (error) { this.options.onError(error, binding); throw error; }
          });
          this.active.set(binding.key, { binding, handle, lifetime });
        } catch (error) {
          lifetime.live = false;
          this.options.onError(error, binding);
          throw error;
        }
      }
    });
  }

  stop(): Promise<void> {
    this.stopped = true;
    return this.enqueue(async () => {
      const errors: unknown[] = [];
      for (const [key, active] of this.active) {
        active.lifetime.live = false;
        try { await active.handle.close(); this.active.delete(key); }
        catch (error) { this.options.onError(error, active.binding); errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, "Sense cleanup failed");
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operation.then(operation);
    this.operation = next.catch(() => { /* The returned promise and onError report the failure. */ });
    return next;
  }
}
