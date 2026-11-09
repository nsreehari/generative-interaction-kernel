import assert from "node:assert/strict";
import { test } from "vitest";
import type { GIKEvent, SenseSignal } from "../../kernel/src/index";
import {
  createBlueprint, createBlueprintDurableBootstrapEvent, createBlueprintDurableTransitionAdapter,
  createBlueprintSenseSignalEvent, BlueprintSenseReconciler,
  createBlueprintDurableEffectSettlementEvent,
  admitBlueprintSenseSignal,
  materializeBlueprint,
} from "../src/index";

function fixture() {
  return createBlueprint({
    id: "sensing-counter", kind: "example", version: "1",
    serviceTiers: [{ id: "native", kind: "native" }], serviceRecipes: [],
    projectionTiers: [{ id: "headless", kind: "headless", capabilities: [] }], projectionRecipes: [],
    runtime: { state: { settings: { enabled: true, intervalMs: 100 }, counter: { value: 0 } } },
    services: {
      clock: {
        kind: "interval-timer", version: "1",
        operations: {
          observe: {
            operation: "interval", contract: "clock/v1",
            sense: { kind: "timer", signals: { due: { payloadSchema: {
              type: "object", required: ["occurrence"], properties: { occurrence: { type: "integer" } },
            } } } },
            settlement: { transform: { kind: "jsonata", expr: "{}" } },
          },
        },
      },
      reports: {
        kind: "reports", version: "1",
        operations: { fetch: { operation: "fetch", contract: "report/v1", settlement: { transform: { kind: "jsonata", expr: "{}" } } } },
      },
    },
    cells: {
      review: {
        id: "review", inputs: [{ token: "settings" }, { token: "counter.value", as: "count" }],
        senses: [{
          id: "clock", service: "clock", operation: "observe", when: "inputs.settings.enabled",
          input: { kind: "jsonata", expr: "{'intervalMs':inputs.settings.intervalMs}" },
          output: { kind: "jsonata", expr: "{'value':response.occurrence}" },
          on: { due: "tick" },
        }],
        sources: [{
          id: "report", service: "reports", operation: "fetch", when: "inputs.count > 0",
          input: { kind: "jsonata", expr: "{'tick':inputs.count}" },
        }],
        events: {
          tick: { payloadSchema: { type: "object", required: ["value"], properties: { value: { type: "integer" } } } },
          configure: { payloadSchema: { type: "object" } },
        },
        behavior: { on: {
          tick: [{ do: "assign", target: "counter.value", args: { from: "counter.value + 1" } }],
          configure: [{ do: "assign", target: "settings", args: { from: "$event" } }],
        } },
      },
    },
  });
}

async function harness(instanceId = "workspace-a", blueprint = fixture()) {
  const adapter = createBlueprintDurableTransitionAdapter({ blueprint, instanceId });
  let state = adapter.initialState(), spec = adapter.initialSpec();
  const step = async (events: GIKEvent[]) => {
    const result = await adapter.transition({ state, spec, events });
    state = result.state;
    spec = adapter.applySpecUpdates({ spec, updates: result.specUpdates ?? [] });
    return result;
  };
  await step([createBlueprintDurableBootstrapEvent()]);
  return {
    step, adapter,
    get state() { return state; },
    get spec() { return spec; },
    binding: () => Object.values(spec.senses!.bindings)[0]!,
  };
}

test("one binding delivers repeated events and ordinary source effects without reconnecting", async () => {
  const h = await harness();
  const binding = h.binding();
  for (let occurrence = 1; occurrence <= 3; occurrence++) {
    const result = await h.step([createBlueprintSenseSignalEvent(binding, { id: `tick-${occurrence}`, name: "due", payload: { occurrence } })]);
    assert.equal(h.state.counter && typeof h.state.counter === "object" && !Array.isArray(h.state.counter) ? h.state.counter.value : null, occurrence);
    assert.ok(result.effects.some((effect) => effect.kind === "invoke" && effect.control.sourceId === "report"), JSON.stringify({ occurrence, effects: result.effects, state: h.state }));
    assert.equal(h.binding().generation, binding.generation);
    await h.step([createBlueprintDurableEffectSettlementEvent(`report-${occurrence}`, { sourceOutput: { tick: occurrence } }, result.effects[0])]);
  }
});

test("durable delivery window survives reconstruction and rejects duplicates and cross-instance signals", async () => {
  const h = await harness();
  const event = createBlueprintSenseSignalEvent(h.binding(), { id: "first", name: "due", payload: { occurrence: 1 } });
  await h.step([event]);
  const recovered = createBlueprintDurableTransitionAdapter({ blueprint: fixture(), instanceId: "workspace-a" });
  const duplicate = await recovered.transition({ state: structuredClone(h.state), spec: structuredClone(h.spec), events: [event] });
  assert.deepEqual(duplicate.state, h.state);
  assert.deepEqual(duplicate.effects, []);
  const other = await harness("workspace-b");
  await assert.rejects(other.step([event]), /another Blueprint instance/);
});

