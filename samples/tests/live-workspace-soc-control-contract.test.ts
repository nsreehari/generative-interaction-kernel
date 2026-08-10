import assert from "node:assert/strict";
import { test } from "vitest";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import { createHeadlessControlRuntime } from "./support/control-runtime";
import { openSampleBlueprint } from "../shared/blueprint-catalog";
import effects from "../blueprints/live-workspace-soc/native/effect_handlers/liveWorkspaceSocEffectHandlers";
import { socControlContract } from "../blueprints/live-workspace-soc/native/projection_views/control-contract";

function headlessSoc() {
  const { vocabulary, program, state } = openSampleBlueprint("live-workspace-soc");
  const runtime = loadBundleRuntime(bundleFromJson({
    vocabulary: structuredClone(vocabulary),
    program: structuredClone(program),
    state: structuredClone(state),
  }, { effectHandlers: effects }));
  return createHeadlessControlRuntime(runtime, socControlContract);
}

test("headless control dispatch executes the organism and returns its receipt", async () => {
  const control = headlessSoc();
  const receipt = await control.dispatch({
    id: "headless:establish-intent:1",
    targetBlueprintId: "live-workspace-soc",
    token: 1,
    command: "establishIntent",
    actorId: "human-morgan",
  });

  assert.equal(receipt.status, "completed");
  assert.equal(receipt.outcome, "committed");
  assert.equal(receipt.result?.actorId, "human-morgan");
  assert.equal((control.snapshot().soc as Record<string, unknown>).stage, "Human intent and constraint");
});

test("headless control rejects incompatible blueprints and unknown commands", async () => {
  const control = headlessSoc();
  const incompatible = await control.dispatch({
    id: "headless:wrong:1",
    targetBlueprintId: "other-organism",
    token: 1,
    command: "establishIntent",
  });
  const unsupported = await control.dispatch({
    id: "headless:unknown:2",
    targetBlueprintId: "live-workspace-soc",
    token: 2,
    command: "unknown",
  });

  assert.equal(incompatible.outcome, "incompatible-blueprint");
  assert.equal(unsupported.outcome, "unsupported-command");
});

test("headless control rejects human-gated commands instead of dispatching them", async () => {
  const control = headlessSoc();
  const receipt = await control.dispatch({
    id: "headless:authorize:1",
    targetBlueprintId: "live-workspace-soc",
    token: 1,
    command: "authorizeContainment",
    actorId: "human-priya",
  });

  assert.equal(receipt.status, "rejected");
  assert.equal(receipt.outcome, "human-authorization-required");
});
