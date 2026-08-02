import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import {
  ActionBoard,
  AnnotatedSourceExcerpt,
  Chart,
  DecisionSummary,
  EntityConstellation,
  EvidenceTrail,
  GrowingContainerPrimitive,
  MetricComparison,
  NarrativeSection,
  SemanticGraph,
  Sequence,
  TimerButton,
  TodoList,
  Form,
  EditableTable,
  appendEditableRowOnLastRowFocus,
  committedEditableRows,
  actionBoardDefinition,
  annotatedSourceExcerptDefinition,
  chartDefinition,
  decisionSummaryDefinition,
  entityConstellationDefinition,
  materializeActionBoardTrial,
  materializeAnnotatedSourceExcerptTrial,
  materializeChartTrial,
  materializeDecisionSummaryTrial,
  materializeEntityConstellationTrial,
  materializeEvidenceTrailTrial,
  materializeMetricComparisonTrial,
  materializeNarrativeSectionTrial,
  materializeSemanticGraphTrial,
  materializeSequenceTrial,
  describeSemanticComponent,
  createSemanticComponentAuthoringTools,
  getSemanticComponentAgentInstructions,
  getSemanticComponentAgentKit,
  listSemanticComponents,
  materializeSemanticComponentTrial,
  semanticComponentAuthoringTools,
  componentDefinitions,
  componentViews,
  primitiveComponentDefinitions,
  primitiveComponentViews,
  semanticComponentDefinitions,
  semanticComponentViews,
  metricComparisonDefinition,
  evidenceTrailDefinition,
  formatTimerButtonCountdown,
  growingContainerDefinition,
  isGrowingContainerPinnedToEnd,
  narrativeSectionDefinition,
  semanticGraphDefinition,
  sequenceDefinition,
  timerButtonDefinition,
  todoListDefinition,
  updateTodoListValues,
  formDefinition,
  editableTableDefinition,
  withTrailingEditableRow,
  preflightSemanticComponent,
  shouldGrowingContainerFollowEnd,
  validateSemanticComponentProps,
} from "../src/shared";

const cases = [
  { definition: sequenceDefinition, Component: Sequence, materialize: materializeSequenceTrial, expected: "Response sequence" },
  { definition: entityConstellationDefinition, Component: EntityConstellation, materialize: materializeEntityConstellationTrial, expected: "Admin account" },
  { definition: decisionSummaryDefinition, Component: DecisionSummary, materialize: materializeDecisionSummaryTrial, expected: "Contain affected identity" },
  { definition: actionBoardDefinition, Component: ActionBoard, materialize: materializeActionBoardTrial, expected: "Disable account" },
  { definition: annotatedSourceExcerptDefinition, Component: AnnotatedSourceExcerpt, materialize: materializeAnnotatedSourceExcerptTrial, expected: "Containment threshold reached" },
  { definition: chartDefinition, Component: Chart, materialize: materializeChartTrial, expected: "Risk events by hour" },
  { definition: metricComparisonDefinition, Component: MetricComparison, materialize: materializeMetricComparisonTrial, expected: "Affected identities" },
  { definition: narrativeSectionDefinition, Component: NarrativeSection, materialize: materializeNarrativeSectionTrial, expected: "Initial access" },
  { definition: evidenceTrailDefinition, Component: EvidenceTrail, materialize: materializeEvidenceTrailTrial, expected: "Unfamiliar device registration" },
  { definition: semanticGraphDefinition, Component: SemanticGraph, materialize: materializeSemanticGraphTrial, expected: "Incident relationships" },
] as const;

for (const entry of cases) {
  test(`${entry.definition.capability} validates and renders its trial`, () => {
    const trial = entry.materialize();
    assert.equal(entry.definition.validate(trial.props).ok, true);
    assert.equal(entry.definition.component, entry.Component);
    assert.ok(entry.definition.describe().authoring.rules.length > 0);

    const markup = renderToStaticMarkup(<entry.Component node={trial} emit={() => {}} children={undefined} />);
    assert.match(markup, new RegExp(entry.expected));
  });
}

test("component schemas reject semantic tokens outside each component vocabulary", () => {
  const sequence = materializeSequenceTrial();
  (sequence.props.spec as Record<string, unknown>).toneMap = { active: "urgent" };
  assert.equal(sequenceDefinition.validate(sequence.props).ok, false);

  const constellation = materializeEntityConstellationTrial();
  (constellation.props.spec as Record<string, unknown>).toneMap = { compromised: "blocked" };
  assert.equal(entityConstellationDefinition.validate(constellation.props).ok, false);

  const decision = materializeDecisionSummaryTrial();
  (decision.props.spec as Record<string, unknown>).toneMap = { approved: "complete" };
  assert.equal(decisionSummaryDefinition.validate(decision.props).ok, false);

  const board = materializeActionBoardTrial();
  const boardSpec = board.props.spec as Record<string, unknown>;
  boardSpec.columns = [{ value: "now", label: "Immediate", token: "negative" }];
  assert.equal(actionBoardDefinition.validate(board.props).ok, false);
});

