import assert from "node:assert/strict";
import { test } from "vitest";

import { InMemoryStateModel, type OrchestratorEffect } from "@gik/kernel";
import { createEffectDispatcher } from "../src/primitives/effects";

test("named route and confirm handlers receive actor provenance", async () => {
  const state = new InMemoryStateModel(["demo"]);
  const calls: Array<{ kind: string; actorId?: string }> = [];
  const orchestrator = createEffectDispatcher(state, {
    policy(ctx) {
      calls.push({ kind: "route", actorId: ctx.actorId });
    },
    approval(ctx) {
      calls.push({ kind: "confirm", actorId: ctx.actorId });
    },
  });

  await orchestrator.route?.({
    kind: "route",
    node: "proposal",
    actorId: "agent-response",
    tool: "policy",
    to: "contain",
    args: {},
  } satisfies OrchestratorEffect);
  await orchestrator.confirm?.({
    kind: "confirm",
    node: "proposal",
    actorId: "agent-response",
    tool: "approval",
    args: {},
  } satisfies OrchestratorEffect);

  assert.deepEqual(calls, [
    { kind: "route", actorId: "agent-response" },
    { kind: "confirm", actorId: "agent-response" },
  ]);
});