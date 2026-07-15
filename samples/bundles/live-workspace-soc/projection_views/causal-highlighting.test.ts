import assert from "node:assert/strict";
import { test } from "vitest";

import { isCausallyAffected, participantPresence, socPresentationSpec } from "./index";

const entry = {
  id: "j-07",
  time: "09:42:24",
  actorId: "agent-response",
  result: "rejected+fallback",
  summary: "Blocked DC-01 isolation and applied safe fallback",
  affected: ["proposal-dc01", "DC-01", "Host-A"],
};

test("causal matching uses journal affected identifiers", () => {
  assert.equal(isCausallyAffected(entry, ["proposal-dc01"]), true);
  assert.equal(isCausallyAffected(entry, ["DC-01"]), true);
  assert.equal(isCausallyAffected(entry, ["unrelated-object"]), false);
});

test("aggregate workspace aliases match any represented causal object", () => {
  assert.equal(
    isCausallyAffected(entry, ["proposal-dc01", "proposal-host-a", "rec-1", "authorization"]),
    true
  );
  assert.equal(isCausallyAffected(undefined, ["proposal-dc01"]), false);
});

test("participant statuses map to a stable presence vocabulary", () => {
  assert.equal(participantPresence("working"), "working");
  assert.equal(participantPresence("waiting"), "waiting");
  assert.equal(participantPresence("needs-review"), "input-awaited");
  assert.equal(participantPresence("sleeping"), "sleeping");
  assert.equal(participantPresence("complete"), "complete");
  assert.equal(participantPresence("unexpected"), "active");
});

test("presentation contexts produce distinct substrate frames and disclosure", () => {
  const full = socPresentationSpec("full-substrate");
  const mobile = socPresentationSpec("priya-mobile");
  const pager = socPresentationSpec("morgan-pager");
  const correlation = socPresentationSpec("correlation-agent");

  assert.equal(full.frame, "shared");
  assert.equal(full.arrangement, "inspection");
  assert.equal(full.regions.includes("exploration"), true);
  assert.equal(mobile.frame, "mobile");
  assert.equal(mobile.arrangement, "decision");
  assert.equal(mobile.regions.includes("exploration"), false);
  assert.equal(mobile.regions.includes("authorization"), true);
  assert.deepEqual(mobile.regions, ["summary", "authorization", "response", "constraints", "hypothesis"]);
  assert.deepEqual(pager.regions, ["summary", "hypothesis", "response"]);
  assert.deepEqual(correlation.regions, ["summary", "intent", "constraints", "hypothesis", "agent-request", "exploration", "evidence", "causal-record"]);
});
