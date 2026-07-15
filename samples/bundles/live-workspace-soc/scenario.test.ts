import assert from "node:assert/strict";
import { test } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";

import document from "./document.json";
import effects from "./effect_handlers/index";
import manifest from "./manifest.json";
import state from "./state.json";

function runtime() {
  return loadBundleRuntime(bundleFromJson({ manifest, document, state }, { effectHandlers: effects }));
}

test("presenter pace changes one timer and suppresses duplicate act requests", async () => {
  const { controller, state: store } = runtime();
  await controller.start();
  const emit = (name: string, payload: Record<string, unknown> = {}) =>
    controller.emit("soc-workspace", name, payload);

  await emit("setPace", { pace: "auto" });
  assert.deepEqual(store.get("soc.presenter"), {
    pace: "auto",
    durationMs: 2000,
    locked: false,
    advanceToken: 0,
  });

  await controller.emit("next-act-timer-region", "press", { reason: "manual" });
  assert.deepEqual(store.get("soc.presenter"), {
    pace: "auto",
    durationMs: 2000,
    locked: true,
    advanceToken: 1,
  });

  await controller.emit("next-act-timer-region", "press", { reason: "timeout" });
  assert.equal((store.get("soc.presenter") as { advanceToken: number }).advanceToken, 1);

  await emit("finishAct");
  assert.equal((store.get("soc.presenter") as { locked: boolean }).locked, false);
  await emit("reset");
  assert.deepEqual(store.get("soc.presenter"), {
    pace: "manual",
    durationMs: 120000,
    locked: false,
    advanceToken: 0,
  });
});

test("presentation context changes projection metadata without changing the causal journal", async () => {
  const { controller, state: store } = runtime();
  await controller.start();
  const journalBefore = store.get("soc.journal");

  await controller.emit("soc-workspace", "setPresentationContext", {
    contextId: "priya-laptop",
  });

  const presentation = store.get("soc.presentation") as {
    selectedContext: string;
    revision: number;
  };
  assert.equal(presentation.selectedContext, "priya-laptop");
  assert.equal(presentation.revision, 1);
  assert.deepEqual(store.get("soc.journal"), journalBefore);
});

test("mixed-team scenario preserves attributable steps and commander authority", async () => {
  const { controller, state: store } = runtime();
  await controller.start();
  const emit = (name: string, actorId: string) => controller.emit("soc-workspace", name, {}, actorId);

  await emit("establishIntent", "human-morgan");
  await emit("addConstraint", "human-priya");
  await emit("suggestExploration", "agent-correlation");
  await emit("amendExploration", "human-morgan");
  await emit("replanExploration", "agent-correlation");
  await emit("commitPartialFindings", "agent-correlation");
  await emit("proposeDc01", "agent-response");
  await emit("completeCorrelation", "agent-correlation");
  await emit("proposeHostA", "agent-response");
  await emit("reviseResponse", "human-morgan");
  await emit("calculateResponse", "agent-response");
  await emit("recommendContainment", "human-morgan");

  assert.equal((store.get("soc.proposal") as { target: string }).target, "Host-A");
  assert.equal((store.get("soc.authorization") as { status: string }).status, "pending");
  assert.equal((store.get("soc.journal") as unknown[]).length, 12);

  await emit("authorizeContainment", "human-morgan");
  assert.equal((store.get("soc.authorization") as { status: string }).status, "pending");

  await emit("authorizeContainment", "human-priya");
  assert.equal((store.get("soc.authorization") as { status: string; actorId: string }).actorId, "human-priya");
  await emit("executeContainment", "agent-response");

  assert.equal(store.get("soc.incident.status"), "Contained");
  const journal = store.get("soc.journal") as Array<{ actorId: string; result: string }>;
  assert.deepEqual(journal.slice(-2).map(({ actorId, result }) => ({ actorId, result })), [
    { actorId: "human-priya", result: "authorized" },
    { actorId: "agent-response", result: "executed" },
  ]);
});