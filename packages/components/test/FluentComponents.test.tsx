import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import * as rootEntryPoint from "../src/shared";
import {
  createFluentComponentAuthoringTools,
  describeFluentComponent,
  fluentBadgeDefinition,
  fluentButtonDefinition,
  fluentChipsDefinition,
  fluentComponentAuthoringTools,
  fluentComponentDefinitions,
  fluentComponentViews,
  fluentDataGridDefinition,
  fluentDialogDefinition,
  fluentDropdownDefinition,
  fluentListDefinition,
  fluentPersonaDefinition,
  fluentSearchboxDefinition,
  fluentSpinnerDefinition,
  fluentSwitchDefinition,
  fluentTableDefinition,
  fluentTabBarDefinition,
  fluentTextDefinition,
  fluentTextFieldDefinition,
  fluentTextareaDefinition,
  fluentToolbarDefinition,
  fluentToggleDefinition,
  getFluentComponentAgentKit,
  listFluentComponents,
  materializeFluentComponentTrial,
  preflightFluentComponent,
  validateFluentComponentProps,
} from "../src/fluent";

test("fluent entrypoint exposes all views and closed definitions", () => {
  const controls = ["badge", "button", "chips", "data-grid", "dialog", "dropdown", "list", "panel", "persona", "row", "searchbox", "spinner", "switch", "tab-bar", "table", "text", "text-field", "textarea", "toggle", "toolbar"];
  const events: Record<string, string[]> = {
    badge: [],
    button: ["press"],
    chips: ["remove"],
    "data-grid": ["select", "sort"],
    dialog: ["openChange"],
    dropdown: ["select"],
    list: ["select"],
    panel: [],
    persona: [],
    row: [],
    searchbox: ["submit"],
    spinner: [],
    switch: ["toggle"],
    "tab-bar": ["select"],
    table: [],
    text: [],
    "text-field": ["input"],
    textarea: ["input"],
    toolbar: [],
    toggle: ["toggle"],
  };
  assert.deepEqual(Object.keys(fluentComponentViews).sort(), controls);
  assert.deepEqual(Object.keys(fluentComponentDefinitions).sort(), controls);

  for (const [name, definition] of Object.entries(fluentComponentDefinitions)) {
    const trial = definition.materializeTrial();
    assert.equal(definition.validate(trial.props).ok, true);
    assert.equal(definition.validate({ ...trial.props, unknown: true }).ok, false);
    assert.deepEqual(definition.events, events[name]);
  }
});

test("moved Fluent input controls retain their rendering contracts", () => {
  const dropdownTrial = fluentDropdownDefinition.materializeTrial();
  dropdownTrial.props.label = "Investigation";
  dropdownTrial.props.required = true;
  const DropdownComponent = fluentDropdownDefinition.component;
  const dropdownMarkup = renderToStaticMarkup(
    <DropdownComponent node={dropdownTrial} emit={() => undefined} children={undefined} />,
  );
  assert.match(dropdownMarkup, /role="combobox"/);
  assert.match(dropdownMarkup, /Investigation/);
  assert.match(dropdownMarkup, /Governed SOC investigation/);

  const switchTrial = fluentSwitchDefinition.materializeTrial();
  const SwitchComponent = fluentSwitchDefinition.component;
  const switchMarkup = renderToStaticMarkup(
    <SwitchComponent node={switchTrial} emit={() => undefined} children={undefined} />,
  );
  assert.match(switchMarkup, /role="switch"/);
  assert.match(switchMarkup, /checked=""/);

  const toggleTrial = fluentToggleDefinition.materializeTrial();
  const ToggleComponent = fluentToggleDefinition.component;
  const toggleMarkup = renderToStaticMarkup(
    <ToggleComponent node={toggleTrial} emit={() => undefined} children={undefined} />,
  );
  assert.match(toggleMarkup, /aria-pressed="true"/);
  assert.equal(fluentToggleDefinition.validate({ minWidth: 72 }).ok, false);
});

