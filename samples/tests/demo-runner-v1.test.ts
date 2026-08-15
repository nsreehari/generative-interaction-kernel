import assert from "node:assert/strict";
import { test } from "vitest";
import type { Json, OrchestratorResult, PatchOp } from "@gik/kernel";
import { createDemoRunnerEffectHandlersV1 } from "../../packages/demo-runner-host/src/demoRunnerEffectHandlersV1";

const act = (id: string) => ({
  kind: "act",
  id,
  participantId: "raam",
  shortDescription: id,
  event: { gik: "0.1", type: "event", payload: { node: "holdings", name: "save", payload: { id } } },
});

function runnerState(sequence: Json[]): Map<string, Json> {
  return new Map<string, Json>([
    ["runner.currentEntryIndex", 0],
    ["runner.scenario", {
      id: "portfolio",
      shortDescription: "Portfolio",
      resetBlueprintStateAtStart: true,
      participants: {},
      sequence,
    }],
    ["runner.scenarios", []],
    ["runner.execution", {
      resetBlueprintStateAtStartApplied: false,
      completedEntryIds: [],
      journal: [],
    }],
    ["runner.externalContext", { marketMode: "mock" }],
    ["runner.namedPresetContexts", []],
  ]);
}

function context(state: Map<string, Json>, data: Record<string, Json> = {}) {
  return {
    get: (path: string) => state.get(path) ?? null,
    data,
  } as never;
}

function applyResult(state: Map<string, Json>, result: OrchestratorResult | void): void {
  for (const operation of result?.ops ?? []) {
    const patch = operation as PatchOp & { path?: string; value?: Json };
    if (patch.op === "set" && patch.path) state.set(patch.path, structuredClone(patch.value ?? null));
  }
}

test("runner executes acts separately and automatically consumes waits and observations", async () => {
  const state = runnerState([
    act("add-msft"),
    act("add-nvda"),
    { kind: "wait", id: "wait-prices", when: "$state.ready = true" },
    { kind: "observe", id: "observe-summary", select: { summary: "$state.summary" } },
  ] as Json[]);
  const transitions: string[] = [];
  const handlers = createDemoRunnerEffectHandlersV1({
    runTransition: (event) => { transitions.push(`${event.payload.node}:${event.payload.name}`); },
    getExpressionScope: () => ({ state: { ready: true, summary: { marketValue: 42 } } }),
    waitUntil: async (predicate) => {
      const scope = { state: { ready: true, summary: { marketValue: 42 } } };
      assert.equal(await predicate(scope), true);
      return scope;
    },
    setExternalContext: () => undefined,
  });

  applyResult(state, await handlers.runSequenceEntry(context(state)) as OrchestratorResult);
  assert.equal(state.get("runner.currentEntryIndex"), 1);
  applyResult(state, await handlers.runSequenceEntry(context(state)) as OrchestratorResult);

  assert.deepEqual(transitions, [
    "demo-host:reset-state",
    "holdings:save",
    "holdings:save",
  ]);
  assert.equal(state.get("runner.currentEntryIndex"), 4);
  const execution = state.get("runner.execution") as unknown as {
    completedEntryIds: string[];
    journal: Array<{ id: string; status: string; observations?: Record<string, Json> }>;
  };
  assert.deepEqual(execution.completedEntryIds, ["add-msft", "add-nvda", "wait-prices", "observe-summary"]);
  assert.equal(execution.journal.every(({ status }) => status === "completed"), true);
  assert.deepEqual(execution.journal.at(-1)?.observations, { summary: { marketValue: 42 } });
});

test("runner records a failed Journal entry when an act rejects", async () => {
  const state = runnerState([act("broken-act")] as Json[]);
  const handlers = createDemoRunnerEffectHandlersV1({
    runTransition: (event) => {
      if (event.payload.node !== "demo-host") throw new Error("service rejected");
    },
    getExpressionScope: () => ({}),
    waitUntil: async () => ({}),
    setExternalContext: () => undefined,
  });

  const result = await handlers.runSequenceEntry(context(state)) as OrchestratorResult;
  applyResult(state, result);
  assert.equal(result.outcome, "failed");
  assert.deepEqual(result.detail, { message: "service rejected" });
  const execution = state.get("runner.execution") as unknown as { journal: Array<{ status: string }> };
  assert.equal(execution.journal[0]?.status, "failed");
  assert.equal(state.get("runner.currentEntryIndex"), 0);
});

test("runner records a failed Journal entry when a wait rejects", async () => {
  const state = runnerState([{ kind: "wait", id: "broken-wait", when: "$state.ready" }] as Json[]);
  const handlers = createDemoRunnerEffectHandlersV1({
    runTransition: () => undefined,
    getExpressionScope: () => ({}),
    waitUntil: async () => { throw new Error("wait evaluation failed"); },
    setExternalContext: () => undefined,
  });

  const result = await handlers.runSequenceEntry(context(state)) as OrchestratorResult;
  applyResult(state, result);
  assert.equal(result.outcome, "failed");
  assert.deepEqual(result.detail, { message: "wait evaluation failed" });
  const execution = state.get("runner.execution") as unknown as { journal: Array<{ kind: string; status: string }> };
  assert.equal(execution.journal[0]?.kind, "wait");
  assert.equal(execution.journal[0]?.status, "failed");
});

function cancellableWait(signal?: AbortSignal): Promise<Record<string, Json>> {
  return new Promise((_, reject) => {
    const cancel = () => reject(signal?.reason ?? new DOMException("cancelled", "AbortError"));
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
}

test.each([
  ["reset", async (handlers: ReturnType<typeof createDemoRunnerEffectHandlersV1>, state: Map<string, Json>) => handlers.resetRunner(context(state))],
  ["scenario change", async (handlers: ReturnType<typeof createDemoRunnerEffectHandlersV1>, state: Map<string, Json>) => {
    state.set("runner.scenarios", [{ id: "other", shortDescription: "Other", participants: {}, sequence: [] }]);
    return handlers.selectScenario(context(state, { value: "other" }));
  }],
  ["context change", async (handlers: ReturnType<typeof createDemoRunnerEffectHandlersV1>, state: Map<string, Json>) => {
    state.set("runner.namedPresetContexts", [{ id: "live", context: { marketMode: "live" } }]);
    return handlers.applyNamedContext(context(state, { value: "live" }));
  }],
] as const)("%s cancels an active wait without completing stale progress", async (_name, cancel) => {
  const state = runnerState([{ kind: "wait", id: "wait-forever", when: "false" }] as Json[]);
  const handlers = createDemoRunnerEffectHandlersV1({
    runTransition: () => undefined,
    getExpressionScope: () => ({}),
    waitUntil: (_predicate, signal) => cancellableWait(signal),
    setExternalContext: () => undefined,
  });

  const running = handlers.runSequenceEntry(context(state));
  const cancellation = await cancel(handlers, state);
  const result = await running as OrchestratorResult;

  assert.equal(result.outcome, "cancelled");
  assert.equal((cancellation as OrchestratorResult).outcome === "updated"
    || (cancellation as OrchestratorResult).outcome === "selected"
    || (cancellation as OrchestratorResult).outcome === "reset", true);
  assert.equal(state.get("runner.currentEntryIndex"), 0);
});