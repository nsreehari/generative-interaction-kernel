import assert from "node:assert/strict";
import { test } from "vitest";

import { buildAgentInstructions, parseSocAgentReply } from "./live-agent";

const correlationReply = {
  schemaVersion: 1,
  operation: "suggest-exploration",
  summary: "Correlate the supplied sources.",
  rationale: "The execution origin is unresolved.",
  exploration: { objective: "Resolve execution origin", queries: ["Correlate token and session"], constraints: ["Passive only"] },
  findings: [],
  evidenceIds: [],
  entityIds: ["DC-01", "Host-A"],
  confidence: 0.6,
  unknowns: ["Execution host"],
  recommendedNextStep: "Run passive correlation",
};

test("accepts the exact correlation operation contract", () => {
  assert.deepEqual(parseSocAgentReply(JSON.stringify(correlationReply), "suggest-exploration"), correlationReply);
});

test("rejects fenced output, wrong operations, and authority-bearing extra fields", () => {
  assert.throws(() => parseSocAgentReply(`\`\`\`json\n${JSON.stringify(correlationReply)}\n\`\`\``, "suggest-exploration"));
  assert.throws(() => parseSocAgentReply(JSON.stringify({ ...correlationReply, operation: "complete-correlation" }), "suggest-exploration"));
  assert.throws(() => parseSocAgentReply(JSON.stringify({ ...correlationReply, authorization: "approved" }), "suggest-exploration"));
});

test("per-turn instructions preserve the governance boundary", () => {
  const instructions = buildAgentInstructions("validate-response");
  assert.match(instructions, /validate-response/);
  assert.match(instructions, /Do not authorize, execute/);
});