// ADR-0045 Phase 2/3: a Lowering Cell meta-graph (transform / approve / emit-blueprint) running
// as an ordinary Blueprint on the shared Kernel via the `runTransition` / `runLoweringBlueprint`
// host-side primitives — no new execution engine, no bespoke ControlFace/StateModel wiring.
//
// Scenario: lower a "tier 1" artifact (research findings sourced from an agent) into a
// "tier 2" artifact — a real, standalone presentation `BlueprintArtifact` — through a compiler
// Blueprint whose Cells are: two `transform` Cells (JSONata `compute`), one `approve` gate (the
// Kernel's existing `confirm` action verb), and one `emit-blueprint` Cell that only resolves
// once approval has landed. Phase 3 proves ADR-0045's core claim: the emitted artifact is
// handed to the existing, unchanged `openBlueprint` path — compiling and running stay two
// distinct Kernel instances, and the compiler never gains direct execution authority over the
// artifact it produces.
//
// Run: npx vitest run samples/control-host/lowering-meta-graph.test.ts --project samples

import { createBlueprint, defineLoweringCell, runLoweringBlueprint, validateLoweringCellGraph, type BlueprintArtifact, type BlueprintDefinition, type LoweringCellDefinition } from "@gik/blueprint";
import { openBlueprint, type BlueprintRuntime } from "@gik/controlface";
import type { ConfirmOutcome } from "@gik/kernel";

export interface LoweringMetaGraphResult {
  artifactAfterApproval: unknown;
}

/**
 * ADR-0045 Phase 4: the compiler Blueprint's Lowering Cells declared as authoring-time
 * `LoweringCellDefinition` metadata (kind, ports, policy) — the artifact-processing contract
 * ADR-0043 introduced, kept in sync with (but structurally distinct from) the actual runtime
 * `cells` map in {@link compilerBlueprint}. `agent-tier` is the tier-1 source, not a Lowering
 * Cell itself, so it is not declared here.
 */
export function loweringCellGraph(): readonly LoweringCellDefinition[] {
  return [
    defineLoweringCell({
      id: "transform-rows",
      kind: "transform",
      fromTier: "agent-data",
      toTier: "presentation",
      inputs: [{ token: "agent-data:findings", artifactType: "finding[]" }],
      outputs: [{ token: "presentation:rows", artifactType: "row[]" }],
      policy: { deterministic: true },
    }),
    defineLoweringCell({
      id: "transform-summary",
      kind: "transform",
      fromTier: "agent-data",
      toTier: "presentation",
      inputs: [{ token: "agent-data:findings", artifactType: "finding[]" }],
      outputs: [{ token: "presentation:summary", artifactType: "summary" }],
      policy: { deterministic: true },
    }),
    defineLoweringCell({
      id: "approve",
      kind: "approve",
      policy: { requiresApproval: true },
    }),
    defineLoweringCell({
      id: "emit-blueprint",
      kind: "emit-blueprint",
      inputs: [
        { token: "presentation:rows", artifactType: "row[]" },
        { token: "presentation:summary", artifactType: "summary" },
      ],
      outputs: [{ token: "compiled:artifact", artifactType: "BlueprintDefinition" }],
      policy: { requiresValidation: true },
    }),
  ];
}

