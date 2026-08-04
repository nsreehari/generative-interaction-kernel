import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import {
  Argument,
  AttackPath,
  Chart,
  DateTime,
  Decision,
  EntitySet,
  EvidenceCase,
  Gantt,
  GrowingContainerPrimitive,
  InfiniteCanvasPrimitive,
  MeasureSet,
  Milestones,
  Narrative,
  RelationshipSet,
  Process,
  SourceFindings,
  WorkSet,
  TimerButton,
  TodoList,
  Form,
  EditableTable,
  appendEditableRowOnLastRowFocus,
  argumentDefinition,
  committedEditableRows,
  attackPathDefinition,
  chartDefinition,
  dateTimeDefinition,
  decisionDefinition,
  entitySetDefinition,
  materializeAttackPathTrial,
  materializeArgumentTrial,
  materializeDecisionTrial,
  materializeEntitySetTrial,
  materializeEvidenceCaseTrial,
  materializeProcessTrial,
  materializeSourceFindingsTrial,
  materializeWorkSetTrial,
  materializeChartTrial,
  materializeMeasureSetTrial,
  materializeMilestonesTrial,
  materializeNarrativeTrial,
  materializeRelationshipSetTrial,
  describeSemanticComponent,
  createSemanticComponentAuthoringTools,
  getSemanticComponentAgentInstructions,
  getSemanticComponentAgentKit,
  listSemanticComponents,
  materializeSemanticComponentTrial,
  semanticComponentAuthoringTools,
  componentDefinitions,
  componentViews,
  fluentComponentDefinitions,
  primitiveComponentDefinitions,
  primitiveComponentViews,
  semanticComponentDefinitions,
  semanticComponentViews,
  securityComponentDefinitions,
  securityComponentViews,
  softwareComponentDefinitions,
  softwareComponentViews,
  measureSetDefinition,
  milestonesDefinition,
  evidenceCaseDefinition,
  formatTimerButtonCountdown,
  formatDateTime,
  growingContainerDefinition,
  ganttDefinition,
  infiniteCanvasDefinition,
  INFINITE_CANVAS_THEME_COLORS,
  isGrowingContainerPinnedToEnd,
  narrativeDefinition,
  relationshipSetDefinition,
  processDefinition,
  sourceFindingsDefinition,
  workSetDefinition,
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
import { buildAttackGraphCanvasModel } from "../src/security/attack-graph";

const cases = [
  { definition: argumentDefinition, Component: Argument, materialize: materializeArgumentTrial, expected: "Contain the affected identity" },
  { definition: processDefinition, Component: Process, materialize: materializeProcessTrial, expected: "Response process" },
  { definition: entitySetDefinition, Component: EntitySet, materialize: materializeEntitySetTrial, expected: "Admin account" },
  { definition: decisionDefinition, Component: Decision, materialize: materializeDecisionTrial, expected: "Contain affected identity" },
  { definition: workSetDefinition, Component: WorkSet, materialize: materializeWorkSetTrial, expected: "Investigate sign-in" },
  { definition: sourceFindingsDefinition, Component: SourceFindings, materialize: materializeSourceFindingsTrial, expected: "Inclusive threshold" },
  { definition: chartDefinition, Component: Chart, materialize: materializeChartTrial, expected: "Risk events by hour" },
  { definition: dateTimeDefinition, Component: DateTime, materialize: () => dateTimeDefinition.materializeTrial(), expected: "Jul" },
  { definition: ganttDefinition, Component: Gantt, materialize: () => ganttDefinition.materializeTrial(), expected: "Mailbox collection" },
  { definition: measureSetDefinition, Component: MeasureSet, materialize: materializeMeasureSetTrial, expected: "Affected identities" },
  { definition: milestonesDefinition, Component: Milestones, materialize: materializeMilestonesTrial, expected: "Loading presets" },
  { definition: narrativeDefinition, Component: Narrative, materialize: materializeNarrativeTrial, expected: "Initial access" },
  { definition: evidenceCaseDefinition, Component: EvidenceCase, materialize: materializeEvidenceCaseTrial, expected: "Unfamiliar device registration" },
  { definition: relationshipSetDefinition, Component: RelationshipSet, materialize: materializeRelationshipSetTrial, expected: "Incident relationships" },
  { definition: attackPathDefinition, Component: AttackPath, materialize: materializeAttackPathTrial, expected: "Admin identity" },
  { definition: infiniteCanvasDefinition, Component: InfiniteCanvasPrimitive, materialize: () => infiniteCanvasDefinition.materializeTrial(), expected: "Source system" },
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

test("canonical semantic variants share one invariant authored data payload", () => {
  const entries = [
    { definition: argumentDefinition, expected: ["Contain the affected identity", "A new credential was registered", "supports", "opposes"] },
    { definition: narrativeDefinition, expected: ["Initial access", "Containment posture"] },
    { definition: measureSetDefinition, expected: ["Affected identities", "Contained", "Mean response"] },
    { definition: milestonesDefinition, expected: ["Loading presets", "Building manager", "Building open services", "Building preview"] },
    { definition: relationshipSetDefinition, expected: ["Admin identity", "New device", "Finance app", "registered", "accessed"] },
  ] as const;

  for (const { definition, expected } of entries) {
    const base = definition.materializeTrial();
    const dataProp = definition.dataProp!;
    const authoredData = structuredClone(base.props[dataProp]);
    for (const { value: variant } of definition.variants) {
      const props: typeof base.props = { ...structuredClone(base.props), variant };
      const node = { ...base, props };
      assert.equal(definition.validate(node.props).ok, true, `${definition.capability}:${variant}`);
      const markup = renderToStaticMarkup(<definition.component node={node} emit={() => {}} children={undefined} />);
      for (const text of expected) assert.match(markup, new RegExp(text), `${definition.capability}:${variant}:${text}`);
      assert.deepEqual(node.props[dataProp], authoredData, `${definition.capability}:${variant}`);
    }
  }
});

test("component schemas reject semantic tokens outside each component vocabulary", () => {
  const sequence = materializeProcessTrial();
  (sequence.props.spec as Record<string, unknown>).toneMap = { active: "urgent" };
  assert.equal(processDefinition.validate(sequence.props).ok, false);

  const constellation = materializeEntitySetTrial();
  (constellation.props.spec as Record<string, unknown>).toneMap = { compromised: "blocked" };
  assert.equal(entitySetDefinition.validate(constellation.props).ok, false);

  const decision = materializeDecisionTrial();
  (decision.props.spec as Record<string, unknown>).toneMap = { approved: "complete" };
  assert.equal(decisionDefinition.validate(decision.props).ok, false);
});

test("public registries separate component layers and expose an aggregate", () => {
  const semantic = ["argument", "decision", "entity-set", "event-series", "evidence-case", "measure-set", "milestones", "narrative", "process", "relationship-set", "work-set"];
  const security = ["attack-path"];
  const software = ["source-comparison", "source-findings"];
  const primitives = ["access-gate", "chart", "collection-board", "datetime", "editable-table", "form", "gantt", "graph-diagram", "growing-container", "infinite-canvas", "source-viewer", "timer-button", "todo-list"];
  const fluent = ["badge", "button", "chips", "data-grid", "dialog", "dropdown", "list", "persona", "searchbox", "spinner", "switch", "tab-bar", "table", "text-field", "textarea", "toggle"];
  assert.deepEqual(Object.keys(semanticComponentViews).sort(), semantic);
  assert.deepEqual(Object.keys(semanticComponentDefinitions).sort(), semantic);
  assert.deepEqual(Object.keys(securityComponentViews).sort(), security);
  assert.deepEqual(Object.keys(securityComponentDefinitions).sort(), security);
  assert.deepEqual(Object.keys(softwareComponentViews).sort(), software);
  assert.deepEqual(Object.keys(softwareComponentDefinitions).sort(), software);
  assert.deepEqual(Object.keys(primitiveComponentViews).sort(), primitives);
  assert.deepEqual(Object.keys(primitiveComponentDefinitions).sort(), primitives);
  assert.deepEqual(Object.keys(componentViews).sort(), [...fluent, ...primitives, ...semantic, ...security, ...software].sort());
  assert.deepEqual(Object.keys(componentDefinitions).sort(), [...fluent, ...primitives, ...semantic, ...security, ...software].sort());
  assert.equal(chartDefinition.capability, "primitive:chart");
  assert.deepEqual(growingContainerDefinition.slots, ["children"]);
  assert.deepEqual(timerButtonDefinition.events, ["press"]);
  assert.deepEqual(todoListDefinition.events, ["save"]);
  assert.deepEqual(workSetDefinition.events, ["select", "activate", "reorder", "move"]);
});

test("every registry entry exposes a complete standardized contract", () => {
  const layers = [
    ["fluent", fluentComponentDefinitions],
    ["primitive", primitiveComponentDefinitions],
    ["semantic", semanticComponentDefinitions],
    ["security", securityComponentDefinitions],
    ["software", softwareComponentDefinitions],
  ] as const;

  for (const [layer, definitions] of layers) {
    for (const [name, definition] of Object.entries(definitions)) {
      const description = definition.describe();
      const trial = definition.materializeTrial();

      assert.equal(definition.capability, `${layer}:${name}`);
      assert.equal(description.capability, definition.capability);
      assert.equal(description.summary, definition.summary);
      assert.ok(description.summary.length > 0, definition.capability);
      assert.ok(description.authoring.useWhen.length > 0, definition.capability);
      assert.ok(description.authoring.avoidWhen.length > 0, definition.capability);
      assert.ok(description.authoring.rules.length > 0, definition.capability);
      assert.equal(trial.capability, definition.capability);
      assert.equal(definition.validate(trial.props).ok, true, definition.capability);
    }
  }
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

test("non-portal components forward root className and style overrides in SSR", () => {
  const portalCapabilities = new Set(["fluent:dialog", "primitive:access-gate"]);
  for (const definition of Object.values(componentDefinitions)) {
    if (portalCapabilities.has(definition.capability)) continue;
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
  assert.equal(catalog.length, 11);
  assert.deepEqual(catalog.find((entry) => entry.id === "argument")?.variants, ["map", "outline", "text"]);
  assert.ok(!catalog.some((entry) => entry.id === "chart"));
  assert.deepEqual(catalog.find((entry) => entry.id === "event-series")?.variants, ["chronology", "axis", "text"]);
  assert.deepEqual(catalog.find((entry) => entry.id === "milestones")?.variants, ["rail", "timeline", "list", "axis", "text"]);
  assert.equal(catalog.find((entry) => entry.id === "event-series")?.dataProp, "items");

  const description = describeSemanticComponent("semantic:event-series");
  assert.equal(description.defaultVariant, "chronology");
  assert.equal((description.propsSchema.properties as Record<string, unknown>).variant != null, true);

  const trial = materializeSemanticComponentTrial("semantic:event-series", "text");
  assert.equal(trial.props.variant, "text");
  assert.equal(validateSemanticComponentProps("semantic:event-series", trial.props).ok, true);
  assert.throws(() => materializeSemanticComponentTrial("semantic:event-series", "unknown"));
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
  assert.ok(list.some((entry) => entry.capability === "semantic:work-set"));
});

test("agent kit scopes generated instructions and tools to requested components", () => {
  const kit = getSemanticComponentAgentKit(["event-series", "semantic:process", "semantic:event-series"]);
  assert.deepEqual(kit.capabilities, ["semantic:event-series", "semantic:process"]);
  assert.match(kit.instructions, /## semantic:event-series/);
  assert.match(kit.instructions, /## semantic:process/);
  assert.doesNotMatch(kit.instructions, /semantic:work-set/);
  assert.match(kit.instructions, /chronology \(default\)|flow \(default\)/);

  const list = kit.tools.find((tool) => tool.name === "listSemanticComponents")!.handler({}) as Array<{ capability: string }>;
  assert.deepEqual(list.map((entry) => entry.capability), kit.capabilities);

  const describe = kit.tools.find((tool) => tool.name === "describeSemanticComponent")!;
  const capability = (describe.inputSchema.properties as Record<string, { enum: string[] }>).capability;
  assert.deepEqual(capability.enum, kit.capabilities);
  assert.throws(() => describe.handler({ capability: "semantic:work-set" }), /outside this agent kit/);
  assert.throws(() => getSemanticComponentAgentInstructions([]), /At least one/);
});

test("semantic component preflight reports validation and effective variant", () => {
  const trial = materializeSemanticComponentTrial("semantic:event-series");
  delete trial.props.variant;
  const report = preflightSemanticComponent("semantic:event-series", trial.props);
  assert.equal(report.ok, true);
  assert.equal(report.effectiveVariant, "chronology");
  assert.deepEqual(report.declaredEvents, []);

  const scopedTools = createSemanticComponentAuthoringTools(["work-set"]);
  const preflight = scopedTools.find((tool) => tool.name === "preflightSemanticComponent")!;
  const actionTrial = materializeWorkSetTrial();
  const toolReport = preflight.handler({ capability: "semantic:work-set", props: actionTrial.props }) as {
    ok: boolean;
    declaredEvents: string[];
  };
  assert.equal(toolReport.ok, true);
  assert.deepEqual(toolReport.declaredEvents, ["select", "activate", "reorder", "move"]);
});

test("chart rejects nonnumeric values selected by its field mapping", () => {
  const trial = materializeChartTrial();
  (trial.props.points as Array<Record<string, unknown>>)[0].count = "seven";
  const report = chartDefinition.validate(trial.props);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.code === "semantic-chart-values"));
});

test("relationship set rejects relationships that reference undeclared entities", () => {
  const trial = materializeRelationshipSetTrial();
  const graph = trial.props.graph as { relationships: Array<Record<string, unknown>> };
  graph.relationships[0].to = "missing-entity";
  const report = relationshipSetDefinition.validate(trial.props);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.code === "relationship-set-reference"));
});

test("milestones reject invalid authored temporal coordinates", () => {
  const trial = materializeMilestonesTrial();
  (trial.props.milestones as Array<Record<string, unknown>>)[0].at = "not-a-date";
  const report = milestonesDefinition.validate(trial.props);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.code === "timeline-valid-coordinate"));
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

test("attack graph lowers each relationship to matching source and target port tokens", () => {
  const canvas = buildAttackGraphCanvasModel({
    entities: [
      { id: "attacker", label: "Threat actor", detail: "Observed source", status: "observed" },
      { id: "mailbox", label: "Mailbox", detail: "Compromised target", status: "compromised" },
    ],
    relationships: [
      { id: "access", sourceId: "attacker", targetId: "mailbox", label: "accessed" },
    ],
  }, {
    entityFields: { id: "id", label: "label", detail: "detail", tone: "status" },
    relationshipFields: { id: "id", source: "sourceId", target: "targetId", label: "label" },
    toneMap: { observed: "neutral", compromised: "danger" },
  });

  assert.equal(canvas.nodes.length, 2);
  assert.deepEqual(canvas.nodePorts.attacker?.right, [{ id: "access:source", token: "edge:access", label: "accessed" }]);
  assert.deepEqual(canvas.nodePorts.mailbox?.left, [{ id: "access:target", token: "edge:access", label: "accessed" }]);
});

test("attack graph variants render distinct canvas, diagram, relation, Gantt, and text representations", () => {
  const renderVariant = (variant: "canvas" | "diagram" | "relations" | "gantt" | "text") => {
    const trial = attackPathDefinition.materializeTrial();
    trial.props.variant = variant;
    return renderToStaticMarkup(<AttackPath node={trial} emit={() => {}} children={undefined} />);
  };

  const canvas = renderVariant("canvas");
  assert.match(canvas, /role="application"/);

  const diagram = renderVariant("diagram");
  assert.match(diagram, /<svg/);
  assert.match(diagram, /role="img"/);
  assert.doesNotMatch(diagram, /role="application"/);

  const relations = renderVariant("relations");
  assert.match(relations, /authenticated as/);
  assert.match(relations, /accessed/);
  assert.doesNotMatch(relations, /<svg/);
  assert.doesNotMatch(relations, /role="application"/);

  const gantt = renderVariant("gantt");
  assert.doesNotMatch(gantt, /2026-07-17T23:09:23Z/);
  assert.match(gantt, /Jul/);
  assert.match(gantt, /Threat actor authenticated as Admin identity/);
  assert.doesNotMatch(gantt, /role="application"|<svg/);

  const text = renderVariant("text");
  assert.match(text, /<ol/);
  assert.match(text, /Threat actor/);
  assert.match(text, /authenticated as/);
  assert.match(text, /<time dateTime="2026-07-17T23:09:23Z"/);
  assert.match(text, /<time dateTime="2026-07-17T23:09:27Z"/);
  assert.doesNotMatch(text, />2026-07-17T23:09:23Z</);
  assert.doesNotMatch(text, /role="application"|<svg|fui-Card/);
});

test("attack graph Gantt requires relationship start and end mappings", () => {
  const trial = attackPathDefinition.materializeTrial();
  trial.props.variant = "gantt";
  const spec = trial.props.spec as Record<string, unknown>;
  const relationshipFields = spec.relationshipFields as Record<string, unknown>;
  delete relationshipFields.start;
  delete relationshipFields.end;
  assert.equal(attackPathDefinition.validate(trial.props).ok, false);
});

test("Gantt rejects reversed temporal intervals", () => {
  const trial = ganttDefinition.materializeTrial();
  const items = trial.props.items as Array<Record<string, unknown>>;
  items[0].start = "2026-07-17T23:09:30Z";
  items[0].end = "2026-07-17T23:09:20Z";
  assert.equal(ganttDefinition.validate(trial.props).ok, false);
});

test("DateTime omits the current year and includes other years", () => {
  const now = new Date(2026, 7, 4, 12);
  const current = new Date(2026, 7, 4, 23, 9, 23);
  const previous = new Date(2025, 7, 4, 23, 9, 23);
  assert.equal(formatDateTime(current, "date", { locale: "en-US", now }), "Aug 4");
  assert.equal(formatDateTime(previous, "date", { locale: "en-US", now }), "Aug 4, 2025");
  assert.equal(formatDateTime(current, "time", { locale: "en-US", now }), "23:09");
  assert.equal(formatDateTime(current, "time", { hourFormat: "12", locale: "en-US", now }), "11:09 PM");
  assert.equal(formatDateTime(current, "time", { locale: "en-US", now, showSeconds: true }), "23:09:23");
  assert.match(formatDateTime(current, "time", { locale: "en-US", now, showTimeZone: true }), /^23:09 .+$/);
});

test("Gantt renders numeric linear coordinates with a presentation prefix", () => {
  const trial = ganttDefinition.materializeTrial();
  trial.props.items = [
    { id: "numeric", label: "Numeric interval", start: 1, end: 40 },
    { id: "indexed", label: "Indexed interval", start: 2, end: 8 },
  ];
  const spec = trial.props.spec as Record<string, unknown>;
  spec.scale = { kind: "linear", displayPrefix: "T", minimum: 0, maximum: 10, tickStep: 2 };
  assert.equal(ganttDefinition.validate(trial.props).ok, false);

  (trial.props.items as Array<Record<string, unknown>>)[0].end = 1.5;
  assert.equal(ganttDefinition.validate(trial.props).ok, true);
  const html = renderToStaticMarkup(<Gantt node={trial} emit={() => undefined} children={undefined} />);
  assert.match(html, /T1 - T1.5/);
  assert.match(html, /T2 - T8/);
  assert.match(html, /left:10%;width:5%/);
  assert.match(html, /aria-label="Gantt scale"/);
  assert.match(html, />T10</);

  (trial.props.items as Array<Record<string, unknown>>)[1].start = "T2";
  assert.equal(ganttDefinition.validate(trial.props).ok, false);
});

test("attack graph Gantt delegates linear coordinates to primitive:gantt", () => {
  const trial = attackPathDefinition.materializeTrial();
  trial.props.variant = "gantt";
  const graph = trial.props.graph as Record<string, unknown>;
  const relationships = graph.relationships as Array<Record<string, unknown>>;
  relationships[0].start = 1;
  relationships[0].end = 2;
  relationships[1].start = 2;
  relationships[1].end = 5;
  const spec = trial.props.spec as Record<string, unknown>;
  spec.ganttScale = { kind: "linear", displayPrefix: "T", minimum: 0 };
  assert.equal(attackPathDefinition.validate(trial.props).ok, true);
  const html = renderToStaticMarkup(<AttackPath node={trial} emit={() => undefined} children={undefined} />);
  assert.match(html, /T1 - T2/);
  assert.match(html, /T2 - T5/);
});

test("infinite canvas exposes resolvable theme colors", () => {
  assert.match(INFINITE_CANVAS_THEME_COLORS.edge, /--colorNeutralStrokeAccessible/);
  assert.match(INFINITE_CANVAS_THEME_COLORS.accent, /--colorBrandStroke1/);
  assert.match(INFINITE_CANVAS_THEME_COLORS.backgroundDot, /--colorNeutralStroke2/);
  assert.doesNotMatch(Object.values(INFINITE_CANVAS_THEME_COLORS).join(" "), /var\(--line\)|var\(--accent\)/);
});

test("argument rejects duplicate claims and relations to undeclared claims", () => {
  const duplicate = materializeArgumentTrial();
  const duplicateArgument = duplicate.props.argument as { claims: Array<Record<string, unknown>> };
  duplicateArgument.claims[1].id = duplicateArgument.claims[0].id;
  assert.ok(argumentDefinition.validate(duplicate.props).errors.some((error) => error.code === "argument-unique-claim-id"));

  const missing = materializeArgumentTrial();
  const missingArgument = missing.props.argument as { relations: Array<Record<string, unknown>> };
  missingArgument.relations[0].target = "missing-claim";
  assert.ok(argumentDefinition.validate(missing.props).errors.some((error) => error.code === "argument-reference"));
});