test("public registries separate component layers and expose an aggregate", () => {
  const semantic = ["action-board", "annotated-source-excerpt", "decision-summary", "entity-constellation", "evidence-trail", "metric-comparison", "narrative-section", "semantic-graph", "sequence", "timeline"];
  const primitives = ["chart", "editable-table", "form", "growing-container", "timer-button", "todo-list"];
  const fluent = ["badge", "button", "chips", "data-grid", "dropdown", "list", "persona", "searchbox", "spinner", "switch", "tab-bar", "table", "text-field", "textarea", "toggle"];
  assert.deepEqual(Object.keys(semanticComponentViews).sort(), semantic);
  assert.deepEqual(Object.keys(semanticComponentDefinitions).sort(), semantic);
  assert.deepEqual(Object.keys(primitiveComponentViews).sort(), primitives);
  assert.deepEqual(Object.keys(primitiveComponentDefinitions).sort(), primitives);
  assert.deepEqual(Object.keys(componentViews).sort(), [...fluent, ...primitives, ...semantic].sort());
  assert.deepEqual(Object.keys(componentDefinitions).sort(), [...fluent, ...primitives, ...semantic].sort());
  assert.equal(chartDefinition.capability, "primitive:chart");
  assert.deepEqual(growingContainerDefinition.slots, ["children"]);
  assert.deepEqual(timerButtonDefinition.events, ["press"]);
  assert.deepEqual(todoListDefinition.events, ["save"]);
  assert.deepEqual(actionBoardDefinition.events, ["action"]);
});

test("todo-list shares form field and value shapes while committing each checkbox change", () => {
  const trial = todoListDefinition.materializeTrial();
  assert.equal(todoListDefinition.validate(trial.props).ok, true);
  assert.equal(todoListDefinition.validate({ fields: { properties: { task: { type: "string", title: "Task" } } }, value: { task: false } }).ok, false);
  assert.equal(todoListDefinition.validate({ fields: { properties: { task: { type: "boolean", title: "Task" } } }, value: { task: "no" } }).ok, false);
  assert.deepEqual(updateTodoListValues({ first: false, second: true }, "first", true), { first: true, second: true });

  const markup = renderToStaticMarkup(<TodoList node={trial} emit={() => {}} children={undefined} />);
  assert.match(markup, /Ship the component/);
  assert.match(markup, /Publish the docs/);
  assert.doesNotMatch(markup, />Save</);
  assert.doesNotMatch(markup, />Discard</);
});

test("Fluent components forward root className and style overrides", () => {
  for (const definition of Object.values(componentDefinitions)) {
    const trial = definition.materializeTrial();
    trial.props.className = "callsite-override";
    trial.props.style = { maxWidth: "40rem" };

    assert.equal(definition.validate(trial.props).ok, true, definition.capability);
    const Component = definition.component;
    const markup = renderToStaticMarkup(<Component node={trial} emit={() => {}} children={undefined} />);
    assert.match(markup, /class="[^"]*callsite-override[^"]*"/, definition.capability);
    assert.match(markup, /style="[^"]*max-width:40rem[^"]*"/, definition.capability);
  }
});

test("component definitions expose closed agent-facing variant contracts", () => {
  for (const definition of Object.values(componentDefinitions)) {
    const description = definition.describe();
    const values = description.variants.map((variant) => variant.value);
    if (values.length > 0) {
      assert.ok(description.defaultVariant);
      assert.ok(values.includes(description.defaultVariant));
    } else {
      assert.equal(description.defaultVariant, undefined);
    }
    assert.deepEqual(definition.variants, description.variants);
    assert.equal(definition.defaultVariant, description.defaultVariant);
    assert.ok(description.variants.every((variant) => variant.summary.length > 0 && variant.useWhen.length > 0));

    for (const variant of values) {
      const trial = definition.materializeTrial();
      trial.props.variant = variant;
      assert.equal(definition.validate(trial.props).ok, true, `${definition.capability} should accept ${variant}`);
    }

    const invalid = definition.materializeTrial();
    invalid.props.variant = "not-a-declared-variant";
    assert.equal(definition.validate(invalid.props).ok, false, `${definition.capability} should reject unknown variants`);
  }
});

