import assert from "node:assert/strict";
import { test } from "vitest";
import { prepareBlueprintProgram, runTransition, validateLoweringCellGraph, type BlueprintDefinition } from "@gik/blueprint";
import type { Json } from "@gik/kernel";
import { compilerBlueprint, loweringCellGraph, runDueDiligenceLoweringPipeline, runLoweringMetaGraph } from "./lowering-meta-graph";

test("ADR-0045: transform Cells settle during initial synchronization, artifact withheld pre-approval", async () => {
  const blueprint = compilerBlueprint();
  const { initialState } = prepareBlueprintProgram(blueprint);

  const synchronized = await runTransition({
    state: initialState,
    blueprint,
    events: [],
  });

  // transform Cells resolve without any approval — pure JSONata compute, same as any
  // application Blueprint's compute Cells.
  const presentation = synchronized.state.presentation as Record<string, Json>;
  const compiled = synchronized.state.compiled as Record<string, Json>;
  const rows = presentation.rows as unknown[];
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows.length, 3);
  assert.deepEqual({ ...(presentation.summary as object) }, {
    findingCount: 3,
    riskFlagCount: 1,
    hasRisk: true,
  });

  // emit-blueprint withholds the terminal artifact until the approve gate (the Kernel's
  // existing `request` verb) resolves.
  assert.equal(compiled.artifact, null);
});

test("ADR-0045: runLoweringBlueprint drives a Lowering Cell meta-graph through approval as an ordinary Blueprint transition", async () => {
  const result = await runLoweringMetaGraph("approved");

  // After the decision request settles as resolved, the
  // terminal artifact is emitted — proving transform + approve + emit-blueprint all run on the
  // same Kernel machinery an application Blueprint already uses. The artifact is itself a real
  // tier-2 `BlueprintDefinition` (Phase 3), not application data the host must further wrap.
  const artifact = result.artifactAfterApproval as BlueprintDefinition;
  const report = artifact.runtime?.state?.report as {
    subject: string;
    rows: unknown[];
    summary: { findingCount: number; riskFlagCount: number; hasRisk: boolean };
  };
  assert.equal(report.subject, "Acme Robotics Inc.");
  assert.equal(report.rows.length, 3);
  assert.equal(report.summary.findingCount, 3);
});

test("ADR-0045: runLoweringBlueprint withholds the artifact when the approval callback denies", async () => {
  const result = await runLoweringMetaGraph("denied");
  assert.equal(result.artifactAfterApproval, null);
});

test("ADR-0045 Phase 3: the emitted tier-2 artifact validates and opens through the existing, unchanged openBlueprint path", async () => {
  const runtime = await runDueDiligenceLoweringPipeline("approved");

  assert.equal(runtime.blueprintId, "due-diligence-report");
  const report = runtime.state.report as {
    subject: string;
    rows: unknown[];
    summary: { findingCount: number; riskFlagCount: number; hasRisk: boolean };
  };
  assert.equal(report.subject, "Acme Robotics Inc.");
  assert.equal(report.rows.length, 3);
  assert.equal(report.summary.findingCount, 3);
});

test("ADR-0045 Phase 3: withheld approval means there is no artifact to open", async () => {
  await assert.rejects(() => runDueDiligenceLoweringPipeline("denied"));
});

test("ADR-0045 Phase 4: validateLoweringCellGraph reports no drift for the compiler Blueprint as authored", () => {
  const issues = validateLoweringCellGraph(loweringCellGraph(), compilerBlueprint().payload.cells ?? {});
  assert.deepEqual(issues, []);
});

test("ADR-0045 Phase 4: validateLoweringCellGraph catches a declared Lowering Cell missing from the runtime Blueprint", () => {
  const { cells } = compilerBlueprint().payload;
  const { "transform-summary": _dropped, ...cellsMissingTransformSummary } = cells ?? {};
  const issues = validateLoweringCellGraph(loweringCellGraph(), cellsMissingTransformSummary);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].cellId, "transform-summary");
});

test("ADR-0045 Phase 4: validateLoweringCellGraph catches a declared port token missing from the runtime Cell", () => {
  const { cells } = compilerBlueprint().payload;
  const declared = loweringCellGraph().map((cell) =>
    cell.id === "emit-blueprint" ? { ...cell, outputs: [{ token: "compiled:artifact-renamed", artifactType: "BlueprintDefinition" }] } : cell,
  );
  const issues = validateLoweringCellGraph(declared, cells ?? {});
  assert.equal(issues.length, 1);
  assert.equal(issues[0].cellId, "emit-blueprint");
});