test("input replacement, disable and re-enable retire generations, including within a journal batch", async () => {
  const h = await harness();
  const original = h.binding();
  const oldSignal = createBlueprintSenseSignalEvent(original, { id: "late", name: "due", payload: { occurrence: 1 } });
  await h.step([{ node: "review", name: "configure", payload: { enabled: true, intervalMs: 200 } }]);
  assert.ok(h.binding().generation > original.generation);
  await h.step([oldSignal]);
  assert.deepEqual(h.state.counter, { value: 0 });
  const currentSignal = createBlueprintSenseSignalEvent(h.binding(), { id: "late-current", name: "due", payload: { occurrence: 1 } });
  await h.step([{ node: "review", name: "configure", payload: { enabled: false, intervalMs: 200 } }, currentSignal]);
  assert.deepEqual(h.spec.senses!.bindings, {});
  assert.deepEqual(h.state.counter, { value: 0 });
  await h.step([{ node: "review", name: "configure", payload: { enabled: true, intervalMs: 100 } }]);
  assert.ok(h.binding().generation > original.generation);
});

test("invalid Signals and target payloads fail explicitly", async () => {
  const h = await harness();
  assert.throws(() => createBlueprintSenseSignalEvent(h.binding(), { id: "bad", name: "unknown", payload: {} }), /Undeclared/);
  assert.throws(() => createBlueprintSenseSignalEvent(h.binding(), { id: "bad", name: "due", payload: { occurrence: "not-an-integer" } }), /Invalid Sense Signal/);
  const event = createBlueprintSenseSignalEvent(h.binding(), { id: "bad-target", name: "due", payload: { occurrence: 1 } });
  const invalidBinding = structuredClone(h.binding());
  invalidBinding.sense.output = { kind: "jsonata", expr: "{'value':'invalid'}" };
  assert.throws(() => createBlueprintSenseSignalEvent(invalidBinding, { id: "bad-target", name: "due", payload: { occurrence: 1 } }), /Invalid Sense target event/);
  event.payload!.signal = { id: "bad", name: "due", payload: { occurrence: "invalid" } };
  await assert.rejects(h.step([event]), /Invalid Sense Signal/);
});

test("Cell and Blueprint validation reject duplicate usages and unresolved contracts or routes", () => {
  const blueprint = fixture();
  const definition = blueprint.payload;
  const cell = definition.cells!.review!;
  cell.senses = [...cell.senses!, ...cell.senses!];
  assert.throws(() => createBlueprint(definition), /duplicated/);
  cell.senses = [{ ...cell.senses[0]!, on: { absent: "tick" } }];
  assert.throws(() => createBlueprint(definition), /unknown Signal/);
  cell.senses = [{ ...cell.senses[0]!, on: { due: "absent" } }];
  assert.throws(() => createBlueprint(definition), /undeclared event/);
  cell.senses = [{ ...cell.senses[0]!, operation: "absent", on: { due: "tick" } }];
  assert.throws(() => createBlueprint(definition), /without a Sense contract/);
});

test("host reconciler retains unchanged bindings, closes replacements and rejects retired callbacks", async () => {
  const h = await harness();
  const callbacks: ((signal: SenseSignal) => Promise<void>)[] = [];
  const delivered: GIKEvent[] = [], errors: unknown[] = [];
  let closed = 0;
  const reconciler = new BlueprintSenseReconciler({
    async open(_binding, emit) { callbacks.push(emit); return { close() { closed++; } }; },
    async append(event) { delivered.push(event); },
    onError(error) { errors.push(error); },
  });
  await reconciler.reconcile(h.spec.senses!);
  await reconciler.reconcile(h.spec.senses!);
  assert.equal(callbacks.length, 1);
  await callbacks[0]!({ id: "first", name: "due", payload: { occurrence: 1 } });
  assert.equal(delivered.length, 1);
  await h.step([{ node: "review", name: "configure", payload: { enabled: true, intervalMs: 200 } }]);
  await reconciler.reconcile(h.spec.senses!);
  assert.equal(closed, 1);
  await assert.rejects(callbacks[0]!({ id: "late", name: "due", payload: { occurrence: 2 } }), /retired/);
  await reconciler.stop();
  assert.equal(closed, 2);
  assert.deepEqual(errors, []);
});

test("Sense activation and inputs consume another Cell's output tokens", async () => {
  const blueprint = fixture();
  blueprint.payload.cells!.configuration = {
    id: "configuration", inputs: [{ token: "settings", as: "settings" }],
    compute: [{ id: "publish", expression: "inputs.settings", assign: "published" }],
    outputs: [{ token: "clock-settings", from: "computed.published" }],
  };
  blueprint.payload.cells!.review!.inputs = [{ token: "clock-settings", as: "settings" }, { token: "counter.value", as: "count" }];
  const adapter = createBlueprintDurableTransitionAdapter({ blueprint, instanceId: "tokens" });
  const result = await adapter.transition({ state: adapter.initialState(), spec: adapter.initialSpec(), events: [createBlueprintDurableBootstrapEvent()] });
  const spec = adapter.applySpecUpdates({ spec: adapter.initialSpec(), updates: result.specUpdates ?? [] });
  assert.deepEqual(Object.values(spec.senses!.bindings)[0]!.input, { intervalMs: 100 });
});