test("agent authoring APIs discover, describe, validate, and materialize components", () => {
  const catalog = listSemanticComponents();
  assert.equal(catalog.length, 10);
  assert.ok(!catalog.some((entry) => entry.id === "chart"));
  assert.deepEqual(catalog.find((entry) => entry.id === "timeline")?.variants, ["standard", "compact", "minimal"]);
  assert.equal(catalog.find((entry) => entry.id === "timeline")?.dataProp, "items");

  const description = describeSemanticComponent("semantic:timeline");
  assert.equal(description.defaultVariant, "standard");
  assert.equal((description.propsSchema.properties as Record<string, unknown>).variant != null, true);

  const trial = materializeSemanticComponentTrial("semantic:timeline", "minimal");
  assert.equal(trial.props.variant, "minimal");
  assert.equal(validateSemanticComponentProps("semantic:timeline", trial.props).ok, true);
  assert.throws(() => materializeSemanticComponentTrial("semantic:timeline", "unknown"));
  assert.throws(() => describeSemanticComponent("semantic:not-real"), /Unknown semantic component/);
});

test("component authoring tools expose the complete agent-safe surface", () => {
  assert.deepEqual(semanticComponentAuthoringTools.map((tool) => tool.name), [
    "listSemanticComponents",
    "describeSemanticComponent",
    "validateSemanticComponentProps",
    "preflightSemanticComponent",
    "materializeSemanticComponentTrial",
  ]);
  assert.ok(semanticComponentAuthoringTools.every((tool) => tool.agentSafe));
  const list = semanticComponentAuthoringTools[0].handler({}) as Array<{ capability: string }>;
  assert.ok(list.some((entry) => entry.capability === "semantic:action-board"));
});

test("agent kit scopes generated instructions and tools to requested components", () => {
  const kit = getSemanticComponentAgentKit(["timeline", "semantic:sequence", "semantic:timeline"]);
  assert.deepEqual(kit.capabilities, ["semantic:timeline", "semantic:sequence"]);
  assert.match(kit.instructions, /## semantic:timeline/);
  assert.match(kit.instructions, /## semantic:sequence/);
  assert.doesNotMatch(kit.instructions, /semantic:action-board/);
  assert.match(kit.instructions, /minimal \(default\)|standard \(default\)/);

  const list = kit.tools.find((tool) => tool.name === "listSemanticComponents")!.handler({}) as Array<{ capability: string }>;
  assert.deepEqual(list.map((entry) => entry.capability), kit.capabilities);

  const describe = kit.tools.find((tool) => tool.name === "describeSemanticComponent")!;
  const capability = (describe.inputSchema.properties as Record<string, { enum: string[] }>).capability;
  assert.deepEqual(capability.enum, kit.capabilities);
  assert.throws(() => describe.handler({ capability: "semantic:action-board" }), /outside this agent kit/);
  assert.throws(() => getSemanticComponentAgentInstructions([]), /At least one/);
});

test("semantic component preflight reports validation and effective variant", () => {
  const trial = materializeSemanticComponentTrial("semantic:timeline");
  delete trial.props.variant;
  const report = preflightSemanticComponent("semantic:timeline", trial.props);
  assert.equal(report.ok, true);
  assert.equal(report.effectiveVariant, "standard");
  assert.deepEqual(report.declaredEvents, []);

  const scopedTools = createSemanticComponentAuthoringTools(["action-board"]);
  const preflight = scopedTools.find((tool) => tool.name === "preflightSemanticComponent")!;
  const actionTrial = materializeActionBoardTrial();
  const toolReport = preflight.handler({ capability: "semantic:action-board", props: actionTrial.props }) as {
    ok: boolean;
    declaredEvents: string[];
  };
  assert.equal(toolReport.ok, true);
  assert.deepEqual(toolReport.declaredEvents, ["action"]);
});

test("chart rejects nonnumeric values selected by its field mapping", () => {
  const trial = materializeChartTrial();
  (trial.props.points as Array<Record<string, unknown>>)[0].count = "seven";
  const report = chartDefinition.validate(trial.props);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.code === "semantic-chart-values"));
});

test("semantic graph rejects edges that reference undeclared nodes", () => {
  const trial = materializeSemanticGraphTrial();
  const graph = trial.props.graph as { edges: Array<Record<string, unknown>> };
  graph.edges[0].to = "missing-node";
  const report = semanticGraphDefinition.validate(trial.props);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.code === "semantic-graph-edge-reference"));
});

