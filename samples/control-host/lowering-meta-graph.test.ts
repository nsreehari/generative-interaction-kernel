import assert from "node:assert/strict";
import { test } from "vitest";
import { prepareBlueprintProgram, runTransition } from "@gik/blueprint";
import { compilerBlueprint, runLoweringMetaGraph } from "./lowering-meta-graph";

test("ADR-0044: transform Cells settle via runTransition once the bootstrap event lands, artifact withheld pre-approval", async () => {
  const blueprint = compilerBlueprint();
  const { initialState } = prepareBlueprintProgram(blueprint);

  const bootstrapped = await runTransition({
    state: initialState,
    blueprint,
    events: [{ node: "agent-tier", name: "start" }],
  });

  // transform Cells resolve without any approval — pure JSONata compute, same as any
  // application Blueprint's compute Cells.
  const rows = bootstrapped.state.presentation?.rows as unknown[];
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows.length, 3);
  assert.deepEqual({ ...(bootstrapped.state.presentation?.summary as object) }, {
    findingCount: 3,
    riskFlagCount: 1,
    hasRisk: true,
  });

  // emit-blueprint withholds the terminal artifact until the approve gate (the Kernel's
  // existing `confirm` verb) resolves.
  assert.equal(bootstrapped.state.compiled?.artifact, undefined);
});

test("ADR-0044: runLoweringBlueprint drives a Lowering Cell meta-graph through approval as an ordinary Blueprint transition", async () => {
  const result = await runLoweringMetaGraph("approved");

  // After `confirm` resolves "approved" (via the standard confirmOutcomeEvent follow-up),
  // the terminal artifact is emitted — proving transform + approve + emit-blueprint all run
  // on the same Kernel machinery an application Blueprint already uses.
  const artifact = result.artifactAfterApproval as {
    subject: string;
    rows: unknown[];
    summary: { findingCount: number; riskFlagCount: number; hasRisk: boolean };
  };
  assert.equal(artifact.subject, "Acme Robotics Inc.");
  assert.equal(artifact.rows.length, 3);
  assert.equal(artifact.summary.findingCount, 3);
});

test("ADR-0044: runLoweringBlueprint withholds the artifact when the approval callback denies", async () => {
  const result = await runLoweringMetaGraph("denied");
  assert.equal(result.artifactAfterApproval, undefined);
});