test("bounded delivery retention suppresses recent IDs and allows expired IDs", async () => {
  const h = await harness();
  const binding = h.binding();
  const event = (id: string) => createBlueprintSenseSignalEvent(binding, { id, name: "due", payload: { occurrence: 1 } });
  for (let index = 0; index < 300; index++) {
    assert.equal(admitBlueprintSenseSignal(h.spec.senses!, event(String(index)), h.spec.materializedBlueprint).status, "accepted");
  }
  assert.equal(admitBlueprintSenseSignal(h.spec.senses!, event("299"), h.spec.materializedBlueprint).status, "duplicate");
  assert.equal(admitBlueprintSenseSignal(h.spec.senses!, event("0"), h.spec.materializedBlueprint).status, "accepted");
});

test("recorded Signals replay deterministically without any producer", async () => {
  const blueprint = fixture();
  delete blueprint.payload.cells!.review!.sources;
  const first = await harness("replay", blueprint);
  const signal = createBlueprintSenseSignalEvent(first.binding(), { id: "observed", name: "due", payload: { occurrence: 1 } });
  await first.step([signal]);
  const replay = await harness("replay", blueprint);
  await replay.step([structuredClone(signal)]);
  assert.deepEqual(replay.state, first.state);
  assert.deepEqual(replay.spec, first.spec);
});

test("removing a sensing Cell retires its committed bindings before further deliveries", async () => {
  const blueprint = fixture();
  blueprint.payload.structureMode = "reconfigurable";
  const h = await harness("structure", blueprint);
  const event = createBlueprintSenseSignalEvent(h.binding(), { id: "late", name: "due", payload: { occurrence: 1 } });
  const spec = h.adapter.applySpecUpdates({
    spec: h.spec, updates: [{ patch: [{ op: "removeCell", cellId: "review" }], origin: "authorized" }],
  });
  assert.deepEqual(spec.senses!.bindings, {});
  const result = await h.adapter.transition({ state: h.state, spec, events: [event] });
  assert.deepEqual(result.state.counter, { value: 0 });
  assert.deepEqual(result.effects, []);
});

test("service lowering can configure Sense usages while retaining contracts and Signal routes", () => {
  const blueprint = fixture();
  blueprint.payload.serviceTiers.push({ id: "host", kind: "runtime-service" });
  const usage = blueprint.payload.cells!.review!.senses![0]!;
  blueprint.payload.serviceRecipes = [{
    id: "clock-host", from: "native", to: "host", fallback: "selected",
    implementationPrograms: [{
      id: "selected",
      cells: { review: { senses: [{ ...usage, input: { kind: "jsonata", expr: "{'intervalMs':200}" } }] } },
    }],
  }];
  const materialized = materializeBlueprint({ blueprint });
  assert.equal(materialized.payload.terminalBlueprint.payload.cells!.review!.senses![0]!.input!.expr, "{'intervalMs':200}");
  blueprint.payload.serviceRecipes[0]!.implementationPrograms[0]!.cells!.review!.senses = [{ ...usage, on: { due: "configure" } }];
  assert.throws(() => materializeBlueprint({ blueprint }), /changes Sense contracts/);
});

test("cleanup failures are reported and block replacement until cleanup succeeds", async () => {
  const h = await harness();
  const errors: unknown[] = [];
  let shouldFail = true, opened = 0;
  const reconciler = new BlueprintSenseReconciler({
    async open() {
      opened++;
      return { close() { if (shouldFail) throw new Error("cleanup failed"); } };
    },
    async append() {},
    onError(error) { errors.push(error); },
  });
  await reconciler.reconcile(h.spec.senses!);
  await h.step([{ node: "review", name: "configure", payload: { enabled: true, intervalMs: 200 } }]);
  await assert.rejects(reconciler.reconcile(h.spec.senses!), /cleanup failed/);
  assert.equal(opened, 1);
  assert.equal(errors.length, 1);
  shouldFail = false;
  await reconciler.reconcile(h.spec.senses!);
  assert.equal(opened, 2);
  await reconciler.stop();
});

test("Signal response stages retain the host-transformed request context for validation and replay", async () => {
  const blueprint = fixture();
  const operation = blueprint.payload.services!.clock!.operations.observe!;
  operation.response = {
    transform: { kind: "jsonata", expr: "{'value':response.occurrence * 2}" },
    validators: [{ kind: "jsonata", expr: "data.value <= $request.limit", message: "Above request limit" }],
  };
  blueprint.payload.cells!.review!.senses = [{
    ...blueprint.payload.cells!.review!.senses![0]!,
    output: { kind: "jsonata", expr: "{'value':response.value}" },
  }];
  const h = await harness("response-stages", blueprint);
  const signal = { id: "valid", name: "due", payload: { occurrence: 2 } };
  const event = createBlueprintSenseSignalEvent(h.binding(), signal, { limit: 4 });
  assert.throws(() => createBlueprintSenseSignalEvent(h.binding(), signal, { limit: 3 }), /response validation failed/);
  await h.step([event]);
  assert.deepEqual(h.state.counter, { value: 1 });
});
