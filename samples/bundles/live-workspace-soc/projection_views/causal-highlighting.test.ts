import assert from "node:assert/strict";
import { test } from "vitest";

import { isCausallyAffected } from "./index";

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