export function compilerBlueprint(): BlueprintArtifact {
  return createBlueprint({
    id: "due-diligence-lowering",
    kind: "lowering-blueprint",
    version: "1",
    // The compiler Blueprint is itself hand-authored, zero-recipe Cells — the same
    // single-terminal-tier shape every other recipe-free sample already uses (a recipe-free
    // Blueprint must declare exactly one tier — confirmed by execution.ts). It does not need
    // its own compiler, which is how the design avoids infinite regress. "agentData" and
    // "presentation" below are state namespaces inside this one tier, not separate Blueprint
    // tiers — the two-tier *application* shape lives in what this compiler produces, not in
    // the compiler's own declared structure.
    tiers: [{ id: "runtime", kind: "runtime-document" }],
    recipes: [],
    // Seeded state lives on `runtime.state` (a flat blob). `composeCellDocument` never reads
    // a Cell's own `state.initial` facet — that field is declared in blueprint/src/types.ts but
    // not consumed anywhere in today's lowering path.
    runtime: {
      capabilities: {},
      state: {
        agentData: {
          subject: "Acme Robotics Inc.",
          findings: [
            { id: "f1", claim: "Registered in Delaware, 2014", sourceUrl: "https://sos.delaware.example/acme", confidence: 0.95 },
            { id: "f2", claim: "Named in a 2022 civil suit (settled)", sourceUrl: "https://courtrecords.example/case/882", confidence: 0.7 },
            { id: "f3", claim: "No adverse media in the last 12 months", sourceUrl: "https://news.example/search?q=acme", confidence: 0.6 },
          ],
          riskFlags: ["litigation-history"],
        },
        presentation: {},
        compiled: { approved: false },
      },
    },
    cells: {
      // `transform`: tier-1 source artifact. Also stands in as the presentation root:
      // today's `composeCellProgram` always requires exactly one view-bearing root, even for
      // a headless compiler graph. That view is otherwise inert here. `start` is an explicit
      // bootstrap trigger passed as `runLoweringBlueprint`'s `bootstrapEvent`: standing
      // derivations only settle in response to a dispatched event, never from seeded state
      // alone — confirmed empirically against `runTransition`'s zero-events path, which only
      // seeds the reaction baseline and leaves `compute` derivations unresolved.
      "agent-tier": {
        id: "agent-tier",
        view: { capability: "workflow:compiler-root" },
        outputs: [{ token: "agent-data:findings" }],
        behavior: {
          events: {
            start: [{ do: "assign", target: "agentData.findings", args: { from: "agentData.findings" } }],
          },
        },
      },
      // `transform`: findings -> presentation rows (pure JSONata compute Cell — the same
      // shape as `positions` in the portfolio-tracker sample).
      "transform-rows": {
        id: "transform-rows",
        view: { capability: "workflow:transform-rows" },
        inputs: [{ token: "agent-data:findings" }],
        outputs: [{ token: "presentation:rows" }],
        compute: [
          {
            id: "findings-to-rows",
            expression:
              "agentData.findings.{ 'id': id, 'claim': claim, 'source': sourceUrl, 'confidenceLabel': confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low' }",
            assign: "presentation.rows",
            dependencies: ["agentData.findings"],
          },
        ],
      },
      // `transform`: findings -> presentation summary stats.
      "transform-summary": {
        id: "transform-summary",
        view: { capability: "workflow:transform-summary" },
        inputs: [{ token: "agent-data:findings" }],
        outputs: [{ token: "presentation:summary" }],
        compute: [
          {
            id: "findings-to-summary",
            expression:
              "{ 'findingCount': $count(agentData.findings), 'riskFlagCount': $count(agentData.riskFlags), 'hasRisk': $count(agentData.riskFlags) > 0 }",
            assign: "presentation.summary",
            dependencies: ["agentData.findings", "agentData.riskFlags"],
          },
        ],
      },
      // `approve`: the Kernel's existing `confirm` action verb, human-in-the-loop gate.
      approve: {
        id: "approve",
        view: { capability: "workflow:approve" },
        behavior: {
          events: {
            approve: [{ do: "confirm" }],
            confirmed: [{ do: "assign", target: "compiled.approved", args: { value: true } }],
            dismissed: [{ do: "assign", target: "compiled.approved", args: { value: false } }],
          },
        },
      },
      // `emit-blueprint`: only resolves the terminal artifact once approval has landed. The
      // artifact it emits is itself a plain `BlueprintDefinition` shape (a real, standalone
      // tier-2 presentation Blueprint) — not application data the host must further wrap. The
      // host driver's only remaining job is `createBlueprint()` (envelope + validate) then
      // `openBlueprint()`, both already-shipped, unchanged primitives.
      "emit-blueprint": {
        id: "emit-blueprint",
        view: { capability: "workflow:emit-blueprint" },
        inputs: [{ token: "presentation:rows" }, { token: "presentation:summary" }],
        outputs: [{ token: "compiled:artifact" }],
        compute: [
          {
            id: "emit-terminal-artifact",
            expression: `compiled.approved = true ? {
              'id': 'due-diligence-report',
              'kind': 'presentation-blueprint',
              'version': '1',
              'tiers': [{ 'id': 'runtime', 'kind': 'runtime-document' }],
              'recipes': [],
              'runtime': {
                'capabilities': {},
                'state': {
                  'report': {
                    'subject': agentData.subject,
                    'rows': presentation.rows,
                    'summary': presentation.summary
                  }
                }
              },
              'cells': {
                'report-view': {
                  'id': 'report-view',
                  'view': { 'capability': 'workflow:due-diligence-report' }
                }
              },
              'projections': {
                'presentation': { 'roots': ['report-view'] }
              }
            } : compiled.artifact`,
            assign: "compiled.artifact",
            dependencies: ["presentation.rows", "presentation.summary", "compiled.approved"],
          },
        ],
      },
    },
    projections: {
      presentation: {
        roots: ["agent-tier"],
        // `behavior.events` handlers only get wired into the dispatchable document tree for
        // cells reachable from the presentation root — compute Cells resolve purely through
        // token wiring regardless of tree placement (confirmed by transform-rows/
        // transform-summary above), but a Cell with an event handler (approve) needs an
        // explicit placement or `face.emit` has no node to resolve it against. Same pattern
        // as portfolio-tracker's non-visual access-gate Cells (no `view`, placed as children).
        placements: [
          { cell: "transform-rows", parent: "agent-tier", slot: "children", order: 0 },
          { cell: "transform-summary", parent: "agent-tier", slot: "children", order: 1 },
          { cell: "approve", parent: "agent-tier", slot: "children", order: 2 },
          { cell: "emit-blueprint", parent: "agent-tier", slot: "children", order: 3 },
        ],
      },
    },
  });
}

