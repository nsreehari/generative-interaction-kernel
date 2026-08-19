import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import {
  Drawer,
  drawerDefinition,
  materializeDrawerTrial,
} from "../src/shared";

test("panel-vertical renders every authored child inside its single drawer panel", () => {
  const node = materializeDrawerTrial();
  node.props.fabPosition = "top-right";

  const markup = renderToStaticMarkup(
    <Drawer node={node} emit={() => {}}>
      <span>First child</span>
      <span>Second child</span>
    </Drawer>,
  );

  assert.match(markup, /First child/);
  assert.match(markup, /Second child/);
  assert.doesNotMatch(markup, /<main/);
});

test("drawer exposes panel-vertical under primitive:drawer", () => {
  assert.equal(drawerDefinition.capability, "primitive:drawer");
  assert.equal(drawerDefinition.defaultVariant, "panel-vertical");
  assert.deepEqual(drawerDefinition.slots, ["children"]);
  assert.equal(drawerDefinition.validate({
    variant: "panel-vertical",
    fabPosition: "bottom-left",
    defaultOpen: false,
  }).ok, true);
  assert.equal(drawerDefinition.validate({
    variant: "panel-vertical",
    layout: { slots: [{ key: "content", slot: "children", unknown: true }] },
  }).ok, false);
});

test("drawer remains optionally controlled", () => {
  const node = materializeDrawerTrial();
  node.props.defaultOpen = true;
  node.props.open = false;

  const markup = renderToStaticMarkup(
    <Drawer node={node} emit={() => {}}>
      <span>Controlled content</span>
    </Drawer>,
  );

  assert.doesNotMatch(markup, /Controlled content/);
  assert.match(markup, /aria-expanded="false"/);
});