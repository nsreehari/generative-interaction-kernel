import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import * as rootEntryPoint from "../src";
import {
  createFluentComponentAuthoringTools,
  describeFluentComponent,
  fluentButtonDefinition,
  fluentChipsDefinition,
  fluentComponentAuthoringTools,
  fluentComponentDefinitions,
  fluentComponentViews,
  fluentDropdownDefinition,
  fluentIconButtonDefinition,
  fluentSearchboxDefinition,
  fluentSwitchDefinition,
  fluentTabBarDefinition,
  fluentTextFieldDefinition,
  fluentTextareaDefinition,
  fluentToggleDefinition,
  getFluentComponentAgentKit,
  listFluentComponents,
  materializeFluentComponentTrial,
  preflightFluentComponent,
  validateFluentComponentProps,
} from "../src/fluent";

test("fluent entrypoint exposes all views and closed definitions", () => {
  const controls = ["button", "chips", "dropdown", "icon-button", "searchbox", "switch", "tab-bar", "text-field", "textarea", "toggle"];
  const events: Record<string, string> = {
    button: "press",
    chips: "remove",
    dropdown: "select",
    "icon-button": "press",
    searchbox: "submit",
    switch: "toggle",
    "tab-bar": "select",
    "text-field": "input",
    textarea: "input",
    toggle: "toggle",
  };
  assert.deepEqual(Object.keys(fluentComponentViews).sort(), controls);
  assert.deepEqual(Object.keys(fluentComponentDefinitions).sort(), controls);

  for (const [name, definition] of Object.entries(fluentComponentDefinitions)) {
    const trial = definition.materializeTrial();
    assert.equal(definition.validate(trial.props).ok, true);
    assert.equal(definition.validate({ ...trial.props, unknown: true }).ok, false);
    assert.deepEqual(definition.events, [events[name]]);
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
  assert.match(dropdownMarkup, /class="[^"]*gx-fluent-dropdown/);
  assert.match(dropdownMarkup, /role="combobox"/);
  assert.match(dropdownMarkup, /Investigation/);
  assert.match(dropdownMarkup, /Governed SOC investigation/);

  const switchTrial = fluentSwitchDefinition.materializeTrial();
  const SwitchComponent = fluentSwitchDefinition.component;
  const switchMarkup = renderToStaticMarkup(
    <SwitchComponent node={switchTrial} emit={() => undefined} children={undefined} />,
  );
  assert.match(switchMarkup, /class="[^"]*gx-fluent-switch/);
  assert.match(switchMarkup, /role="switch"/);
  assert.match(switchMarkup, /checked=""/);

  const toggleTrial = fluentToggleDefinition.materializeTrial();
  const ToggleComponent = fluentToggleDefinition.component;
  const toggleMarkup = renderToStaticMarkup(
    <ToggleComponent node={toggleTrial} emit={() => undefined} children={undefined} />,
  );
  assert.match(toggleMarkup, /class="[^"]*gx-fluent-toggle/);
  assert.match(toggleMarkup, /aria-pressed="true"/);
  assert.match(toggleMarkup, /min-width:72px/);
});

test("FluentButton renders its public trial and forwards root styling", () => {
  const trial = fluentButtonDefinition.materializeTrial();
  trial.props.className = "callsite-button";
  trial.props.style = { minWidth: 120 };
  const Component = fluentButtonDefinition.component;
  const markup = renderToStaticMarkup(<Component node={trial} emit={() => undefined} children={undefined} />);

  assert.match(markup, /class="[^"]*gx-fluent-button[^"]*callsite-button/);
  assert.match(markup, /style="min-width:120px"/);
  assert.match(markup, />Analyze report<\/button>/);
});

test("FluentIconButton renders a declared icon and accessible name", () => {
  const trial = fluentIconButtonDefinition.materializeTrial();
  const Component = fluentIconButtonDefinition.component;
  const markup = renderToStaticMarkup(<Component node={trial} emit={() => undefined} children={undefined} />);

  assert.match(markup, /class="[^"]*gx-fluent-icon-button/);
  assert.match(markup, /aria-label="Enter full screen"/);
  assert.match(markup, /title="Enter full screen"/);
  assert.match(markup, /<svg/);
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

test("Fluent authoring APIs expose complete contracts and scoped agent tools", () => {
  assert.deepEqual(listFluentComponents().map((entry) => entry.id), [
    "button",
    "chips",
    "dropdown",
    "icon-button",
    "searchbox",
    "switch",
    "tab-bar",
    "text-field",
    "textarea",
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