test("FluentButton renders its public trial and forwards root styling", () => {
  const trial = fluentButtonDefinition.materializeTrial();
  trial.props.className = "callsite-button";
  trial.props.style = { minWidth: 120 };
  const Component = fluentButtonDefinition.component;
  const markup = renderToStaticMarkup(<Component node={trial} emit={() => undefined} children={undefined} />);

  assert.match(markup, /class="[^"]*callsite-button/);
  assert.match(markup, /style="min-width:120px"/);
  assert.match(markup, />Analyze report<\/button>/);
});

test("FluentButton renders a spinner for controlled loading", () => {
  const trial = fluentButtonDefinition.materializeTrial();
  trial.props.loading = true;
  const Component = fluentButtonDefinition.component;
  const markup = renderToStaticMarkup(<Component node={trial} emit={() => undefined} children={undefined} />);
  delete trial.props.loading;

  assert.match(markup, /role="progressbar"/);
  assert.equal(fluentButtonDefinition.validate({ label: "Improve report", loading: true }).ok, true);
});

test("FluentButton renders its icon variant with an accessible name", () => {
  const trial = fluentButtonDefinition.materializeTrial();
  trial.props.variant = "icon";
  trial.props.icon = "full-screen-maximize";
  trial.props.ariaLabel = "Enter full screen";
  delete trial.props.label;
  const Component = fluentButtonDefinition.component;
  const markup = renderToStaticMarkup(<Component node={trial} emit={() => undefined} children={undefined} />);

  assert.match(markup, /aria-label="Enter full screen"/);
  assert.match(markup, /<svg/);
});

test("FluentDialog exposes self-contained native dialog composition", () => {
  const trial = fluentDialogDefinition.materializeTrial();
  trial.props.className = "callsite-override";
  trial.props.style = { maxWidth: "40rem" };
  const Component = fluentDialogDefinition.component;
  const markup = renderToStaticMarkup(
    <Component node={trial} emit={() => undefined} children={<p>Dialog content</p>} />,
  );
  assert.match(markup, /hidden/);
  assert.deepEqual(fluentDialogDefinition.slots, ["children"]);
  assert.deepEqual(fluentDialogDefinition.events, ["openChange"]);
  assert.equal(fluentDialogDefinition.validate({ defaultOpen: true, title: "Review details" }).ok, true);
  assert.equal(fluentDialogDefinition.validate({ open: true, title: "Review details" }).ok, true);
  assert.equal(fluentDialogDefinition.validate({ open: "yes", title: "Review details" }).ok, false);
});

test("FluentDialog controlled open overrides its local default", () => {
  const trial = fluentDialogDefinition.materializeTrial();
  trial.props.defaultOpen = true;
  trial.props.open = false;
  const Component = fluentDialogDefinition.component;
  const markup = renderToStaticMarkup(
    <Component node={trial} emit={() => undefined} children={<p>Controlled dialog content</p>} />,
  );

  assert.doesNotMatch(markup, /Controlled dialog content/);
});

test("FluentToolbar exposes native command composition", () => {
  const trial = fluentToolbarDefinition.materializeTrial();
  const Component = fluentToolbarDefinition.component;
  const markup = renderToStaticMarkup(
    <Component node={trial} emit={() => undefined} children={<button type="button">View source</button>} />,
  );

  assert.match(markup, /role="toolbar"/);
  assert.match(markup, /aria-label="Incident report controls"/);
  assert.match(markup, /View source/);
  assert.deepEqual(fluentToolbarDefinition.slots, ["children"]);
  assert.equal(fluentToolbarDefinition.validate({ ariaLabel: "Source controls", size: "small" }).ok, true);
  assert.equal(fluentToolbarDefinition.validate({ ariaLabel: "Source controls", direction: "row" }).ok, false);
});