test("chart accepts and renders pie as a spec kind", () => {
  const trial = materializeChartTrial();
  (trial.props.spec as Record<string, unknown>).kind = "pie";
  assert.equal(chartDefinition.validate(trial.props).ok, true);
  const markup = renderToStaticMarkup(<Chart node={trial} emit={() => {}} children={undefined} />);
  assert.match(markup, /<path/);
  assert.match(markup, /08:00: 7/);
});

test("growing container exposes closed props and accessible slot rendering", () => {
  const trial = growingContainerDefinition.materializeTrial();
  assert.equal(growingContainerDefinition.validate(trial.props).ok, true);
  assert.equal(growingContainerDefinition.validate({ followEnd: "sometimes" }).ok, false);
  assert.equal(growingContainerDefinition.validate({ followEnd: "off", extra: true }).ok, false);

  const markup = renderToStaticMarkup(
    <GrowingContainerPrimitive node={trial} emit={() => {}}>Appended output</GrowingContainerPrimitive>,
  );
  assert.match(markup, /class="[^"]*gik-growing-container(?:\s|\")/);
  assert.match(markup, /class="[^"]*gik-growing-container-content(?:\s|\")/);
  assert.match(markup, /role="region"/);
  assert.match(markup, /aria-label="Streaming output"/);
  assert.match(markup, /Appended output/);
});

test("growing container follows content according to pin state and threshold", () => {
  assert.equal(isGrowingContainerPinnedToEnd({ scrollHeight: 200, scrollTop: 92, clientHeight: 100 }), true);
  assert.equal(isGrowingContainerPinnedToEnd({ scrollHeight: 200, scrollTop: 91, clientHeight: 100 }), false);
  assert.equal(shouldGrowingContainerFollowEnd("always", false), true);
  assert.equal(shouldGrowingContainerFollowEnd("when-at-end", true), true);
  assert.equal(shouldGrowingContainerFollowEnd("when-at-end", false), false);
  assert.equal(shouldGrowingContainerFollowEnd("off", true), false);
});

test("timer button exposes a closed countdown action contract", () => {
  const trial = timerButtonDefinition.materializeTrial();
  assert.equal(timerButtonDefinition.validate(trial.props).ok, true);
  assert.equal(timerButtonDefinition.validate({ label: "Continue", variant: "sometimes" }).ok, false);
  assert.equal(timerButtonDefinition.validate({ label: "Continue", defaultPace: "sometimes" }).ok, false);
  assert.equal(timerButtonDefinition.validate({ label: "Continue", extra: true }).ok, false);

  const markup = renderToStaticMarkup(<TimerButton node={trial} emit={() => {}} children={undefined} />);
  assert.match(markup, /Continue/);
  assert.match(markup, /Automatically trigger when the countdown ends/);
  assert.match(markup, /5 seconds remaining/);

  trial.props.variant = "auto-only";
  trial.props.defaultPace = "manual";
  trial.props.showPaceSwitch = true;
  const autoOnlyMarkup = renderToStaticMarkup(<TimerButton node={trial} emit={() => {}} children={undefined} />);
  assert.doesNotMatch(autoOnlyMarkup, /Automatically trigger when the countdown ends/);
  assert.match(autoOnlyMarkup, /5 seconds remaining/);
  assert.equal(formatTimerButtonCountdown(59), "59");
  assert.equal(formatTimerButtonCountdown(300), "5:00");
});

test("form renders schema fields with Fluent controls", () => {
  const trial = formDefinition.materializeTrial();
  assert.equal(formDefinition.validate(trial.props).ok, true);
  assert.equal(formDefinition.validate({ fields: {}, extra: true }).ok, false);
  const markup = renderToStaticMarkup(<Form node={trial} emit={() => {}} children={undefined} />);
  assert.match(markup, /Name/);
  assert.match(markup, /Active/);
  assert.match(markup, /fui-Input/);
  assert.match(markup, /fui-Checkbox/);
});

test("editable table preserves draft row helpers and renders Fluent controls", () => {
  const trial = editableTableDefinition.materializeTrial();
  assert.equal(editableTableDefinition.validate(trial.props).ok, true);
  const markup = renderToStaticMarkup(<EditableTable node={trial} emit={() => {}} children={undefined} />);
  assert.match(markup, /fui-Table/);
  assert.match(markup, /fui-Input/);
  assert.match(markup, /Add row/);
  const rows = withTrailingEditableRow([{ name: "Budget" }], ["name"]);
  assert.deepEqual(committedEditableRows(rows), [{ name: "Budget" }]);
  assert.deepEqual(appendEditableRowOnLastRowFocus(rows, ["name"], 1), [...rows, { name: "" }]);
});