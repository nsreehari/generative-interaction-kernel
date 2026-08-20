import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import {
  PaneWithTrigger,
  paneWithTriggerDefinition,
  materializePaneWithTriggerTrial,
} from "../src/shared";

test("drawer renders every authored child inside its single panel", () => {
  const node = materializePaneWithTriggerTrial();
  node.props.fabPosition = "top-right";

  const markup = renderToStaticMarkup(
    <PaneWithTrigger node={node} emit={() => {}}>
      <span>First child</span>
      <span>Second child</span>
    </PaneWithTrigger>,
  );

  assert.match(markup, /First child/);
  assert.match(markup, /Second child/);
  assert.doesNotMatch(markup, /<main/);
});

test("pane with trigger exposes closed drawer and dialog-modal variants", () => {
  assert.equal(paneWithTriggerDefinition.capability, "primitive:pane-with-trigger");
  assert.equal(paneWithTriggerDefinition.defaultVariant, "drawer");
  assert.deepEqual(paneWithTriggerDefinition.variants.map(({ value }) => value), ["drawer", "dialog-modal"]);
  assert.deepEqual(paneWithTriggerDefinition.slots, ["children"]);
  assert.equal(paneWithTriggerDefinition.validate({
    variant: "drawer",
    title: "Sources",
    fabPosition: "bottom-left",
    defaultOpen: false,
  }).ok, true);
  assert.equal(paneWithTriggerDefinition.validate({
    variant: "dialog-modal",
    title: "Create Blueprint",
    triggerLabel: "New Blueprint",
    closeLabel: "Close",
  }).ok, true);
  assert.equal(paneWithTriggerDefinition.validate({
    variant: "dialog-modal",
    title: "Create Blueprint",
  }).ok, false);
  assert.equal(paneWithTriggerDefinition.validate({
    variant: "drawer",
    title: "Sources",
    layout: { slots: [{ key: "content", slot: "children", unknown: true }] },
  }).ok, false);
});

test("pane with trigger remains optionally controlled", () => {
  const node = materializePaneWithTriggerTrial();
  node.props.defaultOpen = true;
  node.props.open = false;

  const markup = renderToStaticMarkup(
    <PaneWithTrigger node={node} emit={() => {}}>
      <span>Controlled content</span>
    </PaneWithTrigger>,
  );

  assert.doesNotMatch(markup, /Controlled content/);
  assert.match(markup, /aria-expanded="false"/);
});

test("dialog-modal renders its labeled trigger and closed modal surface", () => {
  const node = materializePaneWithTriggerTrial();
  node.props.variant = "dialog-modal";
  node.props.defaultOpen = false;
  node.props.triggerLabel = "New Blueprint";
  node.props.closeLabel = "Close new Blueprint form";

  const markup = renderToStaticMarkup(
    <PaneWithTrigger node={node} emit={() => {}}>
      <span>Blueprint form</span>
    </PaneWithTrigger>,
  );

  assert.match(markup, />New Blueprint<\/button>/);
  assert.doesNotMatch(markup, /Blueprint form/);
});