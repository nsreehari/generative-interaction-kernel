import assert from "node:assert/strict";
import { test } from "vitest";
import { runLoweringMetaGraphSpike } from "./lowering-meta-graph-spike";

test("ADR-0044 spike: a Lowering Cell meta-graph runs as an ordinary Blueprint on the same Kernel", async () => {
  const result = await runLoweringMetaGraphSpike();

  // transform Cells resolve without any approval — pure JSONata compute, same as any
  // application Blueprint's compute Cells.
  assert.equal(Array.isArray(result.rowsBeforeApproval), true);
  assert.equal((result.rowsBeforeApproval as unknown[]).length, 3);
  assert.deepEqual({ ...(result.summaryBeforeApproval as object) }, {
    findingCount: 3,
    riskFlagCount: 1,
    hasRisk: true,
  });

  // emit-blueprint withholds the terminal artifact until the approve gate (the Kernel's
  // existing `confirm` verb) resolves.
  assert.equal(result.artifactBeforeApproval, undefined);

  // After `confirm` resolves "approved" (via the standard confirmOutcomeEvent follow-up),
  // the terminal artifact is emitted — proving transform + approve + emit-blueprint all run
  // on the same Kernel/Face machinery an application Blueprint already uses.
  const artifact = result.artifactAfterApproval as {
    subject: string;
    rows: unknown[];
    summary: { findingCount: number; riskFlagCount: number; hasRisk: boolean };
  };
  assert.equal(artifact.subject, "Acme Robotics Inc.");
  assert.equal(artifact.rows.length, 3);
  assert.equal(artifact.summary.findingCount, 3);
});