/**
 * Runs the compiler Blueprint to completion through the host-side `runLoweringBlueprint`
 * driver (ADR-0045 Phase 2) — a thin wrapper over `runTransition`, replacing the earlier
 * spike's hand-rolled `ControlFace`/`InMemoryStateModel` wiring.
 *
 * `approve` stands in for the real host-side approval callback (e.g. a human reviewer
 * surfaced through the product UI).
 */
export async function runLoweringMetaGraph(outcome: ConfirmOutcome = "approved"): Promise<LoweringMetaGraphResult> {
  const blueprint = compilerBlueprint();

  // ADR-0045 Phase 4: catch drift between the declared Lowering Cell meta-graph and the
  // runtime Cells that actually execute it before running anything.
  const issues = validateLoweringCellGraph(loweringCellGraph(), blueprint.payload.cells ?? {});
  if (issues.length > 0) {
    throw new Error(`Lowering Cell meta-graph drifted from the compiler Blueprint: ${issues.map((issue) => `${issue.cellId}: ${issue.message}`).join("; ")}`);
  }

  const result = await runLoweringBlueprint({
    blueprint,
    bootstrapEvent: { node: "agent-tier", name: "start" },
    approveEvent: { node: "approve", name: "approve" },
    approve: async () => outcome,
  });

  return { artifactAfterApproval: result.state.compiled?.artifact };
}

/**
 * ADR-0045 Phase 3: the hand-off from compiler output to the existing, unchanged
 * `openBlueprint` path. Runs the compiler Blueprint to completion, validates its
 * `emit-blueprint` output as a real `BlueprintArtifact` (via `createBlueprint`'s
 * envelope + schema validation), and opens it as a second, independent Kernel/Face
 * instance — proving the compiler never gains direct execution authority over the
 * artifact it produces.
 *
 * Throws if approval was withheld (no artifact to open) or if the emitted artifact
 * fails Blueprint schema validation.
 */
export async function runDueDiligenceLoweringPipeline(outcome: ConfirmOutcome = "approved"): Promise<BlueprintRuntime> {
  const { artifactAfterApproval } = await runLoweringMetaGraph(outcome);
  if (!artifactAfterApproval) {
    throw new Error("Lowering meta-graph did not emit a terminal artifact (approval withheld or denied)");
  }
  const reportBlueprint = createBlueprint(artifactAfterApproval as BlueprintDefinition);
  return openBlueprint(reportBlueprint);
}