test("FluentTabBar composes ordered panes and renders the active content", () => {
  const trial = fluentTabBarDefinition.materializeTrial();
  const Component = fluentTabBarDefinition.component;
  const node = {
    ...trial,
    props: {
      active: "form",
      ariaLabel: "Blueprint views",
      tabs: [
        { value: "overview", headerLabel: "Overview" },
        { value: "form", headerLabel: "Form" },
      ],
    },
  };
  const markup = renderToStaticMarkup(
    <Component
      node={node}
      emit={() => undefined}
      children={[
        <p key="overview">Overview pane</p>,
        <p key="form">Form pane</p>,
      ]}
    />,
  );

  assert.match(markup, /Form pane/);
  assert.doesNotMatch(markup, /Overview pane/);
  assert.match(markup, /role="tabpanel".*Form pane/);
  assert.equal(fluentTabBarDefinition.slots, undefined);
  assert.equal(fluentTabBarDefinition.validate(node.props).ok, true);
});

test("FluentTabBar uses defaultActive without requiring authored state", () => {
  const trial = fluentTabBarDefinition.materializeTrial();
  const Component = fluentTabBarDefinition.component;
  const node = {
    ...trial,
    props: {
      defaultActive: "form",
      tabs: [
        { value: "overview", headerLabel: "Overview" },
        { value: "form", headerLabel: "Form" },
      ],
    },
  };
  const markup = renderToStaticMarkup(
    <Component
      node={node}
      emit={() => undefined}
      children={[
        <p key="overview">Overview pane</p>,
        <p key="form">Form pane</p>,
      ]}
    />,
  );

  assert.match(markup, /Form pane/);
  assert.doesNotMatch(markup, /Overview pane/);
});

test("basic Fluent controls render their public trials", () => {
  const definitions = [
    [fluentTextFieldDefinition, /Name/],
    [fluentTextareaDefinition, /Notes/],
    [fluentSearchboxDefinition, /type="search"/],
    [fluentTabBarDefinition, /role="tablist"/],
    [fluentChipsDefinition, /Credential access/],
  ] as const;

  for (const [definition, expected] of definitions) {
    const trial = definition.materializeTrial();
    const Component = definition.component;
    const markup = renderToStaticMarkup(<Component node={trial} emit={() => undefined} children={undefined} />);
    assert.match(markup, expected);
  }

  assert.equal(fluentSearchboxDefinition.validate({ actionLabel: "Search" }).ok, false);
  assert.equal(fluentChipsDefinition.validate({ items: [{ id: "alpha", label: "Alpha" }] }).ok, false);
  assert.equal(fluentChipsDefinition.validate({ items: [], emptyText: "None" }).ok, false);
});

test("Fluent data controls render explicit public data contracts", () => {
  const definitions = [
    [fluentListDefinition, [/Incident states/, /Open/]],
    [fluentTableDefinition, [/Incident ownership/, /Open/, /SOC/]],
    [fluentDataGridDefinition, [/Selectable incidents/, /Open/, /SOC/]],
  ] as const;

  for (const [definition, expectedPatterns] of definitions) {
    const trial = definition.materializeTrial();
    const Component = definition.component;
    const markup = renderToStaticMarkup(<Component node={trial} emit={() => undefined} children={undefined} />);
    for (const expected of expectedPatterns) assert.match(markup, expected);
  }

  assert.equal(fluentListDefinition.validate({ items: [{ value: "open", label: "Open", detail: "extra" }] }).ok, false);
  assert.equal(fluentTableDefinition.validate({ columns: [{ id: "status", label: "Status" }], rows: [{ status: "Open" }] }).ok, false);
  assert.equal(fluentDataGridDefinition.validate({ columns: [], rows: [], editable: true }).ok, false);
});

