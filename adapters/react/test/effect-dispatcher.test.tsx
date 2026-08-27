import assert from "node:assert/strict";
import { test } from "vitest";

import {
  InMemoryStateModel,
  type InvocationControl,
  type OrchestratorEffect,
  type OrchestratorProgress,
  type OrchestratorResult,
} from "@gik-ai/kernel";
import { createEffectDispatcher } from "../src/primitives/effects";

test("named route and request handlers receive actor provenance", async () => {
  const state = new InMemoryStateModel(["demo"]);
  const calls: Array<{ kind: string; actorId?: string }> = [];
  const orchestrator = createEffectDispatcher(state, {
    policy(ctx) {
      calls.push({ kind: "route", actorId: ctx.actorId });
    },
    approval(ctx) {
      calls.push({ kind: "request", actorId: ctx.actorId });
    },
  });

  await orchestrator.route?.({
    kind: "route",
    node: "proposal",
    actorId: "agent-response",
    control: { to: "policy" },
    data: {},
  } satisfies OrchestratorEffect);
  await orchestrator.request?.({
    kind: "request",
    node: "proposal",
    actorId: "agent-response",
    control: { kind: "decision", policy: "approval", responseSchema: { type: "object" } },
    data: {},
  } satisfies OrchestratorEffect);

  assert.deepEqual(calls, [
    { kind: "route", actorId: "agent-response" },
    { kind: "request", actorId: "agent-response" },
  ]);
});

test("named invoke handlers receive invocation control", async () => {
  const state = new InMemoryStateModel(["demo"]);
  const controller = new AbortController();
  const progress: OrchestratorProgress[] = [];
  const settlements: OrchestratorResult[] = [];
  const control: InvocationControl = {
    id: "inv-test",
    signal: controller.signal,
    emitProgress: async (message) => {
      progress.push(message);
    },
    emit: async (result = {}) => {
      settlements.push(result);
    },
  };
  const orchestrator = createEffectDispatcher(state, {
    async download(ctx) {
      assert.equal(ctx.invocationId, "inv-test");
      assert.equal(ctx.signal, controller.signal);
      await ctx.emitProgress?.({ name: "download-progress", detail: { percent: 25 } });
      await ctx.emit?.({ outcome: "stream-complete" });
    },
    legacy(ctx) {
      return { ops: [ctx.set("demo.result", "done")] };
    },
  });

  const controlledResult = await orchestrator.invoke?.({
    kind: "invoke",
    node: "download",
    control: { tool: "download" },
    data: {},
  }, control);
  const legacyResult = await orchestrator.invoke?.({
    kind: "invoke",
    node: "legacy",
    control: { tool: "legacy" },
    data: {},
  }, control);

  assert.deepEqual(progress, [{ name: "download-progress", detail: { percent: 25 } }]);
  assert.deepEqual(settlements, [{ outcome: "stream-complete" }]);
  assert.equal(controlledResult, undefined);
  assert.deepEqual(legacyResult, { ops: [{ op: "set", path: "demo.result", value: "done" }] });
});