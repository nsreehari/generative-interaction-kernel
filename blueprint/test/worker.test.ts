import assert from "node:assert/strict";
import { test } from "vitest";
import { createDurableRuntime } from "@gik/durable-runtime";
import { projectCellRunState, type BlueprintRunState } from "@gik/kernel";

import { createBlueprint } from "../src/blueprint";
import {
  createBlueprintDurableEffectSettlementEvent,
  createBlueprintDurableTransitionAdapter,
} from "../src/durable-transition";
import {
  createBlueprintWorker,
  executeQueuedBlueprintEffect,
  executeQueuedCellSourceEffect,
  prepareQueuedCellSourceEffect,
  queuedBlueprintEffectFailureEvents,
  settleQueuedCellSourceEffect,
} from "../src/worker";
import { createInMemoryBlueprintExecution } from "../src/worker/in-memory";

function ref(value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind: "memory", value })).toString("base64url")}`;
}

function singleSlotPresentation(root: string) {
  return {
    slots: [root],
    root,
    allowedCapabilities: ["screen"],
  } as const;
}

test("queued Cell sources transform requests and retain only narrowed responses", async () => {
  const queued = {
    kind: "invoke" as const,
    node: "market-prices-source-0",
    control: {
      tool: "refreshPrices",
      sourceId: "market-prices.source",
      sourceCellId: "market-prices",
      sourceInputs: {
        inputs: { ticker: "MSFT" },
        sources: {},
        externalContext: { market: "US" },
        symbol: "MSFT",
      },
      sourceInputTransform: { kind: "jsonata" as const, expr: "{'symbol':symbol,'market':externalContext.market}" },
      sourceOutputTransform: { kind: "jsonata" as const, expr: "response.chart.result[0].meta.regularMarketPrice" },
    },
    data: {},
  };

  const executing = await prepareQueuedCellSourceEffect(queued);
  assert.deepEqual(executing.data, { symbol: "MSFT", market: "US" });

  const settled = await settleQueuedCellSourceEffect(queued, {
    sourceOutput: {
      chart: {
        result: [{
          meta: { regularMarketPrice: 421.5, currency: "USD" },
          indicators: { quote: [{ close: [420, 421.5] }] },
        }],
      },
    },
  }, {
    blueprintRunState: {
      cells: {
        "market-prices": { sources: [] },
      },
    },
  });

  assert.ok(settled);
  assert.equal(settled.sourceOutput, undefined);
  assert.deepEqual(settled.ops, [{
    op: "set",
    path: "blueprintRunState.cells",
    value: {
      "market-prices": {
        sources: [],
        sourceValues: { "market-prices.source": 421.5 },
      },
    },
  }]);
  assert.doesNotMatch(JSON.stringify(settled), /indicators|currency/);
});

test("queued Cell source execution owns prepare, invoke, and settle as one pipeline", async () => {
  const queued = {
    kind: "invoke" as const,
    node: "analysis-evaluate",
    control: {
      tool: "analyze",
      sourceId: "analysis.source",
      sourceCellId: "analysis",
      sourceInputs: { inputs: { report: "# Incident" } },
      sourceInputTransform: { kind: "jsonata" as const, expr: "{'report':inputs.report}" },
      sourceOutputTransform: { kind: "jsonata" as const, expr: "response.analysis" },
    },
    data: {},
  };
  let executedArgs: unknown;

  const result = await executeQueuedCellSourceEffect(queued, {
    blueprintRunState: { cells: { analysis: { sources: [] } } },
  }, (executingEffect) => {
    executedArgs = executingEffect.data;
    return { sourceOutput: { analysis: { verdict: "confirmed" }, raw: "discard" } };
  });

  assert.deepEqual(executedArgs, { report: "# Incident" });
  assert.ok(result);
  assert.equal(result.sourceOutput, undefined);
  assert.deepEqual(result.ops?.[0], {
    op: "set",
    path: "blueprintRunState.cells",
    value: {
      analysis: {
        sources: [],
        sourceValues: { "analysis.source": { verdict: "confirmed" } },
      },
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /discard/);
});

test("Blueprint worker processes one engine and queue cycle per notification", async () => {
  const calls: string[] = [];
  let releaseFirstEngine!: () => void;
  const firstEngine = new Promise<void>((resolve) => { releaseFirstEngine = resolve; });
  let cycleCompleted!: () => void;
  const completed = new Promise<void>((resolve) => { cycleCompleted = resolve; });
  const worker = createBlueprintWorker({
    request: {
      stateRef: "state",
      journalRef: "journal",
      effectsQueueRef: "effects",
    },
    subscribe: () => undefined,
    runtime: {
      async processEngineWake() {
        calls.push("engine");
        if (calls.length === 1) await firstEngine;
        return { status: "committed" };
      },
      async processQueueLaneItem() {
        calls.push("queue");
        cycleCompleted();
        return { status: "completed" };
      },
    },
  });

  await worker.start();
  assert.deepEqual(calls, ["engine"]);

  releaseFirstEngine();
  await completed;
  assert.deepEqual(calls, ["engine", "queue"]);
  worker.stop();
});

test("Blueprint worker pauses when engine ownership is unavailable", async () => {
  let queueCalls = 0;
  let engineCalled!: () => void;
  const attempted = new Promise<void>((resolve) => { engineCalled = resolve; });
  const worker = createBlueprintWorker({
    request: {
      stateRef: "state",
      journalRef: "journal",
      effectsQueueRef: "effects",
    },
    subscribe: () => undefined,
    runtime: {
      async processEngineWake() {
        engineCalled();
        return { status: "busy" };
      },
      async processQueueLaneItem() {
        queueCalls += 1;
        return { status: "idle" };
      },
    },
  });

  await worker.start();
  await attempted;

  assert.equal(queueCalls, 0);
  worker.stop();
});

test("Blueprint worker retries engine ownership contention asynchronously", async () => {
  let engineCalls = 0;
  let recovered!: () => void;
  const recovery = new Promise<void>((resolve) => { recovered = resolve; });
  const worker = createBlueprintWorker({
    request: { stateRef: "state", journalRef: "journal", effectsQueueRef: "effects" },
    subscribe: () => undefined,
    runtime: {
      async processEngineWake() {
        engineCalls += 1;
        return { status: engineCalls === 1 ? "busy" : "idle" };
      },
      async processQueueLaneItem() {
        recovered();
        return { status: "idle" };
      },
    },
  });

  await worker.start();
  await recovery;
  assert.equal(engineCalls, 2);
  worker.stop();
});

test("Blueprint worker schedules one follow-up cycle for a retryable effect", async () => {
  let queueCalls = 0;
  let completed!: () => void;
  const retried = new Promise<void>((resolve) => { completed = resolve; });
  const worker = createBlueprintWorker({
    request: {
      stateRef: "state",
      journalRef: "journal",
      effectsQueueRef: "effects",
    },
    subscribe: () => undefined,
    runtime: {
      async processEngineWake() {
        return { status: "idle" };
      },
      async processQueueLaneItem() {
        queueCalls += 1;
        if (queueCalls === 1) return { status: "retry", messageId: "effect-1", error: "temporary" };
        completed();
        return { status: "completed", messageId: "effect-1", appended: [] };
      },
    },
  });

  await worker.start();
  await retried;

  assert.equal(queueCalls, 2);
  worker.stop();
});

test("ordinary invoke execution is acknowledged without applying returned state", async () => {
  const blueprint = createBlueprint({
    id: "headless-counter",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
    projectionRecipes: [],
    runtime: { state: { counter: { value: 1 } } },
    cells: {
      root: {
        id: "root",
        potentialViews: { primary: { capability: "screen", region: "root" } },
        events: { save: { payloadSchema: { type: "object" } } },
        behavior: { on: { save: [{ do: "invoke", control: { tool: "saveValue" } }] } },
      },
    },
    presentation: singleSlotPresentation("root"),
  });
  const runtimeRef = ref("headless-counter");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };
  const execution = createInMemoryBlueprintExecution({
    blueprint,
    runtimeId: "headless-counter/v1",
    refs,
  });
  const runtime = createDurableRuntime({
    ...execution.runtime,
    transitionAdapter: createBlueprintDurableTransitionAdapter({ blueprint }),
  });
  const processingRuntime = createDurableRuntime({
    ...execution.runtime,
    transitionAdapter: createBlueprintDurableTransitionAdapter({ blueprint }),
    effectHandlers: {
      "*": (effect, context) => executeQueuedBlueprintEffect(
        effect as Parameters<typeof executeQueuedBlueprintEffect>[0],
        { counter: { value: 1 } },
        context.messageId,
        () => ({ ops: [{ op: "set", path: "counter.value", value: 7 }] }),
      ),
    },
    effectFailureHandler: () => [],
  });

  await runtime.initializeRuntime(refs);
  await runtime.appendJournal({ ...refs, entry: { node: "root--primary--in-root", name: "save" } });
  await processingRuntime.processEngineWake(refs);
  await processingRuntime.processQueueLaneItem(refs);
  await processingRuntime.processEngineWake(refs);
  const snapshot = await runtime.readSnapshot<Record<string, unknown>, object>(refs);
  assert.deepEqual(snapshot.state, {
    counter: { value: 1 },
    blueprintRunState: {
      cells: { root: { sources: [] } },
    },
  });
});

test("declarative service invoke settlements re-enter durable Blueprint state", async () => {
  const blueprint = createBlueprint({
    id: "service-counter",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
    projectionRecipes: [],
    runtime: { state: { counter: { value: 1 } } },
    cells: {
      root: {
        id: "root",
        potentialViews: { primary: { capability: "screen", region: "root" } },
        events: { save: { payloadSchema: { type: "object" } } },
        behavior: {
          on: {
            save: [{
              do: "invoke",
              control: { tool: "saveValue", serviceRef: "counter-service" },
            }],
          },
        },
      },
    },
    presentation: singleSlotPresentation("root"),
  });
  const runtimeRef = ref("service-counter");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };
  const execution = createInMemoryBlueprintExecution({
    blueprint,
    runtimeId: "service-counter/v1",
    refs,
  });
  const runtime = createDurableRuntime({
    ...execution.runtime,
    transitionAdapter: createBlueprintDurableTransitionAdapter({ blueprint }),
  });
  const processingRuntime = createDurableRuntime({
    ...execution.runtime,
    transitionAdapter: createBlueprintDurableTransitionAdapter({ blueprint }),
    effectHandlers: {
      "*": (effect, context) => executeQueuedBlueprintEffect(
        effect as Parameters<typeof executeQueuedBlueprintEffect>[0],
        { counter: { value: 1 } },
        context.messageId,
        () => ({ ops: [{ op: "set", path: "counter.value", value: 7 }] }),
      ),
    },
    effectFailureHandler: () => [],
  });

  await runtime.initializeRuntime(refs);
  await runtime.appendJournal({ ...refs, entry: { node: "root--primary--in-root", name: "save" } });
  await processingRuntime.processEngineWake(refs);
  await processingRuntime.processQueueLaneItem(refs);
  await processingRuntime.processEngineWake(refs);
  const snapshot = await runtime.readSnapshot<Record<string, unknown>, object>(refs);
  assert.deepEqual(snapshot.state, {
    counter: { value: 7 },
    blueprintRunState: {
      cells: { root: { sources: [] } },
    },
  });
});

test("a declarative service invoke (no sourceRequestToken) that exhausts retries now settles instead of vanishing", () => {
  // This is a plain serviceRef invoke, distinct from both a Cell source (sourceRequestToken) and
  // a "request" effect -- and its SUCCESS path (executeQueuedBlueprintEffect's isDeclarativeService
  // branch, tested above) already synthesizes a settlement event for it. This failure path had no
  // matching branch: after every retry attempt is exhausted, this exact effect fell through to
  // `return []` -- the terminal failure was silently dropped, with no settlement event, no state
  // change, and no user-facing signal of any kind.
  const effect = {
    kind: "invoke" as const,
    node: "blueprint-create",
    control: { tool: "createBlueprintDraft", serviceRef: "blueprint-studio-data" },
    data: {},
  };
  const events = queuedBlueprintEffectFailureEvents(effect, {
    messageId: "msg-1",
    attempt: 1,
    error: "Server unavailable",
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].name, "settled");
  const payload = events[0].payload as { result: { outcome: string; detail: unknown }; effect: unknown };
  assert.equal(payload.result.outcome, "failed");
  assert.deepEqual(payload.result.detail, { messageId: "msg-1", attempt: 1, error: "Server unavailable" });
  assert.deepEqual(payload.effect, effect);
});

test("void invokes are acknowledged without appending settlement receipts", async () => {
  const blueprint = createBlueprint({
    id: "void-effect",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
    projectionRecipes: [],
    runtime: { state: {} },
    cells: {
      root: {
        id: "root",
        potentialViews: { primary: { capability: "screen", region: "root" } },
        events: { save: { payloadSchema: { type: "object" } } },
        behavior: { on: { save: [{ do: "invoke", control: { tool: "saveValue" } }] } },
      },
    },
    presentation: singleSlotPresentation("root"),
  });
  const runtimeRef = ref("void-effect");
  const refs = { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef };
  const execution = createInMemoryBlueprintExecution({
    blueprint,
    runtimeId: "void-effect/v1",
    refs,
  });
  const runtime = createDurableRuntime({
    ...execution.runtime,
    transitionAdapter: createBlueprintDurableTransitionAdapter({ blueprint }),
  });
  const processingRuntime = createDurableRuntime({
    ...execution.runtime,
    transitionAdapter: createBlueprintDurableTransitionAdapter({ blueprint }),
    effectHandlers: {
      "*": (effect, context) => executeQueuedBlueprintEffect(
        effect as Parameters<typeof executeQueuedBlueprintEffect>[0],
        {},
        context.messageId,
        () => undefined,
      ),
    },
    effectFailureHandler: () => [],
  });

  await runtime.initializeRuntime(refs);
  await runtime.appendJournal({ ...refs, entry: { node: "root--primary--in-root", name: "save" } });
  await processingRuntime.processEngineWake(refs);
  await processingRuntime.processQueueLaneItem(refs);
  await processingRuntime.processEngineWake(refs);
  const snapshot = await runtime.readSnapshot<Record<string, unknown>, { settledEffectMessageIds: string[] }>(refs);
  assert.equal(snapshot.spec.settledEffectMessageIds.length, 0);
});

test("duplicate settlement receipts do not replay their follow-up events", async () => {
  const blueprint = createBlueprint({
    id: "settlement-replay",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
    projectionRecipes: [],
    runtime: { state: {} },
    cells: {
      root: {
        id: "root",
        potentialViews: { primary: { capability: "screen", region: "root" } },
        events: {
          save: { payloadSchema: { type: "object" } },
          resolved: { payloadSchema: { type: "object" } },
        },
        behavior: {
          on: {
            save: [{
              do: "request",
              control: {
                kind: "decision",
                responseSchema: {
                  type: "object",
                  required: ["approved"],
                  properties: { approved: { type: "boolean" } },
                },
              },
              data: { prompt: "Save?" },
            }],
            resolved: [{ do: "invoke", control: { tool: "saveValue" } }],
          },
        },
      },
    },
    presentation: singleSlotPresentation("root"),
  });
  const adapter = createBlueprintDurableTransitionAdapter({ blueprint });
  const started = await adapter.transition({
    state: adapter.initialState(),
    spec: adapter.initialSpec(),
    events: [{ node: "root--primary--in-root", name: "save" }],
  });
  const requestEffect = started.effects[0];
  assert.ok(requestEffect?.kind === "request" && requestEffect.effectId);
  const receipt = createBlueprintDurableEffectSettlementEvent("message-1", {
    settlement: {
      effectId: requestEffect.effectId,
      outcome: "resolved",
      data: { approved: true },
    },
  }, requestEffect);
  const first = await adapter.transition({
    state: started.state,
    spec: adapter.initialSpec(),
    events: [receipt, receipt],
  });
  const updatedSpec = adapter.applySpecUpdates({
    spec: adapter.initialSpec(),
    updates: first.specUpdates ?? [],
  });
  const replay = await adapter.transition({
    state: first.state,
    spec: updatedSpec,
    events: [receipt],
  });

  assert.equal(first.effects.length, 1);
  assert.equal(replay.effects.length, 0);
});

test("durable source state promotes only the latest pending request and rejects stale callbacks", async () => {
  const blueprint = createBlueprint({
    id: "durable-source-queue",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program" , capabilities: []}],
    projectionRecipes: [],
    services: {
      work: {
        kind: "test-service",
        version: "1",
        operations: { run: { operation: "run", contract: "work/v1" } },
      },
    },
    runtime: {
      state: { work: { request: null, result: null } },
    },
    cells: {
      controls: {
        id: "controls",
        potentialViews: { primary: { capability: "screen", region: "controls" } },
        inputs: [{ token: "work.request", as: "request" }],
        compute: [{ id: "request", expression: "inputs.request", assign: "request" }],
        outputs: [{ token: "request", from: "request" }],
        events: { request: { payloadSchema: { type: "object" } } },
        behavior: {
          on: {
            request: [{ do: "assign", target: "work.request", args: { from: "$event.request" } }],
          },
        },
      },
      worker: {
        id: "worker",
        inputs: [{ token: "request", required: true }],
        sources: [{ id: "worker.source", service: "work", operation: "run" }],
      },
    },
    presentation: singleSlotPresentation("controls"),
  });
  const adapter = createBlueprintDurableTransitionAdapter({ blueprint });
  const spec = adapter.initialSpec();

  const started = await adapter.transition({
    state: adapter.initialState(),
    spec,
    events: [{ node: "controls--primary--in-controls", name: "request", payload: { request: { id: "A" } } }],
  });
  assert.equal(started.effects.length, 1);
  const activeEffect = started.effects[0];
  assert.ok(activeEffect.kind === "invoke" && activeEffect.control.sourceRequestToken);
  const startedRunState = started.state.blueprintRunState as unknown as BlueprintRunState;
  assert.equal(projectCellRunState(startedRunState.cells.worker).numSourcesRunning, 1);
  assert.equal(Object.hasOwn(startedRunState.cells.worker, "numSourcesRunning"), false);

  const queuedB = await adapter.transition({
    state: started.state,
    spec,
    events: [{ node: "controls--primary--in-controls", name: "request", payload: { request: { id: "B" } } }],
  });
  const queuedC = await adapter.transition({
    state: queuedB.state,
    spec,
    events: [{ node: "controls--primary--in-controls", name: "request", payload: { request: { id: "C" } } }],
  });
  assert.equal(queuedB.effects.length, 0);
  assert.equal(queuedC.effects.length, 0);

  const promoted = await adapter.transition({
    state: queuedC.state,
    spec,
    events: [createBlueprintDurableEffectSettlementEvent(
      "message-A",
      { ops: [{ op: "set", path: "work.result", value: "A" }] },
      activeEffect,
    )],
  });
  assert.equal(promoted.effects.length, 1);
  assert.notEqual(
    promoted.effects[0].kind === "invoke" && promoted.effects[0].control.sourceRequestToken,
    activeEffect.kind === "invoke" && activeEffect.control.sourceRequestToken,
  );
  assert.equal((promoted.state.work as { result: string }).result, "A");
  const promotedRunState = promoted.state.blueprintRunState as unknown as BlueprintRunState;
  assert.equal(projectCellRunState(promotedRunState.cells.worker).numSourcesRunning, 1);
  assert.equal(Object.hasOwn(promotedRunState.cells.worker, "numSourcesRunning"), false);

  const stale = await adapter.transition({
    state: promoted.state,
    spec,
    events: [createBlueprintDurableEffectSettlementEvent(
      "message-A-stale",
      { ops: [{ op: "set", path: "work.result", value: "stale" }] },
      activeEffect,
    )],
  });
  assert.equal(stale.effects.length, 0);
  assert.equal((stale.state.work as { result: string }).result, "A");
});