test("FluentList vertical-cards is a full selection variant with controlled selected state", () => {
  const trial = fluentListDefinition.materializeTrial();
  trial.props.variant = "vertical-cards";
  trial.props.selectedValues = ["open"];
  trial.props.className = "callsite-list";
  const Component = fluentListDefinition.component;
  const markup = renderToStaticMarkup(
    <Component node={trial} emit={() => undefined} children={undefined} />,
  );
  const description = fluentListDefinition.describe();

  assert.deepEqual(description.variants?.map((variant) => variant.value), [
    "standard",
    "selectable",
    "vertical-cards",
  ]);
  assert.match(markup, /class="[^"]*callsite-list/);
  assert.match(markup, /role="listbox"/);
  assert.match(markup, /aria-selected="true"[^>]*>.*Open/);
  assert.doesNotMatch(markup, /type="checkbox"/);
  assert.deepEqual(description.eventContracts?.select.payloadSchema, {
    type: "object",
    additionalProperties: false,
    required: ["values"],
    properties: { values: { type: "array", items: { type: "string" } } },
  });
});

test("Fluent display controls render their native public contracts", () => {
  const definitions = [
    [fluentBadgeDefinition, /Active/],
    [fluentPersonaDefinition, /Ada Lovelace/],
    [fluentSpinnerDefinition, /Loading incident data/],
  ] as const;

  for (const [definition, expected] of definitions) {
    const trial = definition.materializeTrial();
    const Component = definition.component;
    const markup = renderToStaticMarkup(<Component node={trial} emit={() => undefined} children={undefined} />);
    assert.match(markup, expected);
  }

  assert.equal(fluentBadgeDefinition.validate({ label: "Active", color: "made-up" }).ok, false);
  assert.equal(fluentPersonaDefinition.validate({ secondaryText: "Missing name" }).ok, false);
  assert.equal(fluentSpinnerDefinition.validate({ determinate: true }).ok, false);
});

test("Fluent authoring APIs expose complete contracts and scoped agent tools", () => {
  assert.deepEqual(listFluentComponents().map((entry) => entry.id), [
    "badge",
    "button",
    "chips",
    "data-grid",
    "dialog",
    "dropdown",
    "list",
    "panel",
    "persona",
    "searchbox",
    "row",
    "spinner",
    "switch",
    "table",
    "text",
    "tab-bar",
    "text-field",
    "textarea",
    "toolbar",
    "toggle",
  ]);

  const description = describeFluentComponent("dropdown");
  assert.equal(description.capability, "fluent:dropdown");
  assert.equal(description.propsSchema.additionalProperties, false);
  assert.ok(description.authoring.rules.length > 0);

  const trial = materializeFluentComponentTrial("fluent:dropdown");
  assert.equal(validateFluentComponentProps("dropdown", trial.props).ok, true);
  const preflight = preflightFluentComponent("dropdown", trial.props);
  assert.equal(preflight.capability, "fluent:dropdown");
  assert.deepEqual(preflight.declaredEvents, ["select"]);

  const kit = getFluentComponentAgentKit(["button", "fluent:dropdown", "fluent:button"]);
  assert.deepEqual(kit.capabilities, ["fluent:button", "fluent:dropdown"]);
  assert.match(kit.instructions, /^# GIK Fluent Component Authoring/);
  assert.match(kit.instructions, /schemas are closed/);
  assert.match(kit.instructions, /pure ACX authoring operations, not live AX runtime verification/);
  assert.deepEqual(kit.tools.map((tool) => tool.name), [
    "listFluentComponents",
    "describeFluentComponent",
    "validateFluentComponentProps",
    "preflightFluentComponent",
    "materializeFluentComponentTrial",
  ]);
  const describeTool = kit.tools.find((tool) => tool.name === "describeFluentComponent")!;
  assert.throws(
    () => describeTool.handler({ capability: "fluent:toggle" }),
    /Fluent component fluent:toggle is outside this agent kit/,
  );

  assert.equal(createFluentComponentAuthoringTools().length, 5);
  assert.equal(fluentComponentAuthoringTools.length, 5);
  assert.equal(rootEntryPoint.listFluentComponents, listFluentComponents);
  assert.equal(rootEntryPoint.getFluentComponentAgentKit, getFluentComponentAgentKit);
  assert.equal(rootEntryPoint.componentDefinitions.button.capability, "fluent:button");
  assert.equal(rootEntryPoint.componentDefinitions.dropdown.capability, "fluent:dropdown");
});
