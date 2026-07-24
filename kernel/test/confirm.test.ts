// ADR-0019: the human-in-the-loop `confirm` contract. Verifies the standardized prompt
// reader, the outcome->event mapping (approved -> "confirmed", others -> "dismissed"), and
// an end-to-end round-trip where an Orchestrator resolves a confirmation and the follow-up
// event drives a store write inside the same dispatch.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  CONFIRM_APPROVED_EVENT,
  CONFIRM_DISMISSED_EVENT,
  InMemoryStateModel,
  Kernel,
  assign,
  confirmOutcomeEvent,
  confirmPrompt,
  node,
  type ProjectedVocabularyManifest,
  type Orchestrator,
  type OrchestratorEffect,
} from "../src/index";

const effect: OrchestratorEffect = {
  kind: "confirm",
  node: "btn",
  args: { title: "Delete?", message: "This cannot be undone.", danger: true, timeoutMs: 5000 },
  payload: { id: "row-7" },
};

test("confirmPrompt reads the standardized fields from a confirm effect", () => {
  assert.deepEqual(confirmPrompt(effect), {
    title: "Delete?",
    message: "This cannot be undone.",
    danger: true,
    timeoutMs: 5000,
  });
});

test("approved -> 'confirmed' event; every other outcome -> 'dismissed'", () => {
  const approved = confirmOutcomeEvent(effect, "approved");
  assert.equal(approved.name, CONFIRM_APPROVED_EVENT);
  assert.deepEqual(approved.payload, { id: "row-7", outcome: "approved", confirmed: true });

  for (const outcome of ["denied", "cancelled", "timeout"] as const) {
    const ev = confirmOutcomeEvent(effect, outcome);
    assert.equal(ev.name, CONFIRM_DISMISSED_EVENT, `${outcome} dismisses`);
    assert.equal(ev.payload?.confirmed, false);
    assert.equal(ev.payload?.outcome, outcome);
    assert.equal(ev.node, "btn");
  }
});

const manifest = {
  gik: "0.1",
  type: "vocabulary",
  payload: {
    version: "confirm-demo/1.0",
    expression: "jsonata",
    namespaces: ["card_data"],
    capabilities: { button: { emits: ["tap"] } },
  } as ProjectedVocabularyManifest,
};

const document = {
  gik: "0.1",
  type: "program",
  payload: {
    root: node("button", "btn", {
      on: {
        tap: [{ do: "confirm", args: { message: "Approve order?" } }],
        confirmed: [assign("card_data.status", "approved")],
        dismissed: [assign("card_data.status", "rejected")],
      },
    }),
  },
};

function kernelWithOutcome(outcome: "approved" | "denied") {
  const orchestrator: Orchestrator = {
    async confirm(e) {
      return { events: [confirmOutcomeEvent(e, outcome)] };
    },
  };
  const state = new InMemoryStateModel(["card_data"]);
  return new Kernel(manifest, document, { state, orchestrator });
}

test("approval round-trip: tap -> confirm effect -> 'confirmed' -> store write, one rev", async () => {
  const k = kernelWithOutcome("approved");
  k.init();
  const patch = await k.dispatch({ node: "btn", name: "tap" });
  assert.equal(patch.rev, 1);
  assert.deepEqual(patch.ops, [{ op: "set", path: "card_data.status", value: "approved" }]);
});

test("denial round-trip: a non-approval routes through 'dismissed'", async () => {
  const k = kernelWithOutcome("denied");
  k.init();
  const patch = await k.dispatch({ node: "btn", name: "tap" });
  assert.deepEqual(patch.ops, [{ op: "set", path: "card_data.status", value: "rejected" }]);
